import { BookOpen, MapPin, PackageCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { orderStatusLabels } from '../../../shared/store';
import type { Order } from '../../../shared/store';
import { formatPrice } from '../data/books';

const date = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export function orderReference(id: string) {
  return 'BP-' + id.slice(0, 8).toUpperCase();
}

export function OrderCard({ order, children }: { order: Order; children?: ReactNode }) {
  return <article className="order-card">
    <div className="order-card-head">
      <span className="dashboard-icon"><PackageCheck size={20} strokeWidth={1.6} aria-hidden="true" /></span>
      <div><h3>{orderReference(order.id)}</h3><p>{date.format(new Date(order.createdAt))}</p></div>
      <span className={'status-pill status-' + order.status}>{orderStatusLabels[order.status]}</span>
    </div>
    <ul className="summary-items">{order.lines.map(line => <li key={line.id}>
      <span>{line.title} <small>{line.format} · {line.quantity} {line.quantity === 1 ? 'copy' : 'copies'}</small></span>
      <strong>{formatPrice(line.unitPrice * line.quantity)}</strong>
    </li>)}</ul>
    <div className="order-card-total"><span>Estimated book subtotal</span><strong>{formatPrice(order.estimatedSubtotal)}</strong></div>
    {order.address ? <details className="order-address"><summary><MapPin size={16} aria-hidden="true" /> Delivery address</summary>
      <p>{order.address.fullName}<br />{order.address.street}<br />{order.address.city}, {order.address.state} {order.address.pin}<br />{order.address.phone}</p>
    </details> : <p className="digital-note"><BookOpen size={16} aria-hidden="true" /> Digital titles · No shipping address needed</p>}
    {children}
  </article>;
}
