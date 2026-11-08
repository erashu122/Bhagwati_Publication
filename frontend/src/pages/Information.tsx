import { useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, BookOpen, CheckCircle2, MessageSquare } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { errorMessage, storeRequest, useAccount } from '../account';
import { BrowseLink } from '../components/Storefront';
import { useCatalog } from '../catalog';

export function About() {
  const { content } = useCatalog();
  return <div className="container section page-content">
    <p className="eyebrow"><span className="diamond" /> OUR STORY</p>
    <h1>Bhagwati Publication</h1>
    <p className="about-hindi" lang="hi">भगवती प्रकाशन</p>
    <div className="information-grid">
      <div className="prose">
        <p className="lead">{content.aboutLead}</p>
        {content.aboutBody.split(/\n\s*\n/u).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        <BrowseLink />
      </div>
      <div className="information-art" aria-hidden="true"><BookOpen size={110} strokeWidth={0.75} /><span>BHAGWATI PUBLICATION</span></div>
    </div>
  </div>;
}

export function Contact() {
  const { customer } = useAccount();
  const { content } = useCatalog();
  const [complete, setComplete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setError('');
    try {
      await storeRequest('/enquiries', 'POST', Object.fromEntries(new FormData(form)));
      form.reset();
      setComplete(true);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return <section className="container section page-content">
    <p className="eyebrow"><span className="diamond" /> GET IN TOUCH</p>
    <h1>Contact</h1>
    <p className="page-intro">{content.contactIntro}</p>
    <div className="information-grid contact-grid">
      <form className="form-panel" onSubmit={submit} onInput={() => setComplete(false)}>
        <h2>Send an enquiry</h2>
        <div className="form-grid">
          <label className="field">Name<input required name="fullName" maxLength={100} autoComplete="name" defaultValue={customer?.fullName} /></label>
          <label className="field">Email<input required type="email" name="email" maxLength={254} autoComplete="email" defaultValue={customer?.email} /></label>
          <label className="field field-wide">Message<textarea required name="message" maxLength={2500} rows={6} /></label>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button primary" disabled={busy} type="submit">{busy ? 'Submitting…' : 'Submit enquiry'} <ArrowRight size={17} aria-hidden="true" /></button>
        <div role="status">{complete && <p className="feedback"><CheckCircle2 size={19} aria-hidden="true" />Your enquiry was saved for the publisher to review.</p>}</div>
      </form>
      <aside className="order-summary"><MessageSquare size={26} strokeWidth={1.4} aria-hidden="true" /><h2>What to include</h2><p>For a book or bulk order enquiry, include the title, format and number of copies you need.</p></aside>
    </div>
  </section>;
}

export function Policy() {
  const { id = '' } = useParams();
  const { content } = useCatalog();
  if (id !== 'shipping' && id !== 'returns' && id !== 'privacy') return <NotFound />;
  const title = id[0].toUpperCase() + id.slice(1) + ' policy';

  return <section className="container section page-content">
    <p className="eyebrow"><span className="diamond" /> STORE POLICY</p><h1>{title}</h1>
    <div className="prose policy-copy">{content[id].split(/\n\s*\n/u).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
    <Link className="text-link" to="/books">Browse the collection <ArrowRight size={17} aria-hidden="true" /></Link>
  </section>;
}

export function NotFound() {
  return <section className="container section"><div className="empty-panel">
    <BookOpen size={33} strokeWidth={1.3} aria-hidden="true" /><p className="eyebrow">404 · BHAGWATI PUBLICATION</p>
    <h1>Page not found</h1><p>Return to the homepage to explore the collection.</p>
    <Link className="button primary" to="/">Back to home <ArrowRight size={17} aria-hidden="true" /></Link>
  </div></section>;
}
