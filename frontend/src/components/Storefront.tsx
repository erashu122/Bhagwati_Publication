import { ArrowRight, BookOpen, Plus, ShoppingBag } from 'lucide-react';
import { Link } from 'react-router-dom';
import { canOrder, formatPrice } from '../data/books';
import type { Book } from '../data/books';
import { BookCover } from './BookCover';
import { WishlistButton } from '../customer-extras';

export function Brand() {
  return <Link className="brand" to="/" aria-label="Bhagwati Publications home">
    <img className="brand-logo" src="/bhagwati-publications-logo.jpg" width="1600" height="533" alt="" />
  </Link>;
}

export function BrowseLink({ children = 'Browse the collection' }: { children?: string }) {
  return <Link className="button primary" to="/books">{children}<ArrowRight size={17} aria-hidden="true" /></Link>;
}

export function BookCard({ book, add }: { book: Book; add: (id: string) => void }) {
  const path = '/books/' + book.id;
  return <article className="book-card">
    <Link to={path} className={'card-cover stage-' + book.palette} aria-label={'View ' + book.title}>
      <BookCover book={book} />
    </Link>
    <div className="book-info">
      <p className="eyebrow">{book.category}</p>
      <h3><Link to={path} lang={book.language === 'Hindi' ? 'hi' : 'en'}>{book.title}</Link></h3>
      <p className="card-author">{book.author} <span aria-hidden="true">·</span> {book.format}</p>
      {book.readingPreview && <Link className="card-preview-link" to={path + '?preview=1'} aria-label={'Read a preview of ' + book.title}><BookOpen size={14} aria-hidden="true" /> Read preview</Link>}
      <div className="card-bottom">
        {!canOrder(book) ? <span className="muted">{book.stock === 0 ? 'Out of stock' : 'Currently unavailable'}</span> : <>
          <strong>{formatPrice(book.price)}</strong>
        </>}
        <div className="book-card-actions">
          <WishlistButton id={book.id} title={book.title} compact />
          {canOrder(book) && <button type="button" className="icon-button card-add" aria-label={'Add ' + book.title + ' to bag'} onClick={() => add(book.id)}><Plus size={18} aria-hidden="true" /></button>}
        </div>
      </div>
    </div>
  </article>;
}

export function EmptyBag() {
  return <div className="empty-panel">
    <ShoppingBag size={32} strokeWidth={1.3} aria-hidden="true" />
    <h2>Your book bag is empty.</h2>
    <p>Explore the catalog to find your next read.</p>
    <BrowseLink>Browse books</BrowseLink>
  </div>;
}
