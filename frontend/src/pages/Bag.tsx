import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, BookOpen, Minus, Plus, Trash2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { couponDiscount } from '../../../shared/store';
import type { Coupon, Order } from '../../../shared/store';
import { errorMessage, StoreError, storeRequest, useAccount } from '../account';
import { AddressFields, readAddress } from '../components/AddressFields';
import { cartItems, maxQuantity } from '../cart';
import type { Cart } from '../cart';
import { useCatalog } from '../catalog';
import { BookCover } from '../components/BookCover';
import { EmptyBag } from '../components/Storefront';
import { canOrder, formatPrice } from '../data/books';

function OrderSummary({ items, checkout = false, needsShipping = true, blocked = false, coupon }: {
  items: ReturnType<typeof cartItems>; checkout?: boolean; needsShipping?: boolean; blocked?: boolean; coupon?: Coupon;
}) {
  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const discount = coupon ? couponDiscount(subtotal, coupon.percent) : 0;
  return <aside className="order-summary">
    <h2>Order summary</h2>
    {checkout && <ul className="summary-items">{items.map(({ book, quantity, total }) => <li key={book.id}>
      <span lang={book.language === 'Hindi' ? 'hi' : 'en'}>{book.title} × {quantity}</span><span>{formatPrice(total)}</span>
    </li>)}</ul>}
    <dl><div><dt>Estimated book subtotal</dt><dd>{formatPrice(subtotal)}</dd></div>
    {coupon && <><div><dt>{coupon.code} ({coupon.percent}% off)</dt><dd>−{formatPrice(discount)}</dd></div>
      <div><dt>After discount</dt><dd>{formatPrice(subtotal - discount)}</dd></div></>}
    <div><dt>Shipping</dt><dd>{!needsShipping ? 'Not required' : 'Pending confirmation'}</dd></div>
    {checkout && <div><dt>Tax</dt><dd>Pending confirmation</dd></div>}</dl>
    {!checkout && (blocked ? <p className="small-note checkout-note">Review the items in your bag before continuing.</p> : <Link className="button primary" to="/checkout">Continue to checkout <ArrowRight size={17} aria-hidden="true" /></Link>)}
  </aside>;
}

export function Bag({ cart, change }: { cart: Cart; change: (id: string, quantity: number) => void }) {
  const { booksById } = useCatalog();
  const items = cartItems(cart, booksById);
  const unavailable = Object.keys(cart).filter(id => !canOrder(booksById.get(id)));
  const blocked = unavailable.length > 0 || items.some(({ book, quantity }) => quantity > (book.stock ?? maxQuantity));
  return <section className="container section page-content">
    <p className="eyebrow"><span className="diamond" /> YOUR BOOKSHELF</p><h1>Book bag</h1>
    {items.length === 0 && unavailable.length === 0 ? <EmptyBag /> : <div className="order-grid">
      <ul className="bag-items">{items.map(({ book, quantity, total }) => <li className="bag-item" key={book.id}>
        <Link to={'/books/' + book.id} className={'bag-cover stage-' + book.palette} aria-label={'View ' + book.title}><BookCover book={book} /></Link>
        <div className="bag-description">
          <h2><Link to={'/books/' + book.id} lang={book.language === 'Hindi' ? 'hi' : 'en'}>{book.title}</Link></h2>
          <p>{book.format} · {formatPrice(book.price)} per copy</p>
          {book.stock !== null && quantity > book.stock && <p className="form-error">Only {book.stock} copies are available.</p>}
          <div className="bag-actions">
            <div className="stepper" role="group" aria-label={'Quantity for ' + book.title}>
              <button type="button" disabled={quantity <= 1} onClick={() => change(book.id, quantity - 1)} aria-label={'Decrease quantity for ' + book.title}><Minus size={15} aria-hidden="true" /></button>
              <span aria-live="polite">{quantity}</span>
              <button type="button" disabled={quantity >= Math.min(book.stock ?? maxQuantity, maxQuantity)} onClick={() => change(book.id, quantity + 1)} aria-label={'Increase quantity for ' + book.title}><Plus size={15} aria-hidden="true" /></button>
            </div>
            <button type="button" className="remove-button" onClick={() => change(book.id, 0)} aria-label={'Remove ' + book.title}><Trash2 size={15} aria-hidden="true" /> Remove</button>
          </div>
        </div><strong className="line-price">{formatPrice(total)}</strong>
      </li>)}{unavailable.map(id => <li className="form-panel" key={id}>
        <p>{booksById.get(id)?.title ?? 'An item in your bag'} is no longer available.</p>
        <button className="remove-button" type="button" onClick={() => change(id, 0)}><Trash2 size={15} aria-hidden="true" /> Remove unavailable item</button>
      </li>)}</ul>
      <OrderSummary items={items} blocked={blocked} needsShipping={items.some(item => item.book.format !== 'eBook')} />
    </div>}
    {items.length > 0 && <Link className="text-link return-link" to="/books">Continue browsing <ArrowRight size={17} aria-hidden="true" /></Link>}
  </section>;
}

function checkoutKey(customerId: string, cart: Cart, previous: { fingerprint: string; key: string } | null) {
  const fingerprint = JSON.stringify(Object.entries(cart).sort(([a], [b]) => a.localeCompare(b)));
  const storageKey = 'bhagwati.checkout.' + customerId;
  if (previous?.fingerprint === fingerprint) return previous;
  try {
    const stored = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null');
    if (stored?.fingerprint === fingerprint && typeof stored.key === 'string' && /^[a-f0-9-]{36}$/i.test(stored.key)) return stored as { fingerprint: string; key: string };
  } catch {
    // The active checkout can still reuse its request key.
  }
  const request = { fingerprint, key: crypto.randomUUID() };
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(request));
  } catch {
    // Use the in-memory key when storage is blocked.
  }
  return request;
}

export function Checkout({ cart, complete }: { cart: Cart; complete: (order: Order) => void }) {
  const { booksById, refresh } = useCatalog();
  const items = cartItems(cart, booksById);
  const blocked = items.length !== Object.keys(cart).length || items.some(({ book, quantity }) => quantity > (book.stock ?? maxQuantity));
  const { customer, setCustomer } = useAccount();
  const navigate = useNavigate();
  const request = useRef<{ fingerprint: string; key: string } | null>(null);
  const sending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [selectedCode, setSelectedCode] = useState('');
  const [couponError, setCouponError] = useState('');
  const [reloadCoupons, setReloadCoupons] = useState(0);
  const activeCoupon = coupons.find(coupon => coupon.code === selectedCode);
  const needsShipping = items.some(item => item.book.format !== 'eBook');
  const customerId = customer?.id;

  useEffect(() => {
    if (!customerId) return;
    let current = true;
    setCouponError('');
    storeRequest<{ coupons: Coupon[] }>('/coupons').then(result => {
      if (!current) return;
      setCoupons(result.coupons);
      setSelectedCode(code => result.coupons.some(coupon => coupon.code === code) ? code : '');
    }).catch(error => { if (current) setCouponError(errorMessage(error)); });
    return () => { current = false; };
  }, [customerId, reloadCoupons]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customer || blocked || sending.current) return;
    const form = new FormData(event.currentTarget);
    const saveAddress = needsShipping && form.get('saveAddress') === 'on';
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      request.current = checkoutKey(customer.id, cart, request.current);
      const { order } = await storeRequest<{ order: Order }>('/orders', 'POST', {
        cart,
        quote: Object.fromEntries(items.map(({ book }) => [book.id, `${book.price}:${book.format}`])),
        requestKey: request.current.key,
        address: needsShipping ? readAddress(form) : null,
        saveAddress,
        coupon: activeCoupon && { code: activeCoupon.code, percent: activeCoupon.percent }
      });
      try {
        sessionStorage.removeItem('bhagwati.checkout.' + customer.id);
      } catch {
        // The server has already recorded the order.
      }
      if (saveAddress && order.address) setCustomer({ ...customer, address: order.address });
      complete(order);
      navigate('/account?order=' + order.id, { replace: true });
    } catch (error) {
      if (error instanceof StoreError && error.status === 401) setCustomer(null);
      else {
        setError(errorMessage(error));
        if (error instanceof StoreError && error.status === 409) {
          setReloadCoupons(value => value + 1);
          await refresh();
        }
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return <section className="container section page-content">
    <p className="eyebrow"><span className="diamond" /> YOUR BOOK BAG</p><h1>Checkout</h1>
    {blocked ? <div className="empty-panel"><h2>Review your book bag</h2><p>Some books or quantities are unavailable.</p><Link className="button primary" to="/cart">Return to bag</Link></div>
      : items.length === 0 ? <EmptyBag /> : customer && <>
      <ol className="checkout-steps" aria-label="Checkout progress">
        <li><span>1</span> Book bag</li><li><span>2</span> Account</li><li aria-current="step"><span>3</span> Delivery &amp; review</li>
      </ol>
      <div className="order-grid">
        <form className="form-panel checkout-form" onSubmit={submit}>
          <h2>Contact</h2><p className="checkout-email"><strong>{customer.fullName}</strong><span>{customer.email}</span></p>
          {needsShipping ? <>
            <h2 className="delivery-heading">Delivery address</h2>
            <AddressFields address={customer.address} fullName={customer.fullName} phone={customer.phone} />
            <label className="checkbox-field"><input name="saveAddress" type="checkbox" /> Save this as my default delivery address</label>
          </> : <p className="digital-note"><BookOpen size={18} aria-hidden="true" /> Your bag contains eBooks only. A shipping address is unnecessary.</p>}
          <h2 className="delivery-heading">Coupons &amp; payment</h2>
          <label className="field">Apply a coupon
            <select value={selectedCode} disabled={busy || !coupons.length} onChange={event => setSelectedCode(event.target.value)}>
              <option value="">{coupons.length ? 'No coupon' : 'No active coupons'}</option>
              {coupons.map(coupon => <option key={coupon.code} value={coupon.code}>{coupon.code} · {coupon.percent}% off books</option>)}
            </select>
          </label>
          {couponError && <p className="form-error" role="alert">{couponError} <button className="text-link" type="button" onClick={() => setReloadCoupons(value => value + 1)}>Retry coupons</button></p>}
          <p className="checkout-note">The publisher will confirm availability, final charges and payment instructions. No payment is collected here.</p>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button primary" disabled={busy} type="submit">{busy ? 'Submitting…' : 'Submit order request'} <ArrowRight size={17} aria-hidden="true" /></button>
        </form>
        <OrderSummary items={items} checkout needsShipping={needsShipping} coupon={activeCoupon} />
      </div>
    </>}
  </section>;
}
