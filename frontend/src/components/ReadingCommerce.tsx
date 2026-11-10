import { useEffect, useState } from 'react';
import { BookOpen, CreditCard, Download, Star } from 'lucide-react';
import type { Ebook, Order, Review } from '../../../shared/store';
import { errorMessage, storeRequest, useAccount } from '../account';

export function EbookLibrary() {
  const [books, setBooks] = useState<Ebook[] | null>(null);
  const [error, setError] = useState('');
  const [version, refresh] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    storeRequest<{ books: Ebook[] }>('/library').then(data => { if (active) setBooks(data.books); })
      .catch(error => { if (active) setError(errorMessage(error)); });
    return () => { active = false; };
  }, [version]);
  return <section className="feature-stack">
    <div className="section-heading"><div><h2>My eBooks</h2><p>Your paid digital purchases appear here.</p></div></div>
    {error ? <><p className="form-error" role="alert">{error}</p><button className="button secondary" onClick={() => refresh(value => value + 1)}>Try again</button></>
      : !books ? <p role="status">Loading your library…</p>
      : !books.length ? <div className="empty-panel"><BookOpen aria-hidden="true" /><h3>Your library is empty</h3><p>eBooks appear after payment is confirmed.</p></div>
      : <ul className="notification-list">{books.map(book => <li key={book.id}>
        <div><h3>{book.title}</h3>{!book.available && <p>The publisher is preparing the download.</p>}</div>
        {book.available && <a className="button primary" href={'/api/library/' + encodeURIComponent(book.id) + '/download'}><Download size={17} aria-hidden="true" /> Download PDF</a>}
      </li>)}</ul>}
  </section>;
}

type ReviewState = { reviews: Review[]; canReview: boolean; own: Pick<Review, 'rating' | 'comment' | 'approved'> | null };

export function BookReviews({ id }: { id: string }) {
  const { customer } = useAccount();
  const [data, setData] = useState<ReviewState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [version, refresh] = useState(0);
  const path = '/books/' + encodeURIComponent(id) + '/reviews';
  useEffect(() => {
    let active = true;
    storeRequest<ReviewState>(path).then(data => { if (active) setData(data); })
      .catch(error => { if (active) setError(errorMessage(error)); });
    return () => { active = false; };
  }, [path, customer?.id, version]);

  return <section className="reading-preview feature-stack" aria-label="Reader reviews">
    <div className="section-heading"><div><h2>Reader reviews</h2><p>Reviews from customers with a confirmed purchase.</p></div></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {!data && !error && <p role="status">Loading reviews…</p>}
    {data && (data.reviews.length ? <ul className="notification-list">{data.reviews.map(review => <li key={review.id}><div>
      <h3>{review.reviewer}</h3><p><Star size={15} aria-hidden="true" /> {review.rating} out of 5</p><p>{review.comment}</p>
    </div></li>)}</ul> : <p className="small-note">There are no published reviews yet.</p>)}
    {data?.canReview && <form className="form-stack" key={JSON.stringify(data.own)} onSubmit={async event => {
      event.preventDefault();
      const values = new FormData(event.currentTarget);
      setError('');
      setSaved(false);
      setBusy(true);
      try {
        await storeRequest(path, 'POST', { rating: Number(values.get('rating')), comment: values.get('comment') });
        setSaved(true);
        refresh(value => value + 1);
      } catch (error) { setError(errorMessage(error)); }
      finally { setBusy(false); }
    }}>
      <label className="field">Your rating<select name="rating" defaultValue={data.own?.rating ?? 5}>
        {[5,4,3,2,1].map(rating => <option value={rating} key={rating}>{rating} / 5</option>)}
      </select></label>
      <label className="field">Your review<textarea name="comment" required maxLength={1500} rows={3} defaultValue={data.own?.comment} /></label>
      <p className="small-note">Your first name appears with your review after the publisher approves it.</p>
      <button className="button primary" disabled={busy} type="submit">{data.own ? 'Update review' : 'Submit review'}</button>
      {(saved || data.own && !data.own.approved) && <p role="status">Your review is awaiting approval.</p>}
    </form>}
  </section>;
}

export function OrderPayment({ order, enabled, refresh }: { order: Order; enabled: boolean; refresh: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = order.status === 'awaiting_payment';
  if (!(pending || order.status === 'confirmed' && !order.paymentMethod) || order.finalTotal == null || order.paidAt || order.refundedAt) return null;

  async function pay(action: 'open' | 'check' | 'cancel') {
    setError('');
    setBusy(true);
    try {
      const path = '/orders/' + order.id;
      if (action === 'cancel') {
        await storeRequest(path + '/cancel-checkout', 'POST', {});
        refresh();
        return;
      }
      const result = await storeRequest<{ status: string; url?: string }>(path + '/payment', 'POST', { checkOnly: action === 'check' });
      if (action === 'open' && result.url) {
        window.location.assign(result.url);
        return;
      }
      if (result.status === 'expired') setError(pending ? 'This checkout expired. Add the books to your bag to try again.' : 'The link expired. Select Pay online for a new link.');
      else if (!['paid', 'refunded', 'cancelled'].includes(result.status)) setError('Payment is awaiting confirmation.');
      refresh();
    } catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  }
  return <div className="feature-stack">
    {pending && <p className="small-note">Your order will be confirmed after payment. Unpaid checkouts expire.</p>}
    {!enabled && <p className="small-note">Online payment is currently unavailable.</p>}
    <div className="inline-actions">
      {enabled && <button type="button" className="button primary" disabled={busy} onClick={() => void pay('open')}><CreditCard size={16} aria-hidden="true" /> {busy ? 'Checking…' : order.paymentMethod === 'upi' ? 'Pay by UPI / QR' : 'Pay online'}</button>}
      {enabled && order.paymentLinkId && <button type="button" className="button secondary" disabled={busy} onClick={() => void pay('check')}>Check payment</button>}
      {pending && <button type="button" className="button secondary" disabled={busy} onClick={() => { if (window.confirm('Cancel this unpaid checkout?')) void pay('cancel'); }}>Cancel checkout</button>}
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
