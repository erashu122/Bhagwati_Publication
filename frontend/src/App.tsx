import { useEffect, useReducer, useState } from 'react';
import { BookOpen, Check, Menu, Search, ShoppingBag, UserRound, X } from 'lucide-react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import type { Order } from '../../shared/store';
import { homeDescription, homeTitle, publicPages, siteOrigin } from '../../shared/site';
import { AccountProvider, RequireAccount, useAccount } from './account';
import { CatalogProvider, CatalogReady, useCatalog } from './catalog';
import { cartStorageKey, maxQuantity, readCart } from './cart';
import type { Cart } from './cart';
import { Brand } from './components/Storefront';
import { canOrder } from './data/books';
import { Bag, Checkout } from './pages/Bag';
import { BookDetails, Catalog } from './pages/Books';
import { Home } from './pages/Home';
import { Author } from './pages/Author';
import { About, Contact, NotFound, Policy } from './pages/Information';
import { Dashboard, ResetAdminPassword, SignIn } from './pages/Account';
import { Publisher } from './pages/Publisher';
import { CustomerExtrasProvider, NotificationBell, NotificationList, useCustomerExtras } from './customer-extras';
import { StoreChat } from './components/StoreChat';

const navLinks = [['/', 'Home'], ['/books', 'All Books'], ['/about', 'Our Story'], ['/contact', 'Contact']];

type CartState = { cart: Cart; toast: { message: string } | null };
type CartAction = { type: 'add'; id: string; limit: number } | { type: 'set'; id: string; quantity: number } | { type: 'dismiss' } | { type: 'order'; order: Order };

function updateCart(state: CartState, action: CartAction): CartState {
  if (action.type === 'dismiss') return { ...state, toast: null };
  if (action.type === 'order') {
    const cart = { ...state.cart };
    for (const line of action.order.lines) {
      const remaining = (cart[line.id] ?? 0) - line.quantity;
      if (remaining > 0) cart[line.id] = remaining;
      else delete cart[line.id];
    }
    return { cart, toast: null };
  }
  const quantity = Object.hasOwn(state.cart, action.id) ? state.cart[action.id] : 0;
  if (action.type === 'add') {
    if (quantity >= action.limit) return { ...state, toast: { message: `Up to ${action.limit} copies available per order.` } };
    return { cart: { ...state.cart, [action.id]: quantity + 1 }, toast: { message: 'Added to your book bag.' } };
  }

  if (!Number.isInteger(action.quantity) || action.quantity < 0 || action.quantity > maxQuantity) return state;
  const cart = { ...state.cart };
  if (action.quantity === 0) delete cart[action.id];
  else cart[action.id] = action.quantity;
  return { ...state, cart };
}

function Header({ count }: { count: number }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { customer } = useAccount();
  const { content } = useCatalog();
  return <>
    {content.announcement && <div className="announcement"><BookOpen size={14} strokeWidth={1.5} aria-hidden="true" /> {content.announcement}</div>}
    <header className="header">
      <div className="container header-inner">
        <Brand />
        <nav id="primary-nav" className={'main-nav' + (menuOpen ? ' nav-open' : '')} aria-label="Main navigation">
          {navLinks.map(([path, name]) => <NavLink key={path} to={path} end={path === '/'} onClick={() => setMenuOpen(false)}>{name}</NavLink>)}
        </nav>
        <div className="header-actions">
          <Link className="icon-button header-search" to="/books" aria-label="Search books"><Search size={21} strokeWidth={1.6} aria-hidden="true" /></Link>
          <NotificationBell />
          <NavLink className="icon-button account-link" to={customer ? '/account' : '/login'} aria-label={customer ? 'My account' : 'Sign in'}><UserRound size={21} strokeWidth={1.6} aria-hidden="true" /></NavLink>
          <Link className="icon-button bag-link" to="/cart" aria-label={'Book bag, ' + count + (count === 1 ? ' copy' : ' copies')}>
            <ShoppingBag size={21} strokeWidth={1.6} aria-hidden="true" /><span className="bag-count" aria-hidden="true">{count}</span>
          </Link>
          <button className="icon-button menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="primary-nav" aria-label={menuOpen ? 'Close menu' : 'Open menu'} onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
          </button>
        </div>
      </div>
    </header>
  </>;
}

function Footer() {
  return <footer className="footer"><div className="container">
    <div className="footer-grid">
      <div><Brand imprint /><p>Books on business, leadership, technology and Hindi literature.</p></div>
      <nav aria-label="Explore"><h2>Explore</h2><Link to="/books">All books</Link><Link to="/books?format=Bundle">Book bundles</Link><Link to="/author">Meet the author</Link><Link to="/about">Our story</Link><Link to="/contact">Contact</Link><Link to="/contact?type=bulk">Bulk orders</Link><Link to="/account">My account</Link></nav>
      <nav aria-label="Store policies"><h2>Store policies</h2><Link to="/policies/shipping">Shipping</Link><Link to="/policies/returns">Returns</Link><Link to="/policies/privacy">Privacy</Link></nav>
    </div>
    <div className="footer-bottom"><span>Bhagwati Publications</span><span>Final prices and availability subject to publisher confirmation</span></div>
  </div></footer>;
}

function PageMetadata() {
  const { pathname } = useLocation();
  const { booksById, ready } = useCatalog();
  const path = pathname.replace(/\/+$/u, '') || '/';
  const bookPath = path.startsWith('/books/');
  const book = bookPath ? booksById.get(path.slice('/books/'.length)) : undefined;
  const title = book?.title ?? publicPages[path];
  const description = book?.description || homeDescription;

  useEffect(() => {
    document.title = title && path !== '/' ? title + ' | Bhagwati Publications' : homeTitle;
    document.querySelector('meta[name="description"]')?.setAttribute('content', description);
    const canonical = document.querySelector('link[rel="canonical"]');
    const robots = document.querySelector('meta[name="robots"]');
    if (title) {
      robots?.remove();
      const link = canonical ?? document.createElement('link');
      link.setAttribute('rel', 'canonical');
      link.setAttribute('href', siteOrigin + path);
      if (!canonical) document.head.append(link);
    } else if (!bookPath || ready) {
      canonical?.remove();
      const meta = robots ?? document.createElement('meta');
      meta.setAttribute('name', 'robots');
      meta.setAttribute('content', 'noindex');
      if (!robots) document.head.append(meta);
    } else {
      canonical?.remove();
      robots?.remove();
    }
  }, [bookPath, description, path, ready, title]);

  return null;
}

export function App() {
  return <AccountProvider><CatalogProvider><CustomerExtrasProvider><Storefront /></CustomerExtrasProvider></CatalogProvider></AccountProvider>;
}

function Storefront() {
  const [{ cart, toast }, dispatch] = useReducer(updateCart, null, () => ({ cart: readCart(), toast: null }));
  const { customer } = useAccount();
  const { booksById } = useCatalog();
  const { pathname } = useLocation();
  const { refreshNotifications } = useCustomerExtras();

  useEffect(() => {
    try {
      localStorage.setItem(cartStorageKey, JSON.stringify(cart));
    } catch {
      // The active cart still works when storage is blocked or full.
    }
  }, [cart]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => dispatch({ type: 'dismiss' }), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  const add = (id: string) => {
    const book = booksById.get(id);
    if (canOrder(book)) dispatch({ type: 'add', id, limit: Math.min(book.stock ?? maxQuantity, maxQuantity) });
  };
  const change = (id: string, quantity: number) => dispatch({ type: 'set', id, quantity });
  const count = Object.values(cart).reduce((total, quantity) => total + quantity, 0);
  const checkout = <Checkout cart={cart} complete={order => {
    dispatch({ type: 'order', order });
    refreshNotifications();
  }} />;

  return <>
    <PageMetadata />
    <a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); document.getElementById('main-content')?.focus(); }}>Skip to content</a>
    <Header key={pathname} count={count} />
    <main id="main-content" tabIndex={-1}>
      <Routes>
        <Route path="/" element={<CatalogReady><Home add={add} /></CatalogReady>} />
        <Route path="/books" element={<CatalogReady><Catalog add={add} /></CatalogReady>} />
        <Route path="/books/:id" element={<CatalogReady><BookDetails add={add} /></CatalogReady>} />
        <Route path="/author" element={<CatalogReady><Author add={add} /></CatalogReady>} />
        <Route path="/cart" element={<CatalogReady><Bag cart={cart} change={change} /></CatalogReady>} />
        <Route path="/checkout" element={<CatalogReady>{count ? <RequireAccount checkout>{checkout}</RequireAccount> : checkout}</CatalogReady>} />
        <Route path="/login" element={<SignIn key="login" register={false} />} />
        <Route path="/forgot-password" element={<ResetAdminPassword />} />
        <Route path="/register" element={<SignIn key="register" register />} />
        <Route path="/account" element={<RequireAccount>{customer && <Dashboard key={customer.id} customer={customer} cartCount={count} />}</RequireAccount>} />
        <Route path="/notifications" element={<section className="container section page-content">
          <p className="eyebrow"><span className="diamond" /> YOUR BOOKSHOP</p><h1>Store updates</h1><NotificationList />
        </section>} />
        <Route path="/publisher" element={<RequireAccount operator><Publisher /></RequireAccount>} />
        <Route path="/admin" element={<RequireAccount operator><Publisher /></RequireAccount>} />
        <Route path="/about" element={<CatalogReady><About /></CatalogReady>} />
        <Route path="/contact" element={<CatalogReady><Contact /></CatalogReady>} />
        <Route path="/policies/:id" element={<CatalogReady><Policy /></CatalogReady>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </main>
    <Footer />
    <StoreChat />
    <div className="toast-region" role="status" aria-atomic="true">
      {toast && <div className="toast"><Check size={18} aria-hidden="true" /><span>{toast.message}</span><button type="button" className="icon-button" aria-label="Dismiss notification" onClick={() => dispatch({ type: 'dismiss' })}><X size={17} aria-hidden="true" /></button></div>}
    </div>
  </>;
}
