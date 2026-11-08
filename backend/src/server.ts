import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import express from 'express';
import type { ErrorRequestHandler, Request, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { nextOrderStatuses } from '../../shared/store.ts';
import type { Customer, Enquiry, Order, OrderStatus, PublisherOverview, StoreOrder } from '../../shared/store.ts';
import type { Book } from '../../shared/books.ts';
import { canOrder } from '../../shared/books.ts';
import { catalogRouter } from './catalog.ts';
import { openDatabase } from './database.ts';
import { adminAccountEmail, adminLogin, cookieName, digest, passwordHash, sessionLength, sessionToken, verifyPassword } from './security.ts';
import { addressField, cartEntries, emailField, field, passwordField, record, RequestError, uuidField } from './validation.ts';

const onVercel = process.env.VERCEL === '1';
const development = !onVercel && process.argv.includes('--dev');
const frontend = resolve('../frontend');
const distribution = resolve(frontend, 'dist');
if (!onVercel && !development && !existsSync(resolve(distribution, 'index.html'))) {
  throw new Error('Run npm run build before starting the store.');
}
if (onVercel && !process.env.DATABASE_URL?.trim()) {
  throw new Error('Set DATABASE_URL in the Vercel project environment to start the store API.');
}

const db = await openDatabase();
const app = express();
const api = express.Router();

const customerFields = 'id, email, full_name AS "fullName", address, operator';
const orderFields = 'id, status, created_at AS "createdAt", lines, subtotal AS "estimatedSubtotal", address';

app.disable('x-powered-by');
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
app.use((_request, response, next) => {
  response.set({
    'Referrer-Policy': 'same-origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY'
  });
  next();
});

api.use((request, response, next) => {
  response.set('Cache-Control', 'no-store');
  if (['POST', 'PATCH', 'DELETE'].includes(request.method) &&
      (request.get('X-Store-Request') !== '1' || request.get('Sec-Fetch-Site') === 'cross-site' || !request.is('application/json'))) {
    throw new RequestError(403, 'Open the store directly and try again.');
  }
  next();
});
api.use(catalogRouter(db, request => requireCustomer(request, true)));
api.use(express.json({ limit: '24kb' }));

const authLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Please try again in a few minutes.' }
});

const contactLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many messages. Please try again in a few minutes.' }
});

async function signedInCustomer(request: Request): Promise<Customer | null> {
  const token = sessionToken(request);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const result = await db.query<Customer>(
    `SELECT c.id, c.email, c.full_name AS "fullName", c.address, c.operator
       FROM sessions s JOIN customers c ON c.id = s.customer_id
      WHERE s.token_hash = $1 AND s.expires_at > NOW()`, [digest(token)]
  );
  return result.rows[0] ?? null;
}

async function requireCustomer(request: Request, operator = false) {
  const customer = await signedInCustomer(request);
  if (!customer) throw new RequestError(401, 'Please sign in to continue.');
  if (operator && !customer.operator) throw new RequestError(403, 'Publisher access is required.');
  return customer;
}

function cookieOptions(request: Request) {
  return { httpOnly: true, sameSite: 'lax' as const, secure: request.secure || process.env.SECURE_COOKIES === '1', path: '/' };
}

async function startSession(request: Request, response: Response, id: string) {
  const token = randomBytes(32).toString('hex');
  const previous = sessionToken(request);
  await db.transaction(async tx => {
    await tx.query('DELETE FROM sessions WHERE expires_at <= NOW() OR token_hash = $1', [previous ? digest(previous) : '']);
    await tx.query(
      'INSERT INTO sessions (token_hash, customer_id, expires_at) VALUES ($1, $2, $3)',
      [digest(token), id, new Date(Date.now() + sessionLength).toISOString()]
    );
  });
  response.cookie(cookieName, token, { ...cookieOptions(request), maxAge: sessionLength });
}

api.get('/session', async (request, response) => {
  response.json({ customer: await signedInCustomer(request) });
});

api.post('/register', authLimit, async (request, response) => {
  const body = record(request.body);
  const fullName = field(body.fullName, 'full name', 100);
  const email = emailField(body.email);
  if (email === adminAccountEmail) throw new RequestError(400, 'Use your own email address to create an account.');
  const password = await passwordHash(passwordField(body.password, true));
  const result = await db.query<Customer>(
    `INSERT INTO customers (id, email, full_name, password)
     VALUES ($1, $2, $3, $4) ON CONFLICT (email) DO NOTHING RETURNING ${customerFields}`,
    [randomUUID(), email, fullName, password]
  );
  const customer = result.rows[0];
  if (!customer) throw new RequestError(409, 'An account could not be created with that email. Try signing in.');
  await startSession(request, response, customer.id);
  response.status(201).json({ customer });
});

api.post('/login', authLimit, async (request, response) => {
  const body = record(request.body);
  const login = field(body.email, 'email or admin ID', 254).toLowerCase();
  const email = login === adminLogin ? adminAccountEmail : emailField(login);
  const password = passwordField(body.password, false);
  const result = await db.query<Customer & { password: string }>(
    `SELECT ${customerFields}, password FROM customers WHERE email = $1 AND (email <> $2 OR operator)`,
    [email, adminAccountEmail]
  );
  const account = result.rows[0];
  const valid = await verifyPassword(password, account?.password);
  if (!account || !valid) throw new RequestError(401, 'Sign-in ID or password is incorrect.');
  const { password: _storedPassword, ...customer } = account;
  await startSession(request, response, customer.id);
  response.json({ customer });
});

api.post('/logout', async (request, response) => {
  const token = sessionToken(request);
  if (token) await db.query('DELETE FROM sessions WHERE token_hash = $1', [digest(token)]);
  response.clearCookie(cookieName, cookieOptions(request)).json({ customer: null });
});

api.patch('/profile', async (request, response) => {
  const customer = await requireCustomer(request);
  const body = record(request.body);
  const name = field(body.fullName, 'full name', 100);
  const result = await db.query<Customer>(
    `UPDATE customers SET full_name = $2 WHERE id = $1 RETURNING ${customerFields}`, [customer.id, name]
  );
  response.json({ customer: result.rows[0] });
});

api.patch('/address', async (request, response) => {
  const customer = await requireCustomer(request);
  const body = record(request.body);
  const address = body.address === null ? null : JSON.stringify(addressField(body.address));
  const result = await db.query<Customer>(
    `UPDATE customers SET address = $2 WHERE id = $1 RETURNING ${customerFields}`, [customer.id, address]
  );
  response.json({ customer: result.rows[0] });
});

api.get('/orders', async (request, response) => {
  const customer = await requireCustomer(request);
  const result = await db.query<Order>(
    `SELECT ${orderFields} FROM orders WHERE customer_id = $1 ORDER BY created_at DESC`, [customer.id]
  );
  response.json({ orders: result.rows });
});

api.post('/orders', async (request, response) => {
  const customer = await requireCustomer(request);
  const body = record(request.body);
  const key = uuidField(body.requestKey);
  const entries = cartEntries(body.cart);
  function delivery(needsShipping: boolean) {
    const address = needsShipping ? addressField(body.address) : null;
    const saveAddress = address !== null && body.saveAddress === true;
    const requestHash = digest(JSON.stringify({ items: entries, address, saveAddress }));
    return { address, saveAddress, requestHash };
  }
  const order = await db.transaction(async tx => {
    await tx.query('SELECT id FROM customers WHERE id = $1 FOR UPDATE', [customer.id]);
    const existing = await tx.query<Order & { requestHash: string }>(
      `SELECT ${orderFields}, request_hash AS "requestHash" FROM orders WHERE customer_id = $1 AND request_key = $2`,
      [customer.id, key]
    );
    if (existing.rows[0]) {
      const { requestHash, ...order } = existing.rows[0];
      if (requestHash !== delivery(order.address !== null).requestHash) {
        throw new RequestError(409, 'A request from this checkout already exists. Check your orders before trying again.');
      }
      return order;
    }

    const { rows } = await tx.query<Book>(
      'SELECT id, title, format, price, stock, published FROM books WHERE id = ANY($1::text[]) FOR SHARE',
      [entries.map(([id]) => id)]
    );
    const books = new Map(rows.map(book => [book.id, book]));
    const quote = body.quote === undefined ? {} : record(body.quote);
    const lines = entries.map(([id, quantity]) => {
      const book = books.get(id);
      if (!canOrder(book) || (book.stock !== null && quantity > book.stock)) {
        throw new RequestError(409, 'Availability has changed. Review the quantities in your bag and try again.');
      }
      if (quote[id] !== `${book.price}:${book.format}`) {
        throw new RequestError(409, 'The catalog has changed. Review the updated book prices and formats before submitting again.');
      }
      return { id, title: book.title, format: book.format, quantity, unitPrice: book.price };
    });
    const { address, saveAddress, requestHash } = delivery(lines.some(line => line.format !== 'eBook'));
    const subtotal = lines.reduce((total, line) => total + line.unitPrice * line.quantity, 0);
    const inserted = await tx.query<Order>(
      `INSERT INTO orders (id, customer_id, request_key, request_hash, lines, subtotal, address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${orderFields}`,
      [randomUUID(), customer.id, key, requestHash, JSON.stringify(lines), subtotal, address && JSON.stringify(address)]
    );
    if (saveAddress) await tx.query('UPDATE customers SET address = $2 WHERE id = $1', [customer.id, JSON.stringify(address)]);
    return inserted.rows[0];
  });
  response.status(201).json({ order });
});

api.post('/enquiries', contactLimit, async (request, response) => {
  const body = record(request.body);
  const name = field(body.fullName, 'name', 100);
  const email = emailField(body.email);
  const message = field(body.message, 'message', 2500);
  await db.query('INSERT INTO enquiries (id, full_name, email, message) VALUES ($1, $2, $3, $4)', [randomUUID(), name, email, message]);
  response.status(201).json({ received: true });
});

api.get('/publisher/overview', async (request, response) => {
  await requireCustomer(request, true);
  const overview = await db.transaction(async tx => {
    const { rows: [counts] } = await tx.query<Omit<PublisherOverview, 'recentOrders' | 'stockAlerts'>>(`
      SELECT (SELECT COUNT(*)::integer FROM books WHERE published) AS "publishedBooks",
             (SELECT COUNT(*)::integer FROM orders WHERE status = 'submitted') AS "pendingOrders",
             (SELECT COUNT(*)::integer FROM books WHERE published AND stock <= 5) AS "lowStockBooks",
             (SELECT COUNT(*)::integer FROM enquiries) AS enquiries
    `);
    const { rows: recentOrders } = await tx.query<PublisherOverview['recentOrders'][number]>(`
      SELECT o.id, o.status, o.created_at AS "createdAt", o.subtotal AS "estimatedSubtotal", c.full_name AS "fullName"
        FROM orders o JOIN customers c ON c.id = o.customer_id
       ORDER BY o.created_at DESC, o.id LIMIT 5
    `);
    const { rows: stockAlerts } = await tx.query<PublisherOverview['stockAlerts'][number]>(
      'SELECT id, title, stock FROM books WHERE published AND stock <= 5 ORDER BY stock, title, id LIMIT 5'
    );
    return { ...counts, recentOrders, stockAlerts };
  });
  response.json(overview);
});

api.get('/publisher', async (request, response) => {
  await requireCustomer(request, true);
  const orders = await db.query<StoreOrder>(
    `SELECT o.id, o.status, o.created_at AS "createdAt", o.lines, o.subtotal AS "estimatedSubtotal",
            o.address, c.email, c.full_name AS "fullName"
       FROM orders o JOIN customers c ON c.id = o.customer_id ORDER BY o.created_at DESC`
  );
  const enquiries = await db.query<Enquiry>(
    'SELECT id, full_name AS "fullName", email, message, created_at AS "createdAt" FROM enquiries ORDER BY created_at DESC'
  );
  response.json({ orders: orders.rows, enquiries: enquiries.rows });
});

api.patch('/publisher/orders/:id', async (request, response) => {
  await requireCustomer(request, true);
  const id = uuidField(request.params.id);
  const { status } = record(request.body);
  const updated = await db.transaction(async tx => {
    const result = await tx.query<Order & { reserved_inventory: { id: string; quantity: number }[] | null }>(
      `SELECT ${orderFields}, reserved_inventory FROM orders WHERE id = $1 FOR UPDATE`, [id]
    );
    const order = result.rows[0];
    if (!order) throw new RequestError(404, 'Order not found.');
    if (status === order.status) {
      const { reserved_inventory: _reserved, ...current } = order;
      return current;
    }
    if (!nextOrderStatuses(order).includes(status as OrderStatus)) {
      throw new RequestError(409, 'This status change is unavailable. Refresh the dashboard.');
    }
    const reserved = order.reserved_inventory ?? [];
    if (status === 'confirmed') {
      for (const line of order.lines) {
        const { rows: [book] } = await tx.query<{ stock: number | null }>('SELECT stock FROM books WHERE id = $1 FOR UPDATE', [line.id]);
        if (!book || book.stock === null) continue;
        if (book.stock < line.quantity) throw new RequestError(409, `Not enough stock to confirm ${line.title}.`);
        await tx.query('UPDATE books SET stock=stock-$2, revision=revision+1, updated_at=NOW() WHERE id=$1', [line.id, line.quantity]);
        reserved.push({ id: line.id, quantity: line.quantity });
      }
    } else if (status === 'cancelled') {
      for (const line of reserved) {
        await tx.query('UPDATE books SET stock=stock+$2, revision=revision+1, updated_at=NOW() WHERE id=$1 AND stock IS NOT NULL', [line.id, line.quantity]);
      }
      reserved.length = 0;
    }
    const changed = await tx.query<Order>(
      `UPDATE orders SET status = $2, reserved_inventory = $3 WHERE id = $1 RETURNING ${orderFields}`,
      [id, status, JSON.stringify(reserved)]
    );
    return changed.rows[0];
  });
  response.json({ order: updated });
});

api.use((_request, response) => {
  response.status(404).json({ error: 'This endpoint does not exist.' });
});

const sendError: ErrorRequestHandler = (error, _request, response, next) => {
  if (response.headersSent) return next(error);
  if (error instanceof RequestError) {
    response.status(error.status).json({ error: error.message });
    return;
  }
  if (error.type === 'entity.parse.failed' || error.type === 'entity.too.large') {
    response.status(error.status).json({ error: 'The submitted information is invalid or too large.' });
    return;
  }
  console.error('Store request failed:', error.name, error.code ?? '');
  response.status(500).json({ error: 'Something went wrong. Please try again.' });
};

app.use('/api', api, sendError);

if (!onVercel) {
  const server = createServer(app);
  if (development) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({ root: frontend, server: { middlewareMode: true, hmr: { server } } });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distribution));
  }

  const port = Number(process.env.PORT || (development ? 5173 : 4000));
  const host = process.env.HOST || '127.0.0.1';
  server.listen(port, host, () => console.log(`Bhagwati Publication · http://${host}:${port}/`));

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => server.close(async () => {
      await db.close();
      process.exit();
    }));
  }
}

export default app;
