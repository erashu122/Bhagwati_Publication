import { randomUUID } from 'node:crypto';
import express from 'express';
import type { Request } from 'express';
import type { Customer, Ebook, Review } from '../../shared/store.ts';
import type { StoreDatabase } from './database-driver.ts';
import { bookId } from './catalog.ts';
import { field, record, RequestError, uuidField } from './validation.ts';

export function readingRouter(
  db: StoreDatabase,
  signedIn: (request: Request) => Promise<Customer | null>,
  requireCustomer: (request: Request, operator?: boolean) => Promise<Customer>
) {
  const router = express.Router();
  const json = express.json({ limit: '8kb' });

  router.get('/library', async (request, response) => {
    const customer = await requireCustomer(request);
    const { rows: books } = await db.query<Ebook>(`
      SELECT DISTINCT p.book_id AS id, b.title, e.book_id IS NOT NULL AS available
        FROM paid_books p JOIN books b ON b.id = p.book_id LEFT JOIN ebook_files e ON e.book_id = b.id
       WHERE p.customer_id=$1 AND p.format='eBook' ORDER BY b.title, p.book_id
    `, [customer.id]);
    response.json({ books });
  });

  router.get('/library/:id/download', async (request, response) => {
    const customer = await requireCustomer(request);
    const id = bookId(request.params.id);
    const { rows: [file] } = await db.query<{ bytes: Uint8Array }>(`
      SELECT e.bytes FROM ebook_files e WHERE e.book_id=$1 AND EXISTS (
        SELECT 1 FROM paid_books p WHERE p.book_id=e.book_id AND p.customer_id=$2 AND p.format='eBook'
      )
    `, [id, customer.id]);
    if (!file) throw new RequestError(404, 'This eBook is not available in your library.');
    response.set('Content-Security-Policy', "default-src 'none'; sandbox").type('pdf').attachment(id + '.pdf').send(Buffer.from(file.bytes));
  });

  router.get('/publisher/ebooks', async (request, response) => {
    await requireCustomer(request, true);
    const { rows: books } = await db.query<Ebook>(`
      SELECT b.id, b.title, e.book_id IS NOT NULL AS available FROM books b
      LEFT JOIN ebook_files e ON e.book_id = b.id WHERE b.format='eBook' OR e.book_id IS NOT NULL ORDER BY b.title
    `);
    response.json({ books });
  });

  router.patch('/publisher/ebooks/:id', async (request, _response, next) => {
    await requireCustomer(request, true);
    next();
  }, express.raw({ type: 'application/pdf', limit: 4000000, inflate: false }), async (request, response) => {
    const id = bookId(request.params.id);
    const bytes = request.body;
    if (!Buffer.isBuffer(bytes) || bytes.length < 8 || !bytes.subarray(0, 8).toString('ascii').match(/^%PDF-\d\.\d$/)) {
      throw new RequestError(400, 'Choose a PDF up to 4 MB.');
    }
    const { rows } = await db.query(`
      INSERT INTO ebook_files (book_id, bytes)
      SELECT id,$2 FROM books WHERE id=$1 AND (format='eBook' OR EXISTS (SELECT 1 FROM ebook_files WHERE book_id=$1))
      ON CONFLICT (book_id) DO UPDATE SET bytes=EXCLUDED.bytes RETURNING book_id
    `, [id, bytes]);
    if (!rows.length) throw new RequestError(404, 'eBook not found.');
    response.json({ ok: true });
  });

  router.get('/books/:id/reviews', async (request, response) => {
    const id = bookId(request.params.id);
    const customer = await signedIn(request);
    const { rows: reviews } = await db.query<Review>(`
      SELECT r.id, r.book_id AS "bookId", split_part(btrim(c.full_name), ' ', 1) AS reviewer, r.rating, r.comment, r.approved
        FROM book_reviews r JOIN customers c ON c.id=r.customer_id JOIN books b ON b.id=r.book_id
       WHERE r.book_id=$1 AND b.published AND r.approved
         AND EXISTS (SELECT 1 FROM paid_books p WHERE p.book_id=r.book_id AND p.customer_id=r.customer_id)
       ORDER BY r.id LIMIT 100
    `, [id]);
    const { rows: [state] } = await db.query<{ canReview: boolean; own: { rating: number; comment: string; approved: boolean } | null }>(`
      SELECT EXISTS(SELECT 1 FROM paid_books p JOIN books b ON b.id=p.book_id WHERE p.book_id=$1 AND p.customer_id=$2 AND b.published) AS "canReview",
        (SELECT jsonb_build_object('rating', rating, 'comment', comment, 'approved', approved) FROM book_reviews WHERE book_id=$1 AND customer_id=$2) AS own
    `, [id, customer?.id ?? null]);
    response.json({ reviews, ...state });
  });

  router.post('/books/:id/reviews', json, async (request, response) => {
    const customer = await requireCustomer(request);
    const id = bookId(request.params.id);
    const body = record(request.body);
    const { rating } = body;
    if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new RequestError(400, 'Select a rating from 1 to 5.');
    }
    const comment = field(body.comment, 'review', 1500);
    const { rows } = await db.query(`
      INSERT INTO book_reviews (id,book_id,customer_id,rating,comment)
      SELECT $1,$2,$3,$4,$5 WHERE EXISTS (
        SELECT 1 FROM paid_books p JOIN books b ON b.id=p.book_id WHERE p.book_id=$2 AND p.customer_id=$3 AND b.published
      )
      ON CONFLICT (book_id,customer_id) DO UPDATE SET rating=EXCLUDED.rating,comment=EXCLUDED.comment,approved=FALSE
      RETURNING id
    `, [randomUUID(), id, customer.id, rating, comment]);
    if (!rows.length) throw new RequestError(403, 'Only customers with a paid order for this book can review it.');
    response.json({ ok: true });
  });

  router.get('/publisher/reviews', async (request, response) => {
    await requireCustomer(request, true);
    const { rows: reviews } = await db.query<Review>(`
      SELECT r.id,r.book_id AS "bookId",b.title,c.full_name AS reviewer,r.rating,r.comment,r.approved
        FROM book_reviews r JOIN books b ON b.id=r.book_id JOIN customers c ON c.id=r.customer_id
       ORDER BY r.approved,r.id
    `);
    response.json({ reviews });
  });

  router.patch('/publisher/reviews/:id', json, async (request, response) => {
    await requireCustomer(request, true);
    const id = uuidField(request.params.id);
    const { approved, rating, comment } = record(request.body);
    if (typeof approved !== 'boolean') throw new RequestError(400, 'Choose whether to publish this review.');
    const { rows } = await db.query(
      'UPDATE book_reviews SET approved=$2 WHERE id=$1 AND rating=$3 AND comment=$4 RETURNING id', [id, approved, rating, comment]
    );
    if (!rows.length) throw new RequestError(409, 'The review changed. Refresh before publishing.');
    response.json({ ok: true });
  });
  return router;
}
