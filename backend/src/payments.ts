import { createHmac, timingSafeEqual } from 'node:crypto';
import express from 'express';
import type { Request } from 'express';
import type { CheckoutConfig, Customer, Order } from '../../shared/store.ts';
import { siteOrigin } from '../../shared/site.ts';
import type { DatabaseExecutor, StoreDatabase } from './database-driver.ts';
import { notifyOrder } from './customer-features.ts';
import { record, RequestError, uuidField } from './validation.ts';

type PaymentOrder = Pick<Order, 'id' | 'status' | 'finalTotal' | 'paidAt' | 'paymentLinkId' | 'refundedAt' | 'paymentMethod'> & {
  customerId: string; attempt: number | null; expiresAt: string | null; holdExpired: boolean;
};
type Link = {
  id: string; reference_id: string; amount: number; amount_paid: number; currency: string;
  status: string; short_url: string; payments?: { payment_id: string }[] | null;
};
type Payment = { id: string; status: string; amount: number; amount_refunded: number; currency: string };
const fields = 'id, customer_id AS "customerId", status, final_total AS "finalTotal", paid_at AS "paidAt", payment_link_id AS "paymentLinkId", refunded_at AS "refundedAt", payment_attempt AS attempt, payment_method AS "paymentMethod", payment_expires_at AS "expiresAt", COALESCE(payment_expires_at <= NOW(), FALSE) AS "holdExpired"';
const orderRef = (order: PaymentOrder) => 'BP-' + order.id.replaceAll('-', '') + (order.attempt ? '-' + order.attempt : '');
const canPay = (order: PaymentOrder) => order.status === 'awaiting_payment' || order.status === 'confirmed' && order.paymentMethod === null;
const linkPath = (id: string) => '/payment_links/' + encodeURIComponent(id);
const terminalUnpaid = (link: Link) => (link.status === 'expired' || link.status === 'cancelled') && link.amount_paid === 0;
const matchesLink = (order: PaymentOrder, link: Link) => /^plink_[A-Za-z0-9]+$/.test(link.id) && link.reference_id === orderRef(order) &&
  link.currency === 'INR' && link.amount === (order.finalTotal ?? 0) * 100;

function credentials() {
  const key = process.env.RAZORPAY_KEY_ID?.trim();
  const secret = process.env.RAZORPAY_KEY_SECRET?.trim();
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
  if (!key || !secret || !webhookSecret || (process.env.VERCEL === '1' && !key.startsWith('rzp_live_'))) return null;
  return Buffer.from(key + ':' + secret).toString('base64');
}

export function checkoutConfig(): CheckoutConfig {
  const fee = process.env.CHECKOUT_SHIPPING_INR?.trim();
  return { enabled: Boolean(credentials()), shippingFee: fee && /^\d{1,5}$/.test(fee) && Number(fee) <= 10000 ? Number(fee) : 20 };
}

async function releaseCheckout(tx: DatabaseExecutor, id: string) {
  const { rows: [order] } = await tx.query<{ reserved: { id: string; quantity: number }[] | null }>(
    `SELECT reserved_inventory AS reserved FROM orders WHERE id=$1 AND status='awaiting_payment' AND paid_at IS NULL FOR UPDATE`, [id]);
  if (!order) return;
  const reserved = order.reserved ?? [];
  if (reserved.length) {
    await tx.query('SELECT id FROM books WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE', [reserved.map(item => item.id)]);
    for (const { id, quantity } of reserved) {
      await tx.query('UPDATE books SET stock=stock+$2, revision=revision+1, updated_at=NOW() WHERE id=$1 AND stock IS NOT NULL', [id, quantity]);
    }
  }
  await tx.query("UPDATE orders SET status='cancelled', reserved_inventory=NULL WHERE id=$1", [id]);
}

export async function expireUnstartedCheckouts(db: StoreDatabase) {
  const { rows } = await db.query<{ id: string }>(`SELECT id FROM orders WHERE status='awaiting_payment' AND payment_link_id IS NULL
    AND payment_expires_at <= NOW() ORDER BY payment_expires_at LIMIT 10`);
  for (const { id } of rows) await db.transaction(async tx => {
    const { rows: [order] } = await tx.query<PaymentOrder>(`SELECT ${fields} FROM orders WHERE id=$1 FOR UPDATE`, [id]);
    if (order?.holdExpired && !order.paymentLinkId) await releaseCheckout(tx, id);
  });
}

async function gateway<T>(path: string, body?: object): Promise<T> {
  const auth = credentials();
  if (!auth) throw new RequestError(503, 'Online payments are not set up yet.');
  try {
    const response = await fetch('https://api.razorpay.com/v1' + path, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: 'Basic ' + auth, 'Content-Type': 'application/json' },
      body: body && JSON.stringify(body),
      signal: AbortSignal.timeout(6500)
    });
    if (response.ok) return await response.json() as T;
    console.warn('Payment provider HTTP status:', response.status);
  } catch {
    console.warn('Payment provider request failed.');
  }
  throw new RequestError(502, 'The payment provider is unavailable. Try checking the payment again.');
}

async function recordPaid(tx: DatabaseExecutor, order: PaymentOrder, paymentId: string | null) {
  await tx.query("UPDATE orders SET status = CASE WHEN status='awaiting_payment' THEN 'confirmed' ELSE status END, paid_at = NOW(), payment_id = $2 WHERE id = $1", [order.id, paymentId]);
  await notifyOrder(tx, order.customerId, order.id, 'Payment confirmed', 'Your invoice is ready in My orders. Purchased eBooks are available when their files have been uploaded.');
}

async function recordRefund(tx: DatabaseExecutor, order: PaymentOrder, paymentId: string) {
  await tx.query("UPDATE orders SET status = CASE WHEN status='awaiting_payment' THEN 'confirmed' ELSE status END, refunded_at = NOW(), paid_at = NULL, payment_id = $2 WHERE id = $1", [order.id, paymentId]);
  await notifyOrder(tx, order.customerId, order.id, 'Payment refunded', 'A full refund was recorded for this order.');
}

export function razorpayWebhook(db: StoreDatabase) {
  return express.Router().post('/', express.raw({ type: 'application/json', limit: '64kb', inflate: false }), async (request, response) => {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
    if (!secret) throw new RequestError(503, 'Payment notifications are not set up.');
    const signature = request.get('X-Razorpay-Signature') ?? '';
    if (!Buffer.isBuffer(request.body) || !/^[a-f0-9]{64}$/i.test(signature) ||
        !timingSafeEqual(Buffer.from(signature, 'hex'), createHmac('sha256', secret).update(request.body).digest())) {
      throw new RequestError(401, 'Invalid payment notification.');
    }
    const event = JSON.parse(request.body.toString('utf8')) as {
      event: string;
      payload?: { payment_link?: { entity: Link }; payment?: { entity: Payment }; refund?: { entity: { payment_id: string } } };
    };
    const link = event.payload?.payment_link?.entity;
    const captured = event.payload?.payment?.entity;
    if (event.event === 'payment_link.paid' && link?.status === 'paid' && captured?.status === 'captured' &&
        /^pay_[A-Za-z0-9]+$/.test(captured.id)) {
      await db.transaction(async tx => {
        const { rows: [order] } = await tx.query<PaymentOrder>(`SELECT ${fields} FROM orders WHERE payment_link_id=$1 FOR UPDATE`, [link.id]);
        if (!order || order.paidAt || order.refundedAt || !order.finalTotal || !canPay(order)) return;
        const amount = order.finalTotal * 100;
        if (!matchesLink(order, link) || link.amount_paid !== amount || captured.amount !== amount || captured.currency !== 'INR') {
          throw new RequestError(409, 'Payment does not match the confirmed order.');
        }
        const current = await gateway<Payment>('/payments/' + encodeURIComponent(captured.id));
        if (current.id !== captured.id || current.amount !== amount || current.currency !== 'INR') throw new RequestError(409, 'Payment does not match this order.');
        if (current.amount_refunded >= amount) await recordRefund(tx, order, captured.id);
        else if (current.status === 'captured') await recordPaid(tx, order, captured.id);
      });
    } else if (link && ['payment_link.expired', 'payment_link.cancelled'].includes(event.event) && terminalUnpaid(link)) {
      await db.transaction(async tx => {
        const { rows: [order] } = await tx.query<PaymentOrder>(`SELECT ${fields} FROM orders WHERE payment_link_id=$1 FOR UPDATE`, [link.id]);
        if (order?.status === 'awaiting_payment' && matchesLink(order, link)) await releaseCheckout(tx, order.id);
      });
    } else if (event.event === 'refund.processed') {
      const id = event.payload?.refund?.entity.payment_id;
      if (id && /^pay_[A-Za-z0-9]+$/.test(id)) {
        const current = await gateway<Payment>('/payments/' + encodeURIComponent(id));
        await db.transaction(async tx => {
          const { rows: [order] } = await tx.query<PaymentOrder>(`SELECT ${fields} FROM orders WHERE payment_id=$1 FOR UPDATE`, [id]);
          if (order?.paidAt && order.finalTotal && current.amount_refunded >= order.finalTotal * 100) await recordRefund(tx, order, id);
        });
      }
    }
    response.json({ ok: true });
  });
}

export function paymentsRouter(db: StoreDatabase, requireCustomer: (request: Request, operator?: boolean) => Promise<Customer>) {
  const router = express.Router();
  router.get('/payments/config', (_request, response) => response.json(checkoutConfig()));

  router.patch('/publisher/orders/:id/payment', async (request, response) => {
    await requireCustomer(request, true);
    const id = uuidField(request.params.id);
    const { total, received } = record(request.body);
    if (typeof total !== 'number' || !Number.isInteger(total) || total < 0 || total > 1000000 || typeof received !== 'boolean') {
      throw new RequestError(400, 'Enter the final total in whole rupees, from 0 to 1,000,000.');
    }
    const state = await db.transaction(async tx => {
      const { rows: [order] } = await tx.query<PaymentOrder>(`SELECT ${fields} FROM orders WHERE id=$1 FOR UPDATE`, [id]);
      if (!order) throw new RequestError(404, 'Order not found.');
      const cod = order.paymentMethod === 'cod';
      if (!(order.status === 'confirmed' || cod && order.status === 'shipped') || order.paidAt || order.paymentLinkId || order.refundedAt ||
          (order.paymentMethod !== null && !(cod && received && total === order.finalTotal))) {
        throw new RequestError(409, 'Only confirmed orders without an active or recorded payment can be edited.');
      }
      await tx.query('UPDATE orders SET final_total = $2 WHERE id = $1', [id, total]);
      if (received || total === 0) await recordPaid(tx, order, null);
      else if (total !== order.finalTotal) {
        await notifyOrder(tx, order.customerId, id, 'Order total confirmed', 'The final amount is available under My orders.');
      }
      const { rows: [updated] } = await tx.query<PaymentOrder>(`SELECT ${fields} FROM orders WHERE id = $1`, [id]);
      return updated;
    });
    response.json({ finalTotal: state.finalTotal, paidAt: state.paidAt });
  });

  router.post('/orders/:id/cancel-checkout', async (request, response) => {
    const customer = await requireCustomer(request);
    const id = uuidField(request.params.id);
    await db.transaction(async tx => {
      const { rows: [order] } = await tx.query<PaymentOrder>(`SELECT ${fields} FROM orders WHERE id=$1 AND (customer_id=$2 OR $3) FOR UPDATE`, [id, customer.id, customer.operator]);
      if (!order) throw new RequestError(404, 'Order not found.');
      if (order.status === 'cancelled') return;
      if (order.status !== 'awaiting_payment' || order.paidAt) throw new RequestError(409, 'Only an unpaid checkout can be cancelled here.');
      if (order.paymentLinkId) {
        const path = linkPath(order.paymentLinkId);
        let link = await gateway<Link>(path);
        if (matchesLink(order, link) && link.status === 'created' && link.amount_paid === 0) link = await gateway<Link>(path + '/cancel', {});
        if (!matchesLink(order, link) || !terminalUnpaid(link)) throw new RequestError(409, 'Payment is no longer open. Check the payment before cancelling.');
      }
      await releaseCheckout(tx, id);
    });
    response.json({ status: 'cancelled' });
  });

  router.post('/publisher/orders/:id/close-payment-link', async (request, response) => {
    await requireCustomer(request, true);
    const id = uuidField(request.params.id);
    await db.transaction(async tx => {
      const { rows: [order] } = await tx.query<PaymentOrder>(`SELECT ${fields} FROM orders WHERE id=$1 FOR UPDATE`, [id]);
      if (!order?.paymentLinkId || order.paidAt || order.refundedAt || order.status !== 'confirmed') {
        throw new RequestError(409, 'There is no unpaid payment link to close.');
      }
      const path = '/payment_links/' + encodeURIComponent(order.paymentLinkId);
      let link = await gateway<Link>(path);
      if (link.status === 'created') link = await gateway<Link>(path + '/cancel', {});
      if (link.status !== 'cancelled' && link.status !== 'expired') {
        throw new RequestError(409, 'The payment link is no longer unpaid. Check the payment in Razorpay.');
      }
      await tx.query('UPDATE orders SET payment_link_id=NULL, payment_attempt=COALESCE(payment_attempt,0)+1, final_total=NULL WHERE id=$1', [id]);
    });
    response.json({ paymentLinkId: null, finalTotal: null });
  });

  router.post('/orders/:id/payment', async (request, response) => {
    const customer = await requireCustomer(request);
    const id = uuidField(request.params.id);
    const checkOnly = record(request.body).checkOnly === true;
    const payment = await db.transaction(async tx => {
      const { rows: [order] } = await tx.query<PaymentOrder>(
        `SELECT ${fields} FROM orders WHERE id=$1 AND customer_id=$2 FOR UPDATE`, [id, customer.id]
      );
      if (!order) throw new RequestError(404, 'Order not found.');
      if (order.paidAt || order.refundedAt) return { status: order.refundedAt ? 'refunded' : 'paid' };
      if (order.status === 'cancelled') return { status: 'cancelled' };
      if (!canPay(order) || !order.finalTotal) throw new RequestError(409, 'This order cannot be paid online.');
      if (!order.paymentLinkId && order.holdExpired) {
        await releaseCheckout(tx, id);
        return { status: 'expired' };
      }
      if (checkOnly && !order.paymentLinkId) return { status: 'pending' };
      const amount = order.finalTotal * 100;
      const reference = orderRef(order);
      let link: Link | undefined;
      if (order.paymentLinkId) {
        link = await gateway<Link>(linkPath(order.paymentLinkId));
      } else {
        const found = await gateway<{ payment_links: Link[] }>('/payment_links?reference_id=' + encodeURIComponent(reference));
        link = found.payment_links?.find(item => item.reference_id === reference);
        link ??= await gateway<Link>('/payment_links', {
          amount, currency: 'INR', reference_id: reference, accept_partial: false,
          description: 'Bhagwati Publications order ' + id.slice(0, 8),
          notify: { sms: false, email: false }, reminder_enable: false,
          callback_url: siteOrigin + '/account?tab=orders&view=' + id + '&return=payment',
          callback_method: 'get',
          ...(order.expiresAt && { expire_by: Math.max(Math.floor(new Date(order.expiresAt).getTime() / 1000), Math.floor(Date.now() / 1000) + 16 * 60) }),
          ...(order.paymentMethod === 'upi' && { options: { checkout: { method: { upi: true, card: false, netbanking: false, wallet: false } } } })
        });
      }
      if (!matchesLink(order, link)) {
        throw new RequestError(409, 'The payment link does not match this order. Contact the publisher.');
      }
      if (!order.paymentLinkId) await tx.query('UPDATE orders SET payment_link_id=$2 WHERE id=$1', [id, link.id]);
      if (terminalUnpaid(link)) {
        if (order.status === 'awaiting_payment') await releaseCheckout(tx, id);
        else await tx.query('UPDATE orders SET payment_link_id=NULL, payment_attempt=COALESCE(payment_attempt,0)+1 WHERE id=$1', [id]);
        return { status: 'expired' };
      }
      if (link.status === 'paid' && link.amount_paid === amount && link.payments?.[0]?.payment_id) {
        const detail = await gateway<Payment>('/payments/' + encodeURIComponent(link.payments[0].payment_id));
        if (detail.id !== link.payments[0].payment_id || detail.amount !== amount || detail.currency !== 'INR') throw new RequestError(409, 'The payment amount does not match this order.');
        if (detail.amount_refunded >= amount) {
          await recordRefund(tx, order, detail.id);
          return { status: 'refunded' };
        }
        if (detail.status === 'captured') {
          await recordPaid(tx, order, detail.id);
          return { status: 'paid' };
        }
      }
      return { status: link.status, url: link.status === 'created' && /^https:\/\/rzp\.io\//.test(link.short_url) ? link.short_url : undefined };
    });
    response.json(payment);
  });

  return router;
}
