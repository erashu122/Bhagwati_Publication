import { useEffect, useState } from 'react';
import { ArrowUpRight, BookOpen, ClipboardList, Mail, Package, Plus, RefreshCw, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatPrice } from '../../../shared/books';
import { orderStatusLabels } from '../../../shared/store';
import type { PublisherOverview } from '../../../shared/store';
import { errorMessage, storeRequest } from '../account';
import { orderReference } from '../components/OrderCard';

const metrics = [
  { key: 'publishedBooks', label: 'Published books', icon: BookOpen, path: 'books' },
  { key: 'pendingOrders', label: 'Awaiting confirmation', icon: ClipboardList, path: 'orders&status=submitted' },
  { key: 'lowStockBooks', label: 'Low stock titles', icon: Package, path: 'books&stock=low' },
  { key: 'enquiries', label: 'Total enquiries', icon: Mail, path: 'enquiries' }
] as const;

const date = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' });

export function AdminOverview() {
  const [data, setData] = useState<PublisherOverview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    storeRequest<PublisherOverview>('/publisher/overview').then(data => {
      if (active) setData(data);
    }).catch(error => {
      if (active) setError(errorMessage(error));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [attempt]);

  return <>
    <div className="admin-tools"><div><h2>Store overview</h2><p>See what needs your attention across the store.</p></div>
      <button className="button secondary" type="button" disabled={loading} onClick={() => setAttempt(value => value + 1)}><RefreshCw size={16} aria-hidden="true" /> Refresh</button>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {loading && !data && <p role="status">Loading store overview…</p>}
    {data && <div className="admin-overview-metrics">{metrics.map(({ key, label, icon: Icon, path }) =>
      <Link className="admin-metric-card" to={'/admin?tab=' + path} key={key}>
        <span className="dashboard-icon"><Icon size={19} aria-hidden="true" /></span>
        <ArrowUpRight className="admin-metric-arrow" size={16} aria-hidden="true" />
        <strong>{data[key].toLocaleString('en-IN')}</strong><span>{label}</span>
      </Link>
    )}</div>}
    <div className="admin-quick-actions">
      <div><h3>Quick actions</h3><p>Add a title or update the author profile.</p></div>
      <div className="inline-actions">
        <Link className="button primary" to="/admin?tab=books&action=add"><Plus size={18} aria-hidden="true" /> Add book</Link>
        <Link className="button secondary" to="/admin?tab=author"><UserRound size={17} aria-hidden="true" /> Edit author</Link>
      </div>
    </div>
    {data && <div className="admin-overview-panels">
      <section className="form-panel admin-overview-panel">
        <header><h3>Recent orders</h3><Link className="text-link" to="/admin?tab=orders">View orders</Link></header>
        {data.recentOrders.length ? <ul>{data.recentOrders.map(order => <li key={order.id}>
          <div><strong>{orderReference(order.id)}</strong><span>{order.fullName} · {date.format(new Date(order.createdAt))}</span></div>
          <div><strong>{formatPrice(order.estimatedSubtotal)}</strong><span>{orderStatusLabels[order.status]}</span></div>
        </li>)}</ul> : <p>No order requests yet.</p>}
      </section>
      <section className="form-panel admin-overview-panel">
        <header><h3>Stock alerts</h3><Link className="text-link" to="/admin?tab=books&stock=low">Manage stock</Link></header>
        {data.stockAlerts.length ? <ul>{data.stockAlerts.map(book => <li key={book.id}><strong>{book.title}</strong><span className="admin-stock-count">{book.stock === 0 ? 'Sold out' : book.stock + ' left'}</span></li>)}</ul>
          : <p>No published titles have five or fewer tracked copies.</p>}
      </section>
    </div>}
  </>;
}
