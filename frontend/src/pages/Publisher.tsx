import { useEffect, useState } from 'react';
import { ArrowUpRight, Bell, BookOpen, ClipboardList, Download, FileText, LayoutDashboard, Mail, Package, RefreshCw, ShieldCheck, Star, Tag, Tags, UserRound } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { nextOrderStatuses, orderStatusLabels } from '../../../shared/store';
import type { Enquiry, EnquiryEmailStatus, EnquirySettings, Order, OrderStatus, StoreOrder } from '../../../shared/store';
import { errorMessage, storeRequest, useAccount } from '../account';
import { OrderCard, orderReference } from '../components/OrderCard';
import { PublisherLogo } from '../components/PublisherLogo';
import { CatalogAdmin } from './CatalogAdmin';
import { AdminOverview } from './AdminOverview';
import { PublisherAnnouncements, PublisherCoupons } from './PublisherUpdates';
import { PublisherEbooks, PublisherPayment, PublisherReviews } from './PublisherCommerce';

type PublisherData = { orders: StoreOrder[]; enquiries: Enquiry[] };
const sections = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'books', label: 'Books', icon: BookOpen },
  { id: 'bundles', label: 'Bundles', icon: Package },
  { id: 'ebooks', label: 'eBook files', icon: Download },
  { id: 'reviews', label: 'Reviews', icon: Star },
  { id: 'categories', label: 'Categories', icon: Tags },
  { id: 'author', label: 'Author profile', icon: UserRound },
  { id: 'content', label: 'Store content', icon: FileText },
  { id: 'orders', label: 'Orders', icon: ClipboardList },
  { id: 'coupons', label: 'Coupons', icon: Tag },
  { id: 'announcements', label: 'Announcements', icon: Bell },
  { id: 'enquiries', label: 'Enquiries', icon: Mail }
] as const;

const enquiryEmailLabels = {
  accepted: 'Accepted by the mail provider',
  failed: 'Email not sent',
  unconfirmed: 'Email delivery unconfirmed'
};

function EnquiryInboxSettings() {
  const [settings, setSettings] = useState<EnquirySettings | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let current = true;
    setError('');
    storeRequest<EnquirySettings>('/publisher/enquiry-settings')
      .then(data => { if (current) setSettings(data); })
      .catch(error => { if (current) setError(errorMessage(error)); });
    return () => { current = false; };
  }, [reload]);

  return <section className="form-panel feature-stack">
    <h3>Contact inbox</h3>
    <p>New Contact messages go to this email address. You can also read them below.</p>
    {settings && <form key={settings.recipient} className="form-stack" onSubmit={async event => {
      event.preventDefault();
      const recipient = new FormData(event.currentTarget).get('recipient');
      setBusy(true);
      setMessage('');
      setError('');
      try {
        setSettings(await storeRequest<EnquirySettings>('/publisher/enquiry-settings', 'PATCH', { recipient }));
        setMessage('Contact email saved.');
      } catch (error) {
        setError(errorMessage(error));
      } finally {
        setBusy(false);
      }
    }}>
      <label className="field">Recipient email<input name="recipient" type="email" required maxLength={254} defaultValue={settings.recipient} /></label>
      <button className="button primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save recipient'}</button>
    </form>}
    {settings && !settings.mailConfigured && <p className="small-note">Email delivery needs a recipient and a mail provider key. Messages are saved below.</p>}
    {message && <p className="feedback" role="status">{message}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {!settings && (error ? <button type="button" className="button secondary" onClick={() => setReload(value => value + 1)}>Try again</button> : <p role="status">Loading contact inbox…</p>)}
  </section>;
}

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

  async function sendEmail(id: string) {
    setBusy(true);
    setError('');
    try {
      const { emailStatus } = await storeRequest<{ emailStatus: EnquiryEmailStatus }>('/publisher/enquiries/' + id + '/email', 'POST', {});
      setData(previous => previous && {
        ...previous,
        enquiries: previous.enquiries.map(item => item.id === id ? { ...item, emailStatus } : item)
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
    {enquiries && <EnquiryInboxSettings />}
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
        {enquiry.bulkDetails && <p><strong>Bulk order</strong> · {enquiry.bulkDetails.quantity} copies · {enquiry.bulkDetails.city}
          {enquiry.bulkDetails.neededBy && <> · Needed by {enquiry.bulkDetails.neededBy}</>}</p>}
        <p className="small-note">{enquiry.emailStatus ? enquiryEmailLabels[enquiry.emailStatus] : 'No email recorded'}</p>
        {(!enquiry.emailStatus || enquiry.emailStatus === 'failed') && <button className="button secondary" type="button" disabled={busy} onClick={() => void sendEmail(enquiry.id)}>
          {enquiry.emailStatus === 'failed' ? 'Retry email' : 'Send email to contact inbox'}
        </button>}
      </article>)}</div>
      : <div className="account-orders">{orders.length === 0 && <p>No orders found.</p>}{orders.map(order => <OrderCard order={order} key={order.id}>
        <p className="operator-customer">{order.fullName} · {order.email}</p>
        <PublisherPayment order={order} disabled={busy} update={patch => setData(previous => previous && {
          ...previous, orders: previous.orders.map(item => item.id === order.id ? { ...item, ...patch } : item)
        })} />
        <div className="inline-actions">{nextOrderStatuses(order).filter(status => status === 'cancelled'
          ? order.refundedAt || (!order.paidAt && !order.paymentLinkId)
          : status === 'confirmed' || status === 'shipped' && order.paymentMethod === 'cod' || order.finalTotal == null || order.paidAt).map(status => <button className={'button ' + (status === 'cancelled' ? 'secondary' : 'primary')} disabled={busy} type="button" key={status} onClick={() => {
          if (order.status !== 'shipped' || status !== 'cancelled' || window.confirm('Have the undelivered books been returned to stock?')) void update(order.id, status);
        }}>
          {status === 'cancelled' ? 'Cancel order' : status === 'confirmed' ? 'Confirm request' : 'Mark ' + orderStatusLabels[status].toLowerCase()}
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
        <div><PublisherLogo />
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
          : section === 'ebooks' ? <PublisherEbooks />
          : section === 'reviews' ? <PublisherReviews />
          : section === 'orders' || section === 'enquiries' ? <Operations key={section + status} enquiries={section === 'enquiries'} initialStatus={status} />
          : <CatalogAdmin key={section + stock + action} section={section} startAdding={action === 'add'} lowStock={stock === 'low'} />}
      </section>
    </div>
  </div>;
}
