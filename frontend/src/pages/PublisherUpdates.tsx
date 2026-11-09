import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Coupon } from '../../../shared/store';
import { errorMessage, storeRequest } from '../account';

export function PublisherCoupons() {
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [selected, setSelected] = useState<Coupon | null>(null);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    let current = true;
    setError('');
    storeRequest<{ coupons: Coupon[] }>('/publisher/coupons').then(result => { if (current) setCoupons(result.coupons); })
      .catch(error => { if (current) setError(errorMessage(error)); });
    return () => { current = false; };
  }, [reload]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { coupon } = await storeRequest<{ coupon: Coupon }>('/publisher/coupons', 'POST', {
        code: selected?.code ?? form.get('code'), percent: Number(form.get('percent')), active: form.has('active')
      });
      setCoupons(previous => [...(previous ?? []).filter(item => item.code !== coupon.code), coupon].sort((a, b) => a.code.localeCompare(b.code)));
      setSelected(coupon);
      setMessage('Coupon ' + coupon.code + ' saved.');
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return <div className="feature-stack">
    <div className="admin-tools"><div><h2>Coupons</h2><p>Active codes are available to all signed-in customers at checkout.</p></div>
      <button className="button secondary" type="button" disabled={busy} onClick={() => { setSelected(null); setMessage(''); }}>New coupon</button>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {message && <p className="feedback" role="status">{message}</p>}
    {!coupons ? (error ? <button className="button secondary" type="button" onClick={() => setReload(value => value + 1)}>Try again</button> : <p role="status">Loading coupons…</p>) : <>
      <form key={selected ? JSON.stringify(selected) : 'new'} className="form-panel form-stack" onSubmit={save}>
        <h3>{selected ? 'Edit ' + selected.code : 'Create a coupon'}</h3>
        <div className="form-grid">
          <label className="field">Code<input name="code" required minLength={3} maxLength={24} readOnly={Boolean(selected)}
            defaultValue={selected?.code ?? ''} placeholder="READ10" autoCapitalize="characters" /></label>
          <label className="field">Discount (%)<input name="percent" type="number" min={1} max={100} required defaultValue={selected?.percent} /></label>
        </div>
        <label className="checkbox-field"><input name="active" type="checkbox" defaultChecked={selected?.active ?? true} /> Available at checkout</label>
        <button className="button primary" type="submit" disabled={busy}>Save coupon</button>
      </form>
      <ul className="notification-list">{coupons.map(coupon => <li key={coupon.code}><div>
        <h3>{coupon.code}</h3><p>{coupon.percent}% off books · {coupon.active ? 'Active' : 'Inactive'}</p>
      </div><button className="button secondary" type="button" disabled={busy} onClick={() => { setSelected(coupon); setMessage(''); }}>Edit {coupon.code}</button></li>)}</ul>
    </>}
  </div>;
}

export function PublisherAnnouncements() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const attempt = useRef<{ id: string; content: string } | null>(null);

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    const payload = { title: String(form.get('title')).trim(), message: String(form.get('message')).trim() };
    const content = JSON.stringify(payload);
    if (attempt.current?.content !== content) attempt.current = { content, id: 'announcement:' + crypto.randomUUID() };
    setError('');
    setMessage('');
    setBusy(true);
    try {
      await storeRequest('/publisher/notifications', 'POST', { ...payload, id: attempt.current.id });
      attempt.current = null;
      element.reset();
      setMessage('Announcement published to the store’s notifications.');
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return <div className="feature-stack">
    <div className="admin-tools"><div><h2>Announcements</h2><p>Share public store news through the notification bell.</p></div></div>
    <form className="form-panel form-stack" onSubmit={publish}>
      <label className="field">Title<input name="title" required maxLength={120} disabled={busy} /></label>
      <label className="field">Message<textarea name="message" required maxLength={600} rows={4} disabled={busy} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="feedback" role="status">{message}</p>}
      <button className="button primary" type="submit" disabled={busy}>{busy ? 'Publishing…' : 'Publish announcement'}</button>
    </form>
  </div>;
}
