import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { Request } from 'express';
import type { Coupon, Customer, StoreNotification } from '../../shared/store.ts';
import type { DatabaseExecutor, StoreDatabase } from './database-driver.ts';
import { field, record, RequestError } from './validation.ts';

export function couponCode(value: unknown) {
  const code = field(value, 'coupon code', 24).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{2,23}$/.test(code)) throw new RequestError(400, 'Use 3–24 letters, digits or hyphens for a coupon code.');
  return code;
}

export async function notifyBook(tx: DatabaseExecutor, id: string, title: string) {
  await tx.query(`
    INSERT INTO notifications (id, book_id, title, message)
    VALUES ($1, $2, 'New book', $3) ON CONFLICT (id) DO NOTHING
  `, ['book:' + id, id, title]);
}

export async function notifyOrder(tx: DatabaseExecutor, customerId: string, orderId: string, title: string, message: string) {
  await tx.query(`
    INSERT INTO notifications (id, customer_id, order_id, title, message) VALUES ($1, $2, $3, $4, $5)
  `, [randomUUID(), customerId, orderId, title, message]);
}

const visibleNotifications = `
  (n.customer_id IS NULL OR n.customer_id = $1)
  AND (n.book_id IS NULL OR EXISTS (SELECT 1 FROM books b WHERE b.id = n.book_id AND b.published))
`;

export function customerFeatures(
  db: StoreDatabase,
  signedIn: (request: Request) => Promise<Customer | null>,
  requireCustomer: (request: Request, operator?: boolean) => Promise<Customer>
) {
  const router = Router();

  router.get('/wishlist', async (request, response) => {
    const { id } = await requireCustomer(request);
    const { rows } = await db.query<{ bookId: string }>(`
      SELECT w.book_id AS "bookId" FROM wishlist w JOIN books b ON b.id = w.book_id
      WHERE w.customer_id = $1 AND b.published ORDER BY w.created_at DESC, w.id
    `, [id]);
    response.json({ bookIds: rows.map(row => row.bookId) });
  });

  router.patch('/wishlist/:bookId', async (request, response) => {
    const { id } = await requireCustomer(request);
    const bookId = field(request.params.bookId, 'book', 80);
    const { saved } = record(request.body);
    if (typeof saved !== 'boolean') throw new RequestError(400, 'Choose whether to save this book.');
    if (saved) {
      const { rows } = await db.query(`
        INSERT INTO wishlist (id, customer_id, book_id)
        SELECT $1, $2, id FROM books WHERE id = $3 AND published
        ON CONFLICT (customer_id, book_id) DO UPDATE SET book_id = EXCLUDED.book_id RETURNING book_id
      `, [randomUUID(), id, bookId]);
      if (!rows.length) throw new RequestError(404, 'This book is unavailable.');
    } else {
      await db.query('DELETE FROM wishlist WHERE customer_id = $1 AND book_id = $2', [id, bookId]);
    }
    response.json({ saved });
  });

  router.get('/coupons', async (request, response) => {
    await requireCustomer(request);
    const { rows } = await db.query<Coupon>('SELECT code, percent, active FROM coupons WHERE active ORDER BY code');
    response.json({ coupons: rows });
  });

  router.get('/publisher/coupons', async (request, response) => {
    await requireCustomer(request, true);
    const { rows } = await db.query<Coupon>('SELECT code, percent, active FROM coupons ORDER BY code');
    response.json({ coupons: rows });
  });

  router.post('/publisher/coupons', async (request, response) => {
    await requireCustomer(request, true);
    const body = record(request.body);
    const code = couponCode(body.code);
    const { percent, active } = body;
    if (typeof percent !== 'number' || !Number.isInteger(percent) || percent < 1 || percent > 100 || typeof active !== 'boolean') {
      throw new RequestError(400, 'Choose a whole discount percentage from 1 to 100 and a coupon status.');
    }
    const { rows: [coupon] } = await db.query<Coupon>(`
      INSERT INTO coupons (code, percent, active) VALUES ($1, $2, $3)
      ON CONFLICT (code) DO UPDATE SET percent = EXCLUDED.percent, active = EXCLUDED.active
      RETURNING code, percent, active
    `, [code, percent, active]);
    response.json({ coupon });
  });

  router.get('/notifications', async (request, response) => {
    const customer = await signedIn(request);
    const { rows } = await db.query<StoreNotification>(`
      SELECT n.id, n.title, n.message, n.created_at AS "createdAt", n.book_id AS "bookId",
             n.order_id AS "orderId", r.id IS NOT NULL AS read
      FROM notifications n
      LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.customer_id = $1
      WHERE ${visibleNotifications}
      ORDER BY n.created_at DESC, n.id
    `, [customer?.id ?? null]);
    response.json({ notifications: rows });
  });

  router.post('/notifications/read', async (request, response) => {
    const { id } = await requireCustomer(request);
    const { ids } = record(request.body);
    if (!Array.isArray(ids) || ids.length > 200 || ids.some(id => typeof id !== 'string' || id.length > 100)) {
      throw new RequestError(400, 'Choose valid notifications.');
    }
    await db.query(`
      INSERT INTO notification_reads (id, customer_id, notification_id)
      SELECT gen_random_uuid(), $1, n.id FROM notifications n
      WHERE ${visibleNotifications} AND n.id = ANY($2::text[])
      ON CONFLICT (customer_id, notification_id) DO NOTHING
    `, [id, ids]);
    response.json({ ok: true });
  });

  router.post('/publisher/notifications', async (request, response) => {
    await requireCustomer(request, true);
    const body = record(request.body);
    const id = field(body.id, 'announcement ID', 50);
    if (!/^announcement:[a-f0-9-]{36}$/.test(id)) throw new RequestError(400, 'Invalid announcement ID.');
    await db.query('INSERT INTO notifications (id, title, message) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
      [id, field(body.title, 'announcement title', 120), field(body.message, 'announcement', 600)]);
    response.status(201).json({ ok: true });
  });

  return router;
}
