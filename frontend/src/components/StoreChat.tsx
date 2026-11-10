import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, X } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import type { Book } from '../../../shared/books';
import { useCatalog } from '../catalog';
import { formatPrice } from '../data/books';

type ChatLink = { label: string; to: string };
type Answer = { text: string; links?: ChatLink[]; books?: Book[] };
const prompts = ['Find Hindi books', 'Track my order', 'Coupons', 'Payment & UPI'];
const commonWords = new Set('a an and about all book books can cost details do find how i in is it me much my of on please preview price read recommend show summary tell the this to want what with ki ke ka batao kitab kitaab bare में के की का है बताओ किताब किताबें दिखाओ बारे'.split(' '));

function words(query: string) {
  return query.toLocaleLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
}

function answerQuestion(query: string, books: Book[], currentBook?: Book): Answer {
  const hindi = /\p{Script=Devanagari}/u.test(query);
  const reply = (en: string, hi: string, label: string, to: string): Answer => ({
    text: hindi ? hi : en, links: [{ label, to }]
  });
  const text = query.toLocaleLowerCase();
  const keywords = words(text).filter(word => !commonWords.has(word));
  const matches = keywords.length ? books.filter(book => {
    const metadata = words([book.title, book.author, book.category, book.language, book.format].join(' '));
    return keywords.every(word => metadata.some(term => term === word || (word.length >= 3 && term.startsWith(word))));
  }) : [];
  if (/हिंदी|हिन्दी/u.test(text)) matches.push(...books.filter(book => book.language === 'Hindi' && !matches.includes(book)));
  if (currentBook && /\bthis book\b|इस किताब|इस पुस्तक/u.test(text)) matches.unshift(currentBook);
  if (matches.length) return {
    text: hindi ? 'कैटलॉग में ये किताबें मिलीं।' : 'Here’s what I found in the catalog.',
    books: [...new Set(matches)].slice(0, 3)
  };
  if (/\b(track|order|orders|status)\b|ऑर्डर/u.test(text)) return reply(
    'Open My orders after signing in to track your order and find its payment receipt.',
    'साइन इन करके My orders में अपने ऑर्डर की स्थिति देखें।', 'My orders', '/account?tab=orders'
  );
  if (/coupon|discount|offer|कूपन|छूट/u.test(text)) return reply(
    'Check your account for active coupons. Select one at checkout to see the discount on books.',
    'अपने अकाउंट में सक्रिय कूपन देखें। किताबों पर छूट के लिए checkout में एक कूपन चुनें।', 'My coupons', '/account?tab=coupons'
  );
  if (/upi|payment|pay\b|भुगतान|पेमेंट/u.test(text)) return reply(
    'See available payment methods at checkout. Cash on Delivery is for printed books only. Your receipt is in My orders after payment is confirmed.',
    'Checkout पर उपलब्ध भुगतान विकल्प देखें। COD केवल प्रिंट किताबों के लिए है। भुगतान की पुष्टि के बाद रसीद My orders में मिलेगी।', 'My orders', '/account?tab=orders'
  );
  if (/shipping|delivery|ship\b|डिलीवरी/u.test(text)) return reply(
    'Print book shipping is shown at checkout. eBooks do not need a delivery address.',
    'प्रिंट किताबों की शिपिंग checkout पर दिखती है। ईबुक के लिए डिलीवरी पता ज़रूरी नहीं है।', 'Shipping policy', '/policies/shipping'
  );
  if (/returns?|refund|वापसी/u.test(text)) return reply(
    'Check the returns policy, or contact the publisher about an existing request.',
    'वापसी नीति देखें या अपने ऑर्डर के लिए प्रकाशक से संपर्क करें।', 'Returns policy', '/policies/returns'
  );
  if (/wish ?list|save books|पसंदीदा/u.test(text)) return reply(
    'Sign in and use the heart beside a book to save it to your wishlist.',
    'साइन इन करें और किसी किताब के पास दिल वाले बटन से उसे सेव करें।', 'My wishlist', '/account?tab=wishlist'
  );
  if (/contact|support|help|संपर्क|मदद/u.test(text)) return reply(
    'Tell me a book title or ask about orders, coupons, shipping or UPI. You can also contact the publisher.',
    'किताब का नाम लिखें या ऑर्डर, कूपन, डिलीवरी या UPI के बारे में पूछें। प्रकाशक से भी संपर्क कर सकते हैं।', 'Contact the publisher', '/contact'
  );
  return {
    text: hindi ? 'इस सवाल का जवाब नहीं मिला। किताब के शीर्षक या श्रेणी का नाम लिखें।'
      : 'I couldn’t match that question. Try a book title, author or category, or use one of the help topics.',
    links: [{ label: 'Browse books', to: '/books' }, { label: 'Contact the publisher', to: '/contact' }]
  };
}

export function StoreChat() {
  const { books, booksById } = useCatalog();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState<{ query: string; answer: Answer }[]>([]);
  const launcher = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const currentBook = pathname.startsWith('/books/') ? booksById.get(pathname.slice('/books/'.length)) : undefined;

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [history]);

  function close() {
    setOpen(false);
    launcher.current?.focus();
  }

  function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed) return;
    setHistory(previous => [...previous.slice(-19), { query: trimmed, answer: answerQuestion(trimmed, books, currentBook) }]);
    setQuery('');
  }

  return <aside className="store-chat" aria-label="Store help" onKeyDown={event => { if (open && event.key === 'Escape') close(); }}>
    {open && <section id="store-chat-panel" className="chat-panel" aria-labelledby="store-chat-title">
      <div className="chat-heading">
        <div><p className="eyebrow">BHAGWATI PUBLICATION</p><h2 id="store-chat-title">Bookshop assistant</h2></div>
        <button className="icon-button" type="button" onClick={close} aria-label="Close chat"><X size={19} aria-hidden="true" /></button>
      </div>
      <div className="chat-log" ref={log} role="log" aria-label="Conversation">
        <p className="chat-answer">Namaste! Ask me about a book, your order, or how the store works.</p>
        {history.map(({ query, answer }, index) => <div className="chat-exchange" key={index}>
          <p className="chat-question">{query}</p>
          <div className="chat-answer">
            <p>{answer.text}</p>
            {answer.books?.map(book => <article className="chat-book" key={book.id}>
              <Link className="text-link" to={'/books/' + book.id} onClick={close}>{book.title}</Link>
              <small>{book.format} · {book.price === null ? 'Price on request' : formatPrice(book.price)}</small>
              {book.description && <p>{book.description.length > 240 ? book.description.slice(0, 239) + '…' : book.description}</p>}
              {book.readingPreview && <Link className="text-link" to={'/books/' + book.id + '?preview=1'} onClick={close}>Read preview</Link>}
            </article>)}
            {answer.links?.map(link => <Link key={link.to} className="text-link" to={link.to} onClick={close}>{link.label}</Link>)}
          </div>
        </div>)}
      </div>
      <div className="chat-prompts">{prompts.map(prompt => <button className="filter" key={prompt} type="button" onClick={() => ask(prompt)}>{prompt}</button>)}</div>
      <form className="chat-form" onSubmit={event => { event.preventDefault(); ask(query); }}>
        <input ref={input} aria-label="Ask the bookshop assistant" placeholder="Ask about books or orders…" value={query} maxLength={240} onChange={event => setQuery(event.target.value)} />
        <button className="button primary" type="submit" disabled={!query.trim()} aria-label="Send message"><Send size={17} aria-hidden="true" /></button>
      </form>
    </section>}
    <button ref={launcher} className="button primary chat-launcher" type="button" aria-expanded={open} aria-controls={open ? 'store-chat-panel' : undefined} onClick={() => setOpen(value => !value)}>
      <MessageCircle size={20} aria-hidden="true" /> Book help
    </button>
  </aside>;
}
