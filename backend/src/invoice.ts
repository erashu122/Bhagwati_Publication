import type { Order } from '../../shared/store.ts';

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
const date = (value: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(value));

export function orderDocument(order: Order & { paymentId: string | null }, customerName: string, nonce: string) {
  const paid = Boolean(order.paidAt);
  const title = paid ? 'Invoice · Payment receipt' : 'Cash on Delivery · Order confirmation';
  const reference = (paid ? 'BP-INV-' : 'BP-COD-') + order.id.toUpperCase();
  const address = order.address;
  const method = order.paymentMethod === 'cod' ? 'Cash on Delivery' : order.paymentMethod === 'upi' ? 'UPI' : 'Razorpay';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<style nonce="${nonce}">
body{background:#f6f3ed;color:#172743;font:16px/1.5 system-ui,sans-serif;margin:0;padding:20px}main{box-sizing:border-box;max-width:820px;margin:auto;padding:clamp(16px,4vw,40px);background:#fff;border:1px solid #dfdbd2}h1{margin:0 0 .4em;line-height:1.1}h2{font-size:1.1rem;margin-bottom:0}.ref{overflow-wrap:anywhere;color:#42506a}table{width:100%;border-collapse:collapse;margin:1.5rem 0}th,td{padding:.5rem .25rem;text-align:left;border-bottom:1px solid #dfdbd2;vertical-align:top}th:last-child,td:last-child{text-align:right}dl{margin-left:auto;max-width:330px}dl div{display:flex;justify-content:space-between;gap:12px;padding:.25rem 0}dd{margin:0;text-align:right}.total{border-top:1px solid #dfdbd2;font-weight:700}button{font:inherit;background:#172743;color:#fff;border:0;border-radius:5px;padding:.5rem .9rem;cursor:pointer}@media print{body{padding:0;background:white}main{border:0;padding:0}button{display:none}}
</style></head><body><main><p>BHAGWATI PUBLICATIONS</p><h1>${title}</h1>
<p class="ref">${reference}<br>Ordered on ${date(order.createdAt)}${order.paidAt ? `<br>Paid on ${date(order.paidAt)}` : ''}</p>
<h2>${address ? 'Deliver to' : 'Customer'}</h2><p>${escape(address?.fullName ?? customerName)}${address ? `<br>${escape(address.street)}<br>${escape(address.city)}, ${escape(address.state)} ${escape(address.pin)}<br>${escape(address.phone)}` : ''}</p>
<table><thead><tr><th scope="col">Book</th><th scope="col">Qty</th><th scope="col">Unit price</th><th scope="col">Amount</th></tr></thead><tbody>
${order.lines.map(line => `<tr><td>${escape(line.title)}<br><small>${escape(line.format)}</small></td><td>${line.quantity}</td><td>${money(line.unitPrice)}</td><td>${money(line.quantity * line.unitPrice)}</td></tr>`).join('')}
</tbody></table><dl><div><dt>Subtotal</dt><dd>${money(order.estimatedSubtotal)}</dd></div>
${order.discount > 0 ? `<div><dt>Coupon ${escape(order.couponCode ?? '')}</dt><dd>−${money(order.discount)}</dd></div>` : ''}
<div><dt>Shipping</dt><dd>${money(order.shippingFee ?? 0)}</dd></div>
<div class="total"><dt>${paid ? 'Total paid' : 'Due on delivery'}</dt><dd>${money(order.finalTotal ?? 0)}</dd></div></dl>
<p><strong>${order.finalTotal === 0 ? 'No payment required' : method}</strong>${order.paymentId ? `<br>Payment reference: ${escape(order.paymentId)}` : ''}</p>
${paid ? '<p><small>Issued as an order and payment receipt.</small></p>' : '<p>Payment will be collected at delivery. Your paid invoice appears here once the publisher records receipt.</p>'}
<button id="print" type="button">Print / Save as PDF</button></main>
<script nonce="${nonce}">document.getElementById('print').addEventListener('click', () => window.print());</script></body></html>`;
}
