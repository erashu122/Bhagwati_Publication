import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Bell, Heart, Tag } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Coupon, StoreNotification } from '../../shared/store';
import { errorMessage, storeRequest, useAccount } from './account';
import { useCatalog } from './catalog';
import { formatPrice } from './data/books';

type Extras = {
  wishlist: string[] | null;
  wishlistError: string;
  refreshWishlist: () => void;
  saveBook: (id: string, saved: boolean) => Promise<void>;
  notifications: StoreNotification[] | null;
  notificationError: string;
  refreshNotifications: () => void;
  markRead: (ids: string[]) => Promise<void>;
};
const ExtrasContext = createContext<Extras | null>(null);

export function CustomerExtrasProvider({ children }: { children: ReactNode }) {
  const { customer, loading } = useAccount();
  const account = customer?.id ?? null;
  const [wishlist, setWishlist] = useState<{ account: string; ids: string[] | null; error: string } | null>(null);
  const [feed, setFeed] = useState<{ account: string | null; items: StoreNotification[] | null; error: string } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [wishlistRefresh, setWishlistRefresh] = useState(0);

  useEffect(() => {
    if (!account) { setWishlist(null); return; }
    let current = true;
    storeRequest<{ bookIds: string[] }>('/wishlist').then(({ bookIds }) => {
      if (current) setWishlist({ account, ids: bookIds, error: '' });
    }).catch(error => {
      if (current) setWishlist({ account, ids: null, error: errorMessage(error) });
    });
    return () => { current = false; };
  }, [account, wishlistRefresh]);

  useEffect(() => {
    if (loading) return;
    let current = true;
    let inFlight = false;
    async function update() {
      if (inFlight) return;
      inFlight = true;
      try {
        const result = await storeRequest<{ notifications: StoreNotification[] }>('/notifications');
        if (current) setFeed({ account, items: result.notifications, error: '' });
      } catch (error) {
        if (current) setFeed(previous => ({ account, items: previous?.account === account ? previous.items : null, error: errorMessage(error) }));
      } finally {
        inFlight = false;
      }
    }
    void update();
    const timer = window.setInterval(update, 30000);
    window.addEventListener('focus', update);
    return () => {
      current = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', update);
    };
  }, [account, loading, refresh]);

  async function saveBook(id: string, saved: boolean) {
    await storeRequest('/wishlist/' + encodeURIComponent(id), 'PATCH', { saved });
    setWishlist(previous => {
      if (previous?.account !== account || !previous?.ids) return previous;
      const ids = previous.ids.filter(item => item !== id);
      return { ...previous, ids: saved ? [id, ...ids] : ids };
    });
  }

  function refreshNotifications() {
    setRefresh(value => value + 1);
  }

  async function markRead(ids: string[]) {
    for (let offset = 0; offset < ids.length; offset += 200) {
      await storeRequest('/notifications/read', 'POST', { ids: ids.slice(offset, offset + 200) });
    }
    refreshNotifications();
  }

  return <ExtrasContext.Provider value={{
    wishlist: wishlist?.account === account ? wishlist.ids : null,
    wishlistError: wishlist?.account === account ? wishlist.error : '',
    refreshWishlist: () => setWishlistRefresh(value => value + 1),
    notifications: feed?.account === account ? feed.items : null,
    notificationError: feed?.account === account ? feed.error : '',
    refreshNotifications, saveBook, markRead
  }}>{children}</ExtrasContext.Provider>;
}

export function useCustomerExtras() {
  const extras = useContext(ExtrasContext);
  if (!extras) throw new Error('CustomerExtrasProvider is required.');
  return extras;
}

export function WishlistButton({ id, title, compact = false }: { id: string; title: string; compact?: boolean }) {
  const { customer, loading } = useAccount();
  const { wishlist, saveBook, wishlistError } = useCustomerExtras();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const saved = wishlist?.includes(id) ?? false;
  const label = saved ? 'Remove from wishlist' : 'Save to wishlist';
  const style = compact ? 'icon-button wishlist-button' : 'button secondary wishlist-button';
  const icon = <Heart size={17} fill={saved ? 'currentColor' : 'none'} aria-hidden="true" />;

  if (!customer && !loading) return <Link className={style} to="/login" aria-label={'Sign in to save ' + title}>{icon}{!compact && 'Sign in to save'}</Link>;
  return <div>
    <button className={style} type="button" aria-pressed={saved} aria-label={label + ' · ' + title}
      title={wishlistError || label} disabled={busy || !wishlist} onClick={async () => {
        setBusy(true);
        setError('');
        try { await saveBook(id, !saved); } catch (error) { setError(errorMessage(error)); } finally { setBusy(false); }
      }}>{icon}{!compact && label}</button>
    {error && <p role="alert" className="small-note">{error}</p>}
  </div>;
}

export function NotificationBell() {
  const { customer } = useAccount();
  const { notifications } = useCustomerExtras();
  const unread = customer ? (notifications?.filter(item => !item.read).length ?? 0) : 0;
  return <Link className="icon-button notification-link" to="/notifications" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}>
    <Bell size={21} strokeWidth={1.6} aria-hidden="true" />
    {unread > 0 && <span className="bag-count" aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}
  </Link>;
}

export function NotificationList() {
  const { customer } = useAccount();
  const { notifications, notificationError, refreshNotifications, markRead } = useCustomerExtras();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const unread = notifications?.filter(item => !item.read).map(item => item.id) ?? [];

  async function read(ids: string[]) {
    setBusy(true);
    setError('');
    try { await markRead(ids); } catch (error) { setError(errorMessage(error)); } finally { setBusy(false); }
  }

  return <div className="feature-stack">
    <div className="section-heading"><div><h2>Notifications</h2><p>New books, publisher announcements and order updates.</p></div>
      <div className="inline-actions">
        <button className="button secondary" type="button" onClick={refreshNotifications}>Refresh</button>
        {customer && unread.length > 0 && <button className="button secondary" type="button" disabled={busy} onClick={() => void read(unread)}>Mark all read</button>}
      </div>
    </div>
    {!customer && <p className="small-note"><Link className="text-link" to="/login?next=notifications">Sign in</Link> to see personal order updates.</p>}
    {(error || notificationError) && <p className="form-error" role="alert">{error || notificationError}</p>}
    {notifications === null ? (!notificationError && <p role="status">Loading notifications…</p>)
      : notifications.length === 0 ? <div className="empty-panel"><Bell size={29} aria-hidden="true" /><h3>You’re all caught up</h3><p>New updates will appear here.</p></div>
      : <ul className="notification-list">{notifications.map(item => <li key={item.id} className={customer && !item.read ? 'unread' : ''}>
        <div><h3>{item.title}</h3><p>{item.message}</p><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString('en-IN')}</time>
          {item.bookId && <Link className="text-link" to={'/books/' + item.bookId}>View book</Link>}
          {item.orderId && <Link className="text-link" to={'/account?tab=orders&view=' + item.orderId}>View order</Link>}
        </div>
        {customer && !item.read && <button className="button secondary" type="button" disabled={busy} onClick={() => void read([item.id])}>Mark read</button>}
      </li>)}</ul>}
  </div>;
}

export function Wishlist() {
  const { wishlist, wishlistError, refreshWishlist } = useCustomerExtras();
  const { booksById, ready, error, refresh } = useCatalog();
  const books = (wishlist ?? []).flatMap(id => {
    const book = booksById.get(id);
    return book ? [book] : [];
  });
  return <div className="feature-stack">
    <div className="section-heading"><div><h2>My wishlist</h2><p>Keep a list of books you’d like to read.</p></div></div>
    {wishlistError ? <div><p className="form-error" role="alert">{wishlistError}</p><button className="button secondary" type="button" onClick={refreshWishlist}>Try again</button></div>
      : error ? <div><p className="form-error" role="alert">{error}</p><button className="button secondary" type="button" onClick={() => void refresh()}>Try again</button></div>
      : !wishlist || !ready ? <p role="status">Loading your wishlist…</p>
      : !books.length ? <div className="empty-panel"><Heart size={29} aria-hidden="true" /><h3>No saved books yet</h3><Link className="button primary" to="/books">Browse books</Link></div>
      : <ul className="notification-list">{books.map(book => <li key={book.id}>
        <div><h3><Link to={'/books/' + book.id}>{book.title}</Link></h3><p>{book.format} · {book.price === null ? 'Price on request' : formatPrice(book.price)}</p></div>
        <WishlistButton id={book.id} title={book.title} compact />
      </li>)}</ul>}
  </div>;
}

export function Coupons() {
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    storeRequest<{ coupons: Coupon[] }>('/coupons').then(result => { if (current) setCoupons(result.coupons); })
      .catch(error => { if (current) setError(errorMessage(error)); });
    return () => { current = false; };
  }, []);
  return <div className="feature-stack">
    <div className="section-heading"><div><h2>My coupons</h2><p>Use one active store coupon on the book subtotal at checkout.</p></div></div>
    {error ? <p className="form-error" role="alert">{error}</p>
      : !coupons ? <p role="status">Loading coupons…</p>
      : !coupons.length ? <div className="empty-panel"><Tag size={29} aria-hidden="true" /><h3>No active offers right now</h3></div>
      : <ul className="notification-list">{coupons.map(coupon => <li key={coupon.code}><div><h3>{coupon.percent}% off books</h3><p>Available at checkout</p></div><code className="coupon-code">{coupon.code}</code></li>)}</ul>}
  </div>;
}
