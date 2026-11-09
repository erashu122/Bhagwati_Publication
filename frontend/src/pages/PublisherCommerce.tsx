import { useEffect, useState } from 'react';
import type { Ebook, Order, Review } from '../../../shared/store';
import { errorMessage, storeRequest } from '../account';

export function PublisherEbooks() {
  const [books, setBooks] = useState<Ebook[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    storeRequest<{ books: Ebook[] }>('/publisher/ebooks').then(data => setBooks(data.books))
      .catch(error => setError(errorMessage(error)));
  }, []);

  return <div className="feature-stack">
    <div className="admin-tools"><div><h2>eBook files</h2><p>Upload a PDF up to 4 MB. Customers with a paid order can download it in My eBooks.</p></div></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {message && <p className="feedback" role="status">{message}</p>}
    {!books ? !error && <p role="status">Loading eBooks…</p> : !books.length ? <p>No eBook titles yet.</p>
      : <ul className="notification-list">{books.map(book => <li key={book.id}>
        <div><h3>{book.title}</h3><p>{book.available ? 'PDF uploaded' : 'PDF needed'}</p></div>
        <form className="form-stack" onSubmit={async event => {
          event.preventDefault();
          const form = event.currentTarget;
          const file = new FormData(form).get('pdf');
          if (!(file instanceof File) || file.size < 8 || file.size > 4000000) {
            setError('Choose a PDF up to 4 MB.');
            return;
          }
          setError('');
          setMessage('');
          setBusy(true);
          try {
            await storeRequest('/publisher/ebooks/' + encodeURIComponent(book.id), 'PATCH', file.slice(0, file.size, 'application/pdf'));
            setBooks(previous => previous?.map(item => item.id === book.id ? { ...item, available: true } : item) ?? null);
            form.reset();
            setMessage('PDF saved for ' + book.title + '.');
          } catch (error) { setError(errorMessage(error)); }
          finally { setBusy(false); }
        }}>
          <label className="field">PDF for {book.title}<input name="pdf" type="file" accept="application/pdf,.pdf" required disabled={busy} /></label>
          <button className="button primary" type="submit" disabled={busy}>{book.available ? 'Replace PDF' : 'Upload PDF'}</button>
        </form>
      </li>)}</ul>}
  </div>;
}

export function PublisherReviews() {
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [version, refresh] = useState(0);
  useEffect(() => {
    setError('');
    storeRequest<{ reviews: Review[] }>('/publisher/reviews').then(data => setReviews(data.reviews))
      .catch(error => setError(errorMessage(error)));
  }, [version]);

  return <div className="feature-stack">
    <div className="admin-tools"><div><h2>Reader reviews</h2><p>Publish or hide reviews submitted by customers.</p></div>
      <button className="button secondary" type="button" disabled={busy} onClick={() => refresh(value => value + 1)}>Refresh</button></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {!reviews ? !error && <p role="status">Loading reviews…</p> : !reviews.length ? <p>No reviews submitted yet.</p>
      : <ul className="notification-list">{reviews.map(review => <li key={review.id}><div>
        <h3>{review.title}</h3><p>{review.reviewer} · {review.rating}/5 · {review.approved ? 'Published' : 'Hidden'}</p><p>{review.comment}</p>
      </div><button className="button secondary" type="button" disabled={busy} onClick={async () => {
        setBusy(true);
        setError('');
        try {
          await storeRequest('/publisher/reviews/' + review.id, 'PATCH', { approved: !review.approved, rating: review.rating, comment: review.comment });
          refresh(value => value + 1);
        } catch (error) { setError(errorMessage(error)); }
        finally { setBusy(false); }
      }}>{review.approved ? 'Hide review' : 'Publish review'}</button></li>)}</ul>}
  </div>;
}

export function PublisherPayment({ order, update, disabled }: { order: Order; update: (patch: Partial<Order>) => void; disabled: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (order.status !== 'confirmed' || order.paidAt || order.refundedAt) return null;

  async function change(path: string, method: string, body: object) {
    setBusy(true);
    setError('');
    try { update(await storeRequest<Partial<Order>>('/publisher/orders/' + order.id + path, method, body)); }
    catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  }

  return <div className="feature-stack">
    {order.paymentLinkId ? <button className="button secondary" type="button" disabled={disabled || busy}
      onClick={() => { if (window.confirm('Close this unpaid payment link?')) void change('/close-payment-link', 'POST', {}); }}>Close unpaid payment link</button>
      : <form className="form-stack" key={order.finalTotal} onSubmit={event => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void change('/payment', 'PATCH', { total: Number(form.get('total')), received: form.get('received') === 'on' });
      }}>
        <label className="field">Final total (₹, including delivery and tax)
          <input required name="total" type="number" min={0} max={1000000} defaultValue={order.finalTotal ?? order.estimatedSubtotal - order.discount} />
        </label>
        <label className="checkbox-field"><input type="checkbox" name="received" /> Payment already received offline</label>
        <button className="button secondary" type="submit" disabled={disabled || busy}>{busy ? 'Saving…' : 'Save payment details'}</button>
      </form>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
