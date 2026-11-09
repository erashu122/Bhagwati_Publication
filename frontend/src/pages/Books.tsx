import { useEffect, useRef } from 'react';
import { ArrowRight, BookOpen, ChevronRight, Search, ShoppingBag } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { BookCover } from '../components/BookCover';
import { BookCard, BrowseLink } from '../components/Storefront';
import { canOrder, formatPrice, readingPreviewKinds } from '../data/books';
import { useCatalog } from '../catalog';
import { WishlistButton } from '../customer-extras';
import { matchesAuthor } from '../../../shared/content';
import { AuthorPortrait } from '../components/AuthorPortrait';

type AddBook = { add: (id: string) => void };

export function Catalog({ add }: AddBook) {
  const [params, setParams] = useSearchParams();
  const { books, categories } = useCatalog();
  const categoryNames = categories.map(category => category.name);
  const query = params.get('q') ?? '';
  const selected = categoryNames.find(category => category === params.get('category')) ?? '';
  const sort = params.get('sort') ?? 'featured';
  const keywords = query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
  const results = books.filter(book => {
    const text = [book.title, book.author, book.language, book.category, book.format].join(' ').toLocaleLowerCase();
    return (!selected || book.category === selected) && keywords.every(keyword => text.includes(keyword));
  });

  if (sort === 'price-asc' || sort === 'price-desc') {
    results.sort((a, b) => {
      if (a.price === null) return b.price === null ? 0 : 1;
      if (b.price === null) return -1;
      return sort === 'price-asc' ? a.price - b.price : b.price - a.price;
    });
  }

  function updateFilter(name: string, value: string, replace = false) {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    setParams(next, { replace });
  }

  return <>
    <section className="page-banner"><div className="container">
      <p className="eyebrow"><span className="diamond" /> THE BOOKSHELF</p>
      <h1>All books</h1><p>Explore the Bhagwati Publication catalog.</p>
    </div></section>
    <section className="container section catalog" aria-label="Book catalog">
      <div className="catalog-controls">
        <div className="field">
          <label htmlFor="book-search">Search the collection</label>
          <div className="search-field"><Search size={18} aria-hidden="true" /><input id="book-search" type="search" value={query} maxLength={160} placeholder="Title, author or category" onChange={event => updateFilter('q', event.target.value, true)} /></div>
        </div>
        <div className="field sort-field">
          <label htmlFor="book-sort">Sort by</label>
          <select id="book-sort" value={sort === 'price-asc' || sort === 'price-desc' ? sort : 'featured'} onChange={event => updateFilter('sort', event.target.value === 'featured' ? '' : event.target.value)}>
            <option value="featured">Featured</option><option value="price-asc">Price low to high</option><option value="price-desc">Price high to low</option>
          </select>
        </div>
      </div>
      <div className="catalog-toolbar">
        <div className="filter-list" role="group" aria-label="Filter by category">
          {['', ...categoryNames].map(category => <button type="button" className="filter" key={category} aria-pressed={category === selected} onClick={() => updateFilter('category', category)}>{category || 'All categories'}</button>)}
        </div>
        <p className="muted" role="status">{results.length} {results.length === 1 ? 'book' : 'books'}</p>
      </div>
      {results.length ? <div className="book-grid">{results.map(book => <BookCard key={book.id} book={book} add={add} />)}</div> : <div className="empty-panel">
        <Search size={32} strokeWidth={1.3} aria-hidden="true" /><h2>No books match your search.</h2>
        <p>Try a different title, language or category.</p><button type="button" className="button primary" onClick={() => setParams({})}>Reset filters</button>
      </div>}
    </section>
  </>;
}

export function BookDetails({ add }: AddBook) {
  const { id = '' } = useParams();
  const { books, booksById, content, authorPhoto } = useCatalog();
  const previewSection = useRef<HTMLElement>(null);
  const [params] = useSearchParams();
  const book = booksById.get(id);
  const preview = book?.readingPreview?.trim();

  function openPreview() {
    previewSection.current?.focus({ preventScroll: true });
    previewSection.current?.scrollIntoView({ block: 'start' });
  }

  const directPreview = params.get('preview') === '1';
  useEffect(() => {
    if (!directPreview || !preview) return;
    const frame = requestAnimationFrame(openPreview);
    return () => cancelAnimationFrame(frame);
  }, [id, directPreview, preview]);

  if (!book) return <section className="container section">
    <div className="empty-panel"><h1>Book not found</h1><p>Find an available title in the collection.</p><BrowseLink>Back to all books</BrowseLink></div>
  </section>;

  const related = books.filter(candidate => candidate.category === book.category && candidate.id !== id);
  for (const candidate of books) {
    if (related.length >= 3) break;
    if (candidate.id !== id && !related.includes(candidate)) related.push(candidate);
  }
  const previewKind = book.readingPreviewKind ?? 'overview';

  return <div className="container section detail">
    <nav aria-label="Breadcrumb" className="breadcrumbs">
      <Link to="/">Home</Link><ChevronRight size={14} aria-hidden="true" /><Link to="/books">All books</Link>
      <ChevronRight size={14} aria-hidden="true" /><span aria-current="page" lang={book.language === 'Hindi' ? 'hi' : 'en'}>{book.title}</span>
    </nav>
    <section className="detail-grid">
      <div className={'detail-cover stage-' + book.palette}><BookCover book={book} />{!book.coverImage && <p>Illustrative cover</p>}</div>
      <div className="detail-copy">
        <p className="eyebrow"><span className="diamond" /> {book.category}</p>
        <h1 lang={book.language === 'Hindi' ? 'hi' : 'en'}>{book.title}</h1>
        {matchesAuthor(book.author, content.authorName) ? <Link to="/author" className="detail-author detail-author-profile">
          <AuthorPortrait name={content.authorName} photo={authorPhoto} decorative /><span>By {book.author}</span>
        </Link> : <p className="detail-author">By {book.author}</p>}
        <p lang={book.language === 'Hindi' ? 'hi' : 'en'}>{book.description}</p>
        {preview && <button className="button secondary preview-jump" type="button" onClick={openPreview}><BookOpen size={17} aria-hidden="true" /> Read a preview</button>}
        <dl className="book-facts"><div><dt>Format</dt><dd>{book.format}</dd></div><div><dt>Language</dt><dd>{book.language}</dd></div></dl>
        {!canOrder(book) ? <p className="availability">{book.stock === 0 ? 'Out of stock' : 'Currently unavailable'}</p> : <div className="purchase">
          <div><strong>{formatPrice(book.price)}</strong><small>Listed price</small></div>
          <button type="button" className="button primary" onClick={() => add(book.id)}><ShoppingBag size={18} aria-hidden="true" /> Add to bag</button>
        </div>}
        <WishlistButton id={book.id} title={book.title} />
        <p className="small-note">Final editions, pricing and availability are pending publisher confirmation.</p>
      </div>
    </section>
    {preview && <section className="reading-preview" ref={previewSection} tabIndex={-1} aria-labelledby="preview-title">
      <div className="reading-preview-header">
        <span className="dashboard-icon"><BookOpen size={20} aria-hidden="true" /></span>
        <div><p className="eyebrow">{readingPreviewKinds[previewKind]}</p><h2 id="preview-title">Inside the book</h2></div>
      </div>
      <div className="reading-preview-prose" lang={book.language === 'Hindi' ? 'hi' : 'en'}>
        {preview.split(/\n\s*\n/u).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
      </div>
      <div className="reading-preview-footer">
        <p className="small-note">{previewKind === 'excerpt' ? 'A sample selected by the publisher.'
          : previewKind === 'story' ? 'An original teaser written for the store.' : 'An overview written for the store.'}</p>
        {canOrder(book) && <button type="button" className="button primary" onClick={() => add(book.id)}><ShoppingBag size={17} aria-hidden="true" /> Add to bag · {formatPrice(book.price)}</button>}
      </div>
    </section>}
    <section className="related">
      <div className="section-heading"><div><p className="eyebrow"><span className="diamond" /> KEEP EXPLORING</p><h2>Related books</h2></div><Link className="text-link" to="/books">View all books <ArrowRight size={17} aria-hidden="true" /></Link></div>
      <div className="book-grid">{related.slice(0, 3).map(candidate => <BookCard key={candidate.id} book={candidate} add={add} />)}</div>
    </section>
  </div>;
}
