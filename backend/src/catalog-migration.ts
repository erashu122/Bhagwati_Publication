import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { DatabaseExecutor } from './database-driver.ts';
import { author, categories, seedBooks } from '../../shared/books.ts';
import { defaultContent } from '../../shared/content.ts';
import { readingPreviewSeeds } from './reading-preview-seeds.ts';

export async function migrateCatalog(tx: DatabaseExecutor, seed: boolean) {
  await tx.exec(`
    CREATE TABLE IF NOT EXISTS store_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  const applied = await tx.query("INSERT INTO store_migrations (name) VALUES ('catalog-v1') ON CONFLICT DO NOTHING RETURNING name");
  if (!applied.rows.length) return;

  await tx.exec(`
    CREATE TABLE categories (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
      description TEXT NOT NULL DEFAULT '',
      revision INTEGER NOT NULL DEFAULT 1
    );
    CREATE UNIQUE INDEX categories_name_unique ON categories (lower(name));

    CREATE TABLE books (
      id TEXT PRIMARY KEY CHECK (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
      title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 180),
      author TEXT NOT NULL CHECK (length(author) BETWEEN 1 AND 100),
      format TEXT NOT NULL CHECK (format IN ('eBook', 'Paperback', 'Hardcover')),
      language TEXT NOT NULL CHECK (length(language) BETWEEN 1 AND 60),
      description TEXT NOT NULL DEFAULT '',
      price INTEGER CHECK (price BETWEEN 0 AND 1000000),
      stock INTEGER CHECK (stock BETWEEN 0 AND 1000000000),
      published BOOLEAN NOT NULL DEFAULT FALSE,
      featured BOOLEAN NOT NULL DEFAULT FALSE,
      cover_title TEXT NOT NULL,
      cover_subtitle TEXT,
      artwork TEXT NOT NULL CHECK (artwork IN ('orbit', 'sun', 'scale', 'sprig', 'tower', 'boxes', 'gavel', 'arch')),
      palette TEXT NOT NULL CHECK (palette IN ('green', 'wine', 'ink', 'sand', 'teal', 'clay', 'plum', 'slate')),
      cover_url TEXT,
      position INTEGER GENERATED ALWAYS AS IDENTITY UNIQUE,
      revision INTEGER NOT NULL DEFAULT 1,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX books_category_idx ON books (category_id);
    CREATE INDEX books_public_idx ON books (featured DESC, position) WHERE published;

    CREATE TABLE book_covers (
      book_id TEXT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
      media_type TEXT NOT NULL CHECK (media_type IN ('image/jpeg', 'image/png', 'image/webp')),
      bytes BYTEA NOT NULL CHECK (octet_length(bytes) BETWEEN 12 AND 1048576)
    );

    CREATE TABLE store_content (
      singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
      content JSONB NOT NULL CHECK (jsonb_typeof(content) = 'object'),
      revision INTEGER NOT NULL DEFAULT 1
    );
    ALTER TABLE orders ADD COLUMN reserved_inventory JSONB;
  `);

  if (!seed) return;
  const descriptions = ['Practical ideas for work', 'People, purpose and change', 'Questions shaping the future', 'कहानियाँ और संवेदनाएँ'];
  for (const [index, category] of categories.entries()) {
    await tx.query('INSERT INTO categories (name, description) VALUES ($1, $2)', [category, descriptions[index]]);
  }
  for (const [index, book] of seedBooks.entries()) {
    await tx.query(
      `INSERT INTO books (id, category_id, title, author, format, language, description, price, published, featured, cover_title, cover_subtitle, artwork, palette, cover_url)
       SELECT $1, id, $3, $4, $5, $6, $7, $8, TRUE, $9, $10, $11, $12, $13, $14 FROM categories WHERE name = $2`,
      [book.id, book.category, book.title, author, book.format, book.language, book.description, book.price, index < 4, book.coverTitle, book.coverSubtitle ?? null, book.artwork, book.palette, book.coverImage ?? null]
    );
  }
  await tx.query('INSERT INTO store_content (content) VALUES ($1)', [JSON.stringify(defaultContent)]);
}

export async function migrateAuthorPortrait(tx: DatabaseExecutor, seed: boolean) {
  const { rows } = await tx.query(
    "INSERT INTO store_migrations (name) VALUES ('author-portrait-v1') ON CONFLICT DO NOTHING RETURNING name"
  );
  if (!rows.length) return;

  await tx.exec(`
    CREATE TABLE author_portrait (
      singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton) REFERENCES store_content(singleton),
      media_type TEXT NOT NULL CHECK (media_type IN ('image/jpeg', 'image/png', 'image/webp')),
      bytes BYTEA NOT NULL CHECK (octet_length(bytes) BETWEEN 12 AND 1048576)
    );
  `);
  if (!seed) return;
  const bytes = await readFile(resolve('assets/author-saraswat.png'));
  await tx.query(
    "INSERT INTO author_portrait (media_type, bytes) SELECT 'image/png', $1 FROM store_content WHERE lower(btrim(content->>'authorName')) = lower($2)",
    [bytes, author]
  );
}

export async function seedReadingPreviews(tx: DatabaseExecutor) {
  for (const preview of readingPreviewSeeds) {
    const book = seedBooks.find(book => book.id === preview.id);
    if (!book) continue;
    await tx.query(
      'UPDATE books SET reading_preview=$1, reading_preview_kind=$2, revision=revision+1 WHERE id=$3 AND title=$4 AND reading_preview IS NULL',
      [preview.text, preview.kind, preview.id, book.title]
    );
  }
}

export async function migrateReadingPreviews(tx: DatabaseExecutor, seed: boolean) {
  const { rows } = await tx.query(
    "INSERT INTO store_migrations (name) VALUES ('reading-preview-v1') ON CONFLICT DO NOTHING RETURNING name"
  );
  if (!rows.length) return;

  await tx.exec(`
    ALTER TABLE books ADD COLUMN reading_preview TEXT CHECK (length(reading_preview) <= 6000);
    ALTER TABLE books ADD COLUMN reading_preview_kind TEXT CHECK (reading_preview_kind IN ('overview', 'story', 'excerpt'));
  `);
  if (seed) await seedReadingPreviews(tx);
}
