import { useEffect, useState } from 'react';
import { ArrowUpRight, Bell, BookOpen, ClipboardList, FileText, LayoutDashboard, Mail, RefreshCw, ShieldCheck, Tag, Tags, UserRound } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { nextOrderStatuses, orderStatusLabels } from '../../../shared/store';
import type { Enquiry, Order, OrderStatus, StoreOrder } from '../../../shared/store';
import { errorMessage, storeRequest, useAccount } from '../account';
import { OrderCard, orderReference } from '../components/OrderCard';
import { CatalogAdmin } from './CatalogAdmin';
import { AdminOverview } from './AdminOverview';
import { PublisherAnnouncements, PublisherCoupons } from './PublisherUpdates';

type PublisherData = { orders: StoreOrder[]; enquiries: Enquiry[] };
const sections = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'books', label: 'Books', icon: BookOpen },
  { id: 'categories', label: 'Categories', icon: Tags },
  { id: 'author', label: 'Author profile', icon: UserRound },
  { id: 'content', label: 'Store content', icon: FileText },
  { id: 'orders', label: 'Orders', icon: ClipboardList },
  { id: 'coupons', label: 'Coupons', icon: Tag },
  { id: 'announcements', label: 'Announcements', icon: Bell },
  { id: 'enquiries', label: 'Enquiries', icon: Mail }
] as const;

function Operations({ enquiries, initialStatus }: { enquiries: boolean; initialStatus: string }) {
  const [data, setData] = useState<PublisherData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState(Object.keys(orderStatusLabels).includes(initialStatus) ? initialStatus : '');
  const search = query.trim().toLowerCase();

  useEffect(() => {
    let current = true;
    setError('');
    setBusy(true);
    storeRequest<PublisherData>('/publisher').then(result => { if (current) setData(result); })
      .catch(error => { if (current) setError(errorMessage(error)); })
      .finally(() => { if (current) setBusy(false); });
    return () => { current = false; };
  }, [reload]);

  async function update(id: string, status: OrderStatus) {
    setBusy(true);
    setError('');
    try {
      const { order } = await storeRequest<{ order: Order }>('/publisher/orders/' + id, 'PATCH', { status });
      setData(previous => previous && {
        ...previous,
        orders: previous.orders.map(row => row.id === order.id ? { ...row, ...order } : row)
      });
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const orders = data?.orders.filter(order =>
    (!statusFilter || order.status === statusFilter) &&
    [order.fullName, order.email, orderReference(order.id)].some(value => value.toLowerCase().includes(search))
  ) ?? [];
  const messages = data?.enquiries.filter(enquiry =>
    [enquiry.fullName, enquiry.email, enquiry.message].some(value => value.toLowerCase().includes(search))
  ) ?? [];

  return <>
    <div className="admin-tools"><div><h2>{enquiries ? 'Enquiries' : 'Orders'}</h2>
      <p>{enquiries ? 'Read messages submitted through the store.' : 'Review requests and update fulfillment status.'}</p></div>
      <button type="button" className="button secondary" onClick={() => setReload(value => value + 1)} disabled={busy}><RefreshCw size={16} aria-hidden="true" /> Refresh</button>
    </div>
    <div className="admin-filters">
      <label className="field">{enquiries ? 'Search enquiries' : 'Search orders'}<input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
      {!enquiries && <label className="field">Order status<select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
        <option value="">All statuses</option>{Object.entries(orderStatusLabels).map(([status, label]) => <option key={status} value={status}>{label}</option>)}
      </select></label>}
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {!data ? (!error && <p role="status">Loading the dashboard…</p>) : enquiries
      ? <div className="account-orders">{messages.length === 0 && <p>No enquiries found.</p>}{messages.map(enquiry => <article className="order-card enquiry" key={enquiry.id}>
        <h3>{enquiry.fullName}</h3><p>{enquiry.email} · {new Date(enquiry.createdAt).toLocaleDateString('en-IN')}</p><p>{enquiry.message}</p>
      </article>)}</div>
      : <div className="account-orders">{orders.length === 0 && <p>No order requests found.</p>}{orders.map(order => <OrderCard order={order} key={order.id}>
        <p className="operator-customer">{order.fullName} · {order.email}</p>
        <div className="inline-actions">{nextOrderStatuses(order).map(status => <button className={'button ' + (status === 'cancelled' ? 'secondary' : 'primary')} disabled={busy} type="button" key={status} onClick={() => void update(order.id, status)}>
          {status === 'cancelled' ? 'Cancel request' : status === 'confirmed' ? 'Confirm request' : 'Mark ' + orderStatusLabels[status].toLowerCase()}
        </button>)}</div>
      </OrderCard>)}</div>}
  </>;
}

export function Publisher() {
  const [params, setParams] = useSearchParams();
  const { customer } = useAccount();
  const section = sections.find(section => section.id === params.get('tab'))?.id ?? 'overview';
  const stock = params.get('stock');
  const action = params.get('action');
  const status = params.get('status') ?? '';

  return <div className="admin-page">
    <div className="admin-banner">
      <div className="container admin-banner-inner">
        <div><p className="eyebrow"><ShieldCheck size={16} aria-hidden="true" /> BHAGWATI PUBLICATION</p>
          <h1>Admin dashboard</h1><p>Manage books, author details and customer orders.</p></div>
        <Link className="button admin-store-link" to="/">View storefront <ArrowUpRight size={17} aria-hidden="true" /></Link>
      </div>
    </div>
    <div className="container admin-layout">
      <aside className="admin-sidebar">
        <nav aria-label="Admin navigation">{sections.map(({ id, label, icon: Icon }) => <button
          type="button" key={id} aria-current={id === section ? 'page' : undefined} onClick={() => setParams(id === 'overview' ? {} : { tab: id })}>
          <Icon size={19} strokeWidth={1.75} aria-hidden="true" /> {label}
        </button>)}</nav>
        <div className="admin-account"><span className="dashboard-icon"><ShieldCheck size={18} aria-hidden="true" /></span>
          <div><strong>{customer?.fullName}</strong><Link to="/account">My account</Link></div>
        </div>
      </aside>
      <section className="admin-content" aria-label="Admin workspace">
        {section === 'overview' ? <AdminOverview />
          : section === 'coupons' ? <PublisherCoupons />
          : section === 'announcements' ? <PublisherAnnouncements />
          : section === 'orders' || section === 'enquiries' ? <Operations key={section + status} enquiries={section === 'enquiries'} initialStatus={status} />
          : <CatalogAdmin key={section + stock + action} section={section} startAdding={action === 'add'} lowStock={stock === 'low'} />}
      </section>
    </div>
  </div>;
}
