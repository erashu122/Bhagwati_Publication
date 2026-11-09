import { useEffect, useId, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, BookOpen, CheckCircle2, Eye, EyeOff, LayoutGrid, LogOut, MapPin, Package, ShieldCheck, ShoppingBag, UserRound } from 'lucide-react';
import { Link, Navigate, useNavigate, useSearchParams, createSearchParams } from 'react-router-dom';
import type { Customer, Order } from '../../../shared/store';
import { AccountLoading, errorMessage, StoreError, storeRequest, useAccount } from '../account';
import { AddressFields, readAddress } from '../components/AddressFields';
import { BookCover } from '../components/BookCover';
import { OrderCard, orderReference } from '../components/OrderCard';
import { BrowseLink } from '../components/Storefront';
import { useCatalog } from '../catalog';

function PasswordField({ label = 'Password', name = 'password', create = false }: {
  label?: string;
  name?: string;
  create?: boolean;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return <div className="field">
    <label htmlFor={id}>{label}</label>
    <div className="password-input">
      <input id={id} required name={name} type={visible ? 'text' : 'password'} maxLength={128}
        minLength={create ? 12 : undefined} autoComplete={create ? 'new-password' : 'current-password'}
        autoCapitalize="none" spellCheck={false} />
      <button type="button" aria-controls={id} aria-label={visible ? 'Hide ' + label.toLowerCase() : 'Show ' + label.toLowerCase()}
        onClick={() => setVisible(value => !value)}>
        {visible ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
      </button>
    </div>
  </div>;
}

export function SignIn({ register }: { register: boolean }) {
  const { customer, setCustomer, loading, error: sessionError } = useAccount();
  const { books } = useCatalog();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fromCheckout = params.get('next') === 'checkout';
  const fromAdmin = params.get('next') === 'admin';
  const destination = (account: Customer) => fromCheckout ? '/account?next=checkout'
    : account.operator ? '/admin' : '/account';

  if (loading || sessionError) return <AccountLoading />;
  if (customer) return <Navigate replace to={destination(customer)} />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setError('');
    try {
      const result = await storeRequest<{ customer: Customer }>(register ? '/register' : '/login', 'POST', values);
      setCustomer(result.customer);
      navigate(destination(result.customer), { replace: true });
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return <section className="container section auth-layout">
    <div className="auth-art">
      <p className="eyebrow"><BookOpen size={16} aria-hidden="true" /> BHAGWATI PUBLICATION</p>
      <h2>A place for your reading journey.</h2>
      <p>Keep your delivery details and orders together as you explore the collection.</p>
      {books[0] && <div className="auth-cover" aria-hidden="true"><BookCover book={books[3] ?? books[0]} /></div>}
    </div>
    <div className="auth-form">
      <p className="eyebrow"><span className="diamond" /> YOUR ACCOUNT</p>
      <h1>{register ? 'Create your account' : 'Welcome back'}</h1>
      <p className="page-intro">{fromCheckout ? 'Your books are still in your bag. Sign in or create an account to continue checkout.'
        : fromAdmin ? 'Sign in with your publisher account to open the admin dashboard.'
        : 'Your account is where you can manage your orders and delivery details.'}</p>
      <form onSubmit={submit} className="form-stack">
        {register && <label className="field">Full name<input required name="fullName" maxLength={100} autoComplete="name" /></label>}
        <label className="field">{register ? 'Email address' : 'Email or admin ID'}
          <input required name="email" type={register ? 'email' : 'text'} maxLength={254}
            autoComplete={register ? 'email' : 'username'} autoCapitalize="none" spellCheck={false} />
        </label>
        <PasswordField create={register} />
        {register ? <p className="small-note">Use at least 12 characters.</p>
          : <Link className="text-link forgot-password" to="/forgot-password">Forgot password?</Link>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button primary" disabled={busy} type="submit">{busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'} <ArrowRight size={17} aria-hidden="true" /></button>
      </form>
      <p className="auth-switch">{register ? 'Already have an account?' : 'New to Bhagwati Publication?'}{' '}
        <Link className="text-link" to={(register ? '/login' : '/register') + (fromCheckout ? '?next=checkout' : '')}>{register ? 'Sign in' : 'Create an account'}</Link>
      </p>
    </div>
  </section>;
}

export function ResetAdminPassword() {
  const { setCustomer } = useAccount();
  const [sending, setSending] = useState(false);
  const [delivery, setDelivery] = useState<{ error: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = new FormData(event.currentTarget).get('email');
    setSending(true);
    setDelivery(null);
    try {
      await storeRequest('/admin/recovery-email', 'POST', { email });
      setDelivery({ error: false, message: 'If the address matches the recovery email, check your inbox and spam folder. A recent code remains valid for 30 minutes.' });
    } catch (error) {
      setDelivery({ error: true, message: errorMessage(error) });
    } finally {
      setSending(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setError('');
    try {
      await storeRequest('/admin/password-reset', 'POST', values);
      setCustomer(null);
      setComplete(true);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return <section className="container section">
    <div className="auth-form recovery-form">
      <p className="eyebrow"><ShieldCheck size={16} aria-hidden="true" /> PUBLISHER ACCESS</p>
      <h1>{complete ? 'Password updated' : 'Reset admin password'}</h1>
      {complete ? <p className="feedback" role="status"><CheckCircle2 size={18} aria-hidden="true" /> Sign in with the ID <strong>admin</strong> and your new password.</p>
        : <>
          <p className="page-intro">Your admin ID is <strong>admin</strong>. Request a code using your recovery email, or enter a code you already have.</p>
          <form className="form-stack recovery-email-form" onSubmit={requestCode}>
            <label className="field">Recovery email<input name="email" type="email" required maxLength={254}
              autoComplete="email" autoCapitalize="none" spellCheck={false} /></label>
            <button className="button secondary" type="submit" disabled={sending}>{sending ? 'Requesting…' : 'Email me a code'}</button>
            {delivery && <p className={delivery.error ? 'form-error' : 'small-note'} role={delivery.error ? 'alert' : 'status'}>{delivery.message}</p>}
          </form>
          <form className="form-stack" onSubmit={submit}>
            <label className="field">Recovery code<input name="code" required type="password" maxLength={64}
              autoComplete="one-time-code" autoCapitalize="none" spellCheck={false} /></label>
            <PasswordField label="New password" create />
            <PasswordField label="Confirm password" name="confirmPassword" create />
            <p className="small-note">Use at least 12 characters.</p>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Set new password'} <ArrowRight size={17} aria-hidden="true" /></button>
          </form>
        </>}
      <p className="auth-switch"><Link className="text-link" to="/login?next=admin">Back to admin sign-in</Link></p>
    </div>
  </section>;
}

function ProfileEditor({ customer }: { customer: Customer }) {
  const { setCustomer } = useAccount();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function update(path: string, body: unknown, message: string) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await storeRequest<{ customer: Customer }>(path, 'PATCH', body);
      setCustomer(result.customer);
      setMessage(message);
    } catch (error) {
      if (error instanceof StoreError && error.status === 401) setCustomer(null);
      else setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return <div className="profile-settings">
    <section className="form-panel profile-panel">
      <h2><UserRound size={20} aria-hidden="true" /> Profile details</h2>
      <form className="form-stack" onSubmit={event => {
        event.preventDefault();
        void update('/profile', { fullName: new FormData(event.currentTarget).get('fullName') }, 'Your profile was updated.');
      }}>
        <label className="field">Full name<input name="fullName" required maxLength={100} autoComplete="name" defaultValue={customer.fullName} /></label>
        <label className="field">Account email<input readOnly value={customer.email} /></label>
        <button className="button secondary" disabled={busy} type="submit">Save profile</button>
      </form>
    </section>
    <section className="form-panel profile-panel">
      <h2><MapPin size={20} aria-hidden="true" /> Default delivery address</h2>
      <p className="small-note">Use this address to fill in delivery details at checkout.</p>
      <form key={JSON.stringify(customer.address)} className="form-stack" onSubmit={event => {
        event.preventDefault();
        void update('/address', { address: readAddress(new FormData(event.currentTarget)) }, 'Your delivery address was saved.');
      }}>
        <AddressFields address={customer.address} fullName={customer.fullName} />
        <div className="inline-actions">
          <button className="button primary" disabled={busy} type="submit">Save address</button>
          {customer.address && <button className="button secondary" disabled={busy} type="button" onClick={() => void update('/address', { address: null }, 'Your default delivery address was removed.')}>Remove saved address</button>}
        </div>
      </form>
    </section>
    <div role="status">{message && <p className="feedback"><CheckCircle2 size={18} aria-hidden="true" />{message}</p>}</div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}

export function Dashboard({ customer, cartCount }: { customer: Customer; cartCount: number }) {
  const { setCustomer } = useAccount();
  const [params] = useSearchParams();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [orderError, setOrderError] = useState('');
  const [logoutError, setLogoutError] = useState('');
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const tab = params.get('tab') === 'profile' ? 'profile'
    : params.get('tab') === 'orders' || params.has('order') ? 'orders' : 'overview';
  const justPlaced = orders?.find(order => order.id === params.get('order'));
  const fromCheckout = params.get('next') === 'checkout';
  const accountPage = (page: 'overview' | 'orders' | 'profile') => {
    const search = createSearchParams();
    if (page !== 'overview') search.set('tab', page);
    if (fromCheckout) search.set('next', 'checkout');
    return { pathname: '/account', search: search.toString() };
  };

  useEffect(() => {
    let current = true;
    setOrderError('');
    storeRequest<{ orders: Order[] }>('/orders').then(result => {
      if (current) setOrders(result.orders);
    }).catch(error => {
      if (!current) return;
      if (error instanceof StoreError && error.status === 401) setCustomer(null);
      else setOrderError(errorMessage(error));
    });
    return () => { current = false; };
  }, [customer.id, reload, setCustomer]);

  async function logout() {
    setLogoutBusy(true);
    setLogoutError('');
    try {
      await storeRequest('/logout', 'POST', {});
      setCustomer(null);
    } catch (error) {
      setLogoutError(errorMessage(error));
    } finally {
      setLogoutBusy(false);
    }
  }

  return <>
    <section className="dashboard-banner">
      <div className="container dashboard-head">
        <div><p className="eyebrow"><span className="diamond" /> CUSTOMER DASHBOARD</p>
          <h1>Welcome, {customer.fullName.split(/\s+/u)[0]}.</h1><p>Manage your profile and follow your orders.</p>
        </div>
        <button type="button" className="button dashboard-logout" disabled={logoutBusy} onClick={() => void logout()}><LogOut size={17} aria-hidden="true" /> Sign out</button>
      </div>
    </section>
    <section className="container section dashboard-content">
      {logoutError && <p className="form-error" role="alert">{logoutError}</p>}
      {fromCheckout && cartCount > 0 && <div className="dashboard-callout">
        <div><h2>Your bag is ready</h2><p>Your books stayed in your bag while you opened your account.</p></div>
        <Link className="button primary" to="/checkout">Continue to checkout <ArrowRight size={17} aria-hidden="true" /></Link>
      </div>}
      {justPlaced && <p className="order-success" role="status"><CheckCircle2 size={23} aria-hidden="true" /><span><strong>Order request {orderReference(justPlaced.id)} received.</strong> The publisher will review availability and final charges before fulfillment.</span></p>}
      <div className="dashboard-metrics">
        <Link to="/cart"><span className="dashboard-icon"><ShoppingBag size={21} aria-hidden="true" /></span><span><small>Book bag</small><strong>{cartCount} {cartCount === 1 ? 'copy' : 'copies'}</strong></span><ArrowRight className="dashboard-arrow" size={17} aria-hidden="true" /></Link>
        <Link to={accountPage('orders')}><span className="dashboard-icon"><Package size={21} aria-hidden="true" /></span><span><small>Order requests</small><strong>{orders?.length ?? '—'}</strong></span><ArrowRight className="dashboard-arrow" size={17} aria-hidden="true" /></Link>
        <Link to={accountPage('profile')}><span className="dashboard-icon"><MapPin size={21} aria-hidden="true" /></span><span><small>Delivery address</small><strong>{customer.address ? 'Saved' : 'Add an address'}</strong></span><ArrowRight className="dashboard-arrow" size={17} aria-hidden="true" /></Link>
      </div>
      <nav className="dashboard-nav" aria-label="Account navigation">
        <Link to={accountPage('overview')} aria-current={tab === 'overview' ? 'page' : undefined}><LayoutGrid size={17} aria-hidden="true" /> Overview</Link>
        <Link to={accountPage('orders')} aria-current={tab === 'orders' ? 'page' : undefined}><Package size={17} aria-hidden="true" /> My orders</Link>
        <Link to={accountPage('profile')} aria-current={tab === 'profile' ? 'page' : undefined}><UserRound size={17} aria-hidden="true" /> Profile &amp; address</Link>
        {customer.operator && <Link to="/admin"><ShieldCheck size={17} aria-hidden="true" /> Admin dashboard</Link>}
      </nav>
      {tab === 'overview' && <section className="dashboard-callout">
        <div><h2>{cartCount ? 'Pick up where you left off' : 'Find your next read'}</h2>
          <p>{cartCount ? 'Review the books in your bag whenever you’re ready.' : 'Explore a new title and read a preview before adding it to your bag.'}</p></div>
        {cartCount ? <Link className="button primary" to="/cart">View book bag <ArrowRight size={17} aria-hidden="true" /></Link> : <BrowseLink>Browse books</BrowseLink>}
      </section>}
      {tab === 'profile' ? <ProfileEditor customer={customer} /> : <>
        <div className="section-heading">
          <div><h2>{tab === 'orders' ? 'My orders' : 'Latest order'}</h2><p>View order details and track the current status.</p></div>
          {tab === 'overview' && !!orders?.length && <Link className="text-link" to={accountPage('orders')}>View all orders <ArrowRight size={17} aria-hidden="true" /></Link>}
        </div>
        {orderError ? <div className="empty-panel"><p role="alert">{orderError}</p><button className="button primary" type="button" onClick={() => setReload(value => value + 1)}>Try again</button></div>
          : orders === null ? <p role="status">Loading your orders…</p>
          : orders.length === 0 ? <div className="empty-panel"><Package size={32} aria-hidden="true" /><h2>No orders yet</h2><p>Your order requests will appear here.</p></div>
          : <div className="account-orders">{(tab === 'overview' ? orders.slice(0, 1) : orders).map(order => <OrderCard key={order.id} order={order} />)}</div>}
      </>}
    </section>
  </>;
}
