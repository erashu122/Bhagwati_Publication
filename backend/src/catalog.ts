import { randomUUID } from 'node:crypto';
import type { DatabaseExecutor, StoreDatabase } from './database-driver.ts';
import express from 'express';
import type { Request, RequestHandler } from 'express';
import { bookArtworks, bookFormats, bookPalettes, canOrder, readingPreviewKinds, readingPreviewMaxLength } from '../../shared/books.ts';
import type { Book, Category } from '../../shared/books.ts';
import { contentFields } from '../../shared/content.ts';
import type { ContentRecord, StoreContent } from '../../shared/content.ts';
import { field, record, RequestError } from './validation.ts';
import { notifyBook } from './customer-features.ts';

const bookIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function bookId(value: unknown): string {
  if (typeof value !== 'string' || value.length > 80 || !bookIdPattern.test(value)) {
    throw new RequestError(400, 'Invalid book reference.');
  }
  return value;
}

export function optionalInteger(value: unknown, label: string, max: number): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > max) {
    throw new RequestError(400, `Enter a whole number from 0 to ${max} for ${label}, or leave it blank.`);
  }
  return value;
}

function positiveInteger(value: unknown, label: string) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 2147483647) {
    throw new RequestError(400, `Invalid ${label}.`);
  }
  return value;
}

function optionalText(value: unknown, label: string, max: number) {
  return value === '' ? '' : field(value, label, max);
}

function imageFile(value: unknown) {
  if (value === undefined || value === null) return value;
  const { type, data } = record(value);
  if (typeof data !== 'string' || data.length > 1398104 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data) || data.length % 4 !== 0) {
    throw new RequestError(400, 'Upload a JPG, PNG or WebP file up to 1 MB.');
  }
  const bytes = Buffer.from(data, 'base64');
  const valid = bytes.length >= 12 && bytes.length <= 1048576 && (
    (type === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (type === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) ||
    (type === 'image/webp' && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP')
  );
  if (!valid) throw new RequestError(400, 'Upload a valid JPG, PNG or WebP file up to 1 MB.');
  return { type, bytes };
}

async function listBooks(db: DatabaseExecutor, publishedOnly: boolean) {
  const { rows } = await db.query<Book & { componentIds: string[] | null }>(`
    SELECT b.id, b.title, b.author, b.category_id AS "categoryId", c.name AS category, b.format, b.language,
           b.description, COALESCE(b.reading_preview, '') AS "readingPreview",
           COALESCE(b.reading_preview_kind, 'overview') AS "readingPreviewKind",
           b.price, b.stock, b.published, b.featured, b.cover_title AS "coverTitle",
           b.cover_subtitle AS "coverSubtitle", b.artwork, b.palette, b.revision, b.component_ids AS "componentIds",
           CASE WHEN bc.book_id IS NULL THEN b.cover_url
                ELSE '/api/catalog/covers/' || b.id || '?v=' || b.revision END AS "coverImage"
      FROM books b JOIN categories c ON c.id = b.category_id
      LEFT JOIN book_covers bc ON bc.book_id = b.id
     WHERE ($1 = FALSE OR b.published)
     ORDER BY b.featured DESC, b.position
  `, [publishedOnly]);
  const byId = new Map(rows.map(book => [book.id, book]));
  return rows.map(({ componentIds, ...book }) => {
    if (!componentIds) return book;
    const members = componentIds.map(id => byId.get(id));
    const available = members.length >= 2 && members.every(canOrder);
    const stocks = members.flatMap(member => member?.stock == null ? [] : [member.stock]);
    return {
      ...book, stock: !available ? 0 : stocks.length ? Math.min(...stocks) : null,
      bundle: members.flatMap(member => member ? [{ id: member.id, title: member.title, format: member.format }] : [])
    };
  });
}

async function snapshot(db: StoreDatabase, publishedOnly: boolean) {
  return db.transaction(async tx => {
    await tx.exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const books = await listBooks(tx, publishedOnly);
    const { rows: categories } = await tx.query<Category>('SELECT id, name, description, revision FROM categories ORDER BY id');
    const { rows: [content] } = await tx.query<ContentRecord>(`
      SELECT s.content, s.revision,
             CASE WHEN p.singleton THEN '/api/catalog/author-photo?v=' || s.revision END AS "authorPhoto"
        FROM store_content s LEFT JOIN author_portrait p USING (singleton)
       WHERE s.singleton
    `);
    return { books, categories, ...content };
  });
}

function stale() {
  return new RequestError(409, 'This record changed since you opened it. Refresh the dashboard and review the latest version.');
}

async function saveContent(db: StoreDatabase, revision: number, values: Partial<StoreContent>, photo?: ReturnType<typeof imageFile>) {
  return db.transaction(async tx => {
    const { rows: [current] } = await tx.query<Pick<ContentRecord, 'content' | 'revision'>>(
      'SELECT content, revision FROM store_content WHERE singleton FOR UPDATE'
    );
    if (current.revision !== revision) throw stale();

    const content = { ...current.content, ...values };
    if (content.authorName !== current.content.authorName) {
      await tx.query(`
        UPDATE books SET author=$1, revision=revision+1, updated_at=NOW()
         WHERE lower(btrim(author)) = lower($2)
      `, [content.authorName, current.content.authorName]);
    }
    if (photo === null) await tx.query('DELETE FROM author_portrait WHERE singleton');
    if (photo) {
      await tx.query(`
        INSERT INTO author_portrait (media_type, bytes) VALUES ($1, $2)
        ON CONFLICT (singleton) DO UPDATE SET media_type=EXCLUDED.media_type, bytes=EXCLUDED.bytes
      `, [photo.type, photo.bytes]);
    }
    const { rows: [updated] } = await tx.query<{ revision: number }>(
      'UPDATE store_content SET content=$1, revision=revision+1 WHERE singleton RETURNING revision',
      [JSON.stringify(content)]
    );
    return updated;
  });
}

export function catalogRouter(db: StoreDatabase, requireOperator: (request: Request) => Promise<unknown>) {
  const router = express.Router();
  router.get('/catalog', async (_request, response) => {
    response.json(await snapshot(db, true));
  });

  router.get('/catalog/author-photo', async (_request, response) => {
    const { rows: [photo] } = await db.query<{ mediaType: string; bytes: Uint8Array }>(
      'SELECT media_type AS "mediaType", bytes FROM author_portrait WHERE singleton'
    );
    if (!photo) throw new RequestError(404, 'Author photo not found.');
    response.set('Content-Security-Policy', "default-src 'none'");
    response.type(photo.mediaType).send(Buffer.from(photo.bytes));
  });

  router.get('/catalog/covers/:id', async (request, response) => {
    const id = bookId(request.params.id);
    const { rows: [cover] } = await db.query<{ mediaType: string; bytes: Uint8Array; published: boolean }>(
      'SELECT media_type AS "mediaType", bytes, published FROM book_covers JOIN books ON id = book_id WHERE book_id = $1', [id]
    );
    if (!cover) throw new RequestError(404, 'Cover not found.');
    if (!cover.published) await requireOperator(request);
    response.set('Content-Security-Policy', "default-src 'none'");
    response.type(cover.mediaType).send(Buffer.from(cover.bytes));
  });

  router.use('/publisher/catalog', async (request, _response, next) => {
    await requireOperator(request);
    next();
  }, express.json({ limit: '1500kb', inflate: false }));
  router.get('/publisher/catalog', async (_request, response) => {
    response.json(await snapshot(db, false));
  });

  const saveBook: RequestHandler = async (request, response) => {
    const editing = request.method === 'PATCH';
    const id = editing ? bookId(request.params.id) : randomUUID();
    const body = record(request.body);
    const title = field(body.title, 'book title', 180);
    const author = field(body.author, 'author', 100);
    const category = positiveInteger(body.categoryId, 'category');
    const format = bookFormats.find(format => format === body.format);
    const palette = bookPalettes.find(palette => palette === body.palette);
    const artwork = bookArtworks.find(artwork => artwork === body.artwork);
    if (!format || !palette || !artwork || typeof body.published !== 'boolean' || typeof body.featured !== 'boolean') {
      throw new RequestError(400, 'Choose a format, cover style and visibility.');
    }
    const language = field(body.language, 'language', 60);
    const description = optionalText(body.description, 'book description', 3000);
    const preview = body.readingPreview === undefined ? null : optionalText(
      typeof body.readingPreview === 'string' ? body.readingPreview.trim() : body.readingPreview,
      'reading preview', readingPreviewMaxLength
    );
    const previewKind = body.readingPreviewKind ?? null;
    if (previewKind !== null && (typeof previewKind !== 'string' || !Object.hasOwn(readingPreviewKinds, previewKind))) {
      throw new RequestError(400, 'Choose a valid reading preview type.');
    }
    const price = optionalInteger(body.price, 'price', 1000000);
    const stock = optionalInteger(body.stock, 'stock', 1000000000);
    const coverTitle = optionalText(body.coverTitle, 'cover title', 180) || title;
    const coverSubtitle = optionalText(body.coverSubtitle, 'cover subtitle', 180) || null;
    const cover = imageFile(body.cover);
    const params = [id, category, title, author, format, language, description, price, stock, body.published, body.featured, coverTitle, coverSubtitle, artwork, palette];
    await db.transaction(async tx => {
      const result = await tx.query('SELECT id FROM categories WHERE id = $1 FOR KEY SHARE', [category]);
      if (!result.rows.length) throw new RequestError(400, 'Choose an existing category.');
      const previous = editing && (await tx.query<{ published: boolean }>('SELECT published FROM books WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (editing) {
        const { rows } = await tx.query(`
          UPDATE books SET category_id=$2, title=$3, author=$4, format=$5, language=$6, description=$7,
                 price=$8, stock=$9, published=$10, featured=$11, cover_title=$12, cover_subtitle=$13,
                 artwork=$14, palette=$15, cover_url=CASE WHEN $17 THEN NULL ELSE cover_url END,
                 reading_preview=COALESCE($18, reading_preview), reading_preview_kind=COALESCE($19, reading_preview_kind),
                 updated_at=NOW(), revision=revision+1
           WHERE id=$1 AND revision=$16 AND format <> 'Bundle' RETURNING id
        `, [...params, positiveInteger(body.revision, 'revision'), cover !== undefined, preview, previewKind]);
        if (!rows.length) throw stale();
      } else {
        await tx.query(`
          INSERT INTO books (id, category_id, title, author, format, language, description, price, stock, published, featured, cover_title, cover_subtitle, artwork, palette, reading_preview, reading_preview_kind)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        `, [...params, preview ?? '', previewKind ?? 'overview']);
      }
      if (body.published && (!previous || !previous.published)) await notifyBook(tx, id, title);
      if (cover === null) await tx.query('DELETE FROM book_covers WHERE book_id = $1', [id]);
      if (cover) {
        await tx.query(`
          INSERT INTO book_covers (book_id, media_type, bytes) VALUES ($1,$2,$3)
          ON CONFLICT (book_id) DO UPDATE SET media_type=EXCLUDED.media_type, bytes=EXCLUDED.bytes
        `, [id, cover.type, cover.bytes]);
      }
    });
    response.status(editing ? 200 : 201).json({ id });
  };

  router.post('/publisher/catalog/books', saveBook);
  router.patch('/publisher/catalog/books/:id', saveBook);

  const saveBundle: RequestHandler = async (request, response) => {
    const editing = request.method === 'PATCH';
    const id = editing ? bookId(request.params.id) : randomUUID();
    const body = record(request.body);
    const title = field(body.title, 'bundle title', 180);
    const description = field(body.description, 'bundle description', 3000);
    const category = positiveInteger(body.categoryId, 'category');
    const price = positiveInteger(body.price, 'bundle price');
    if (price > 1000000 || typeof body.published !== 'boolean' || !Array.isArray(body.bookIds)) {
      throw new RequestError(400, 'Choose a valid price, visibility and books.');
    }
    const ids = [...new Set(body.bookIds.map(bookId))];
    if (ids.length < 2 || ids.length > 10) throw new RequestError(400, 'Choose between two and ten different books.');
    await db.transaction(async tx => {
      const members = await tx.query("SELECT id FROM books WHERE id = ANY($1::text[]) AND format <> 'Bundle'", [ids]);
      if (members.rows.length !== ids.length) throw new RequestError(400, 'Choose books from the catalogue.');
      const group = await tx.query('SELECT id FROM categories WHERE id = $1 FOR KEY SHARE', [category]);
      if (!group.rows.length) throw new RequestError(400, 'Choose an existing category.');
      if (editing) {
        const result = await tx.query(`
          UPDATE books SET title=$2, cover_title=$2, description=$3, category_id=$4, price=$5,
                 published=$6, component_ids=$7, revision=revision+1, updated_at=NOW()
           WHERE id=$1 AND revision=$8 AND format='Bundle' RETURNING id
        `, [id, title, description, category, price, body.published, ids, positiveInteger(body.revision, 'revision')]);
        if (!result.rows.length) throw stale();
      } else {
        await tx.query(`
          INSERT INTO books (id, title, cover_title, description, category_id, price, published, component_ids, format, language, author, artwork, palette)
          VALUES ($1,$2,$2,$3,$4,$5,$6,$7,'Bundle','Multiple','Bhagwati Publications','boxes','slate')
        `, [id, title, description, category, price, body.published, ids]);
        if (body.published) await notifyBook(tx, id, title);
      }
    });
    response.status(editing ? 200 : 201).json({ id });
  };
  router.post('/publisher/catalog/bundles', saveBundle);
  router.patch('/publisher/catalog/bundles/:id', saveBundle);

  router.patch('/publisher/catalog/books/:id/visibility', async (request, response) => {
    const id = bookId(request.params.id);
    const body = record(request.body);
    if (typeof body.published !== 'boolean') throw new RequestError(400, 'Choose book visibility.');
    await db.transaction(async tx => {
      const { rows: [previous] } = await tx.query<{ published: boolean; title: string }>(
        'SELECT published, title FROM books WHERE id=$1 AND revision=$2 FOR UPDATE',
        [id, positiveInteger(body.revision, 'revision')]
      );
      if (!previous) throw stale();
      await tx.query('UPDATE books SET published=$2, revision=revision+1, updated_at=NOW() WHERE id=$1', [id, body.published]);
      if (body.published && !previous.published) await notifyBook(tx, id, previous.title);
    });
    response.json({ id });
  });

  const saveCategory: RequestHandler = async (request, response) => {
    const body = record(request.body);
    const name = field(body.name, 'category name', 80);
    const description = optionalText(body.description, 'category description', 250);
    const editing = request.method === 'PATCH';
    try {
      const { rows: [category] } = editing
        ? await db.query<Category>('UPDATE categories SET name=$1, description=$2, revision=revision+1 WHERE id=$3 AND revision=$4 RETURNING id',
            [name, description, positiveInteger(Number(request.params.id), 'category'), positiveInteger(body.revision, 'revision')])
        : await db.query<Category>('INSERT INTO categories (name, description) VALUES ($1,$2) RETURNING id', [name, description]);
      if (!category) throw stale();
      response.status(editing ? 200 : 201).json({ id: category.id });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new RequestError(409, 'A category with that name already exists.');
      throw error;
    }
  };

  router.post('/publisher/catalog/categories', saveCategory);
  router.patch('/publisher/catalog/categories/:id', saveCategory);
  router.delete('/publisher/catalog/categories/:id', async (request, response) => {
    const id = positiveInteger(Number(request.params.id), 'category');
    const revision = positiveInteger(record(request.body).revision, 'revision');
    try {
      const { rows } = await db.query('DELETE FROM categories WHERE id=$1 AND revision=$2 RETURNING id', [id, revision]);
      if (!rows.length) throw stale();
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === '23503' || code === '23001') throw new RequestError(409, 'Move the books in this category before deleting it.');
      throw error;
    }
    response.json({ id });
  });

  router.patch('/publisher/catalog/content', async (request, response) => {
    const body = record(request.body);
    const values = record(body.content);
    const content = Object.fromEntries(contentFields.map(({ key, label, max }) => [
      key, key === 'announcement' || key === 'heroAccent' ? optionalText(values[key], label, max) : field(values[key], label, max)
    ]));
    response.json(await saveContent(db, positiveInteger(body.revision, 'revision'), content));
  });

  router.patch('/publisher/catalog/author', async (request, response) => {
    const body = record(request.body);
    const values = {
      authorName: field(body.authorName, 'author name', 100),
      authorBio: field(body.authorBio, 'author biography', 800)
    };
    response.json(await saveContent(db, positiveInteger(body.revision, 'revision'), values, imageFile(body.photo)));
  });

  return router;
}
