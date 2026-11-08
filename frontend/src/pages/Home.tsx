import { ArrowDownRight, ArrowRight, BookOpen, BriefcaseBusiness, Cpu, Feather, Languages, Lightbulb, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BookCover } from '../components/BookCover';
import { BookCard, BrowseLink } from '../components/Storefront';
import { useCatalog } from '../catalog';
import { AuthorPortrait } from '../components/AuthorPortrait';

const categoryIcons = [BriefcaseBusiness, Lightbulb, Cpu, Feather];

function HeroDecoration() {
  return <svg className="hero-engraving" viewBox="0 0 540 430" fill="none" aria-hidden="true">
    <defs>
      <pattern id="engraving-grid" width="24" height="24" patternUnits="userSpaceOnUse">
        <circle cx="1" cy="1" r=".8" fill="currentColor" />
      </pattern>
    </defs>
    <rect x="32" y="24" width="474" height="375" rx="9" fill="url(#engraving-grid)" opacity=".36" />
    <circle cx="275" cy="211" r="187" stroke="currentColor" opacity=".36" />
    <circle cx="275" cy="211" r="170" stroke="currentColor" strokeDasharray="2 7" opacity=".55" />
    <circle cx="275" cy="211" r="143" stroke="currentColor" opacity=".25" />
    <path stroke="currentColor" d="M87 72v21m-10-10h20m350 219v30m-15-15h30M433 58v21m-10-10h20M70 306v13m-6-6h12M480 146v16m-8-8h16M153 361v18m-9-9h18" />
    <path stroke="currentColor" opacity=".48" d="M81 345c39 11 64 4 87-12m-79 15c-6-12-15-17-27-14 6 9 15 14 27 14Zm22 3c-2-14-9-21-20-24 1 13 9 21 20 24Zm20-3c-1-12-5-21-16-25 0 11 5 20 16 25Zm20-6c3-11-1-21-9-27-4 11 0 20 9 27Zm-41 9c-12 1-17 8-20 17 12 0 20-6 20-17Zm20-3c-7 2-12 9-12 18 10-2 14-8 12-18Z" />
  </svg>;
}

export function Home({ add }: { add: (id: string) => void }) {
  const { books, categories, content, authorPhoto } = useCatalog();
  const featured = books.filter(book => book.featured).slice(0, 4);
  const [first, second] = books;
  return <>
    <section className="hero">
      <div className="container hero-grid">
        <div className="hero-copy">
          <p className="eyebrow hero-label"><span /> THE BHAGWATI BOOK COLLECTION</p>
          <h1>{content.heroTitle}{content.heroAccent && <> <em>{content.heroAccent}</em></>}</h1>
          <p className="hero-intro">{content.heroIntro}</p>
          <BrowseLink>Explore the collection</BrowseLink>
        </div>
        <div className="hero-display">
          <HeroDecoration />
          {second && <div className="hero-book hero-book-back"><BookCover book={second} /></div>}
          {first && <div className="hero-book hero-book-front"><BookCover book={first} /></div>}
          {first && <div className="hero-caption"><span /> FROM THE COLLECTION <span /></div>}
        </div>
      </div>
    </section>
    <section className="benefits" aria-label="About the collection">
      <div className="container benefits-grid">
        <div><BookOpen aria-hidden="true" /><span><strong>A books-only collection</strong><small>Browse the catalog</small></span></div>
        <div><Languages aria-hidden="true" /><span><strong>Print and digital</strong><small>Explore books in different formats</small></span></div>
        <div><Sparkles aria-hidden="true" /><span><strong>Browse by interest</strong><small>Find your next read</small></span></div>
      </div>
    </section>
    {featured.length > 0 && <section className="container section featured">
      <div className="section-heading">
        <div><p className="eyebrow"><span className="diamond" /> THE BOOKSHELF</p><h2>Featured collection</h2><p>Start with titles from across our collection.</p></div>
        <Link className="text-link" to="/books">View all books <ArrowRight size={17} aria-hidden="true" /></Link>
      </div>
      <div className="book-grid">{featured.map(book => <BookCard key={book.id} book={book} add={add} />)}</div>
    </section>}
    {categories.length > 0 && <section className="category-section section">
      <div className="container">
        <div className="section-heading"><div><p className="eyebrow"><span className="diamond" /> BY INTEREST</p><h2>Browse by category</h2></div></div>
        <div className="category-grid">{categories.map((category, index) => {
          const Icon = categoryIcons[index % categoryIcons.length];
          return <Link key={category.id} className="category-card" to={'/books?category=' + encodeURIComponent(category.name)}>
            <Icon size={25} strokeWidth={1.4} aria-hidden="true" /><ArrowDownRight className="category-arrow" size={17} aria-hidden="true" />
            <h3>{category.name}</h3>{category.description && <p>{category.description}</p>}
          </Link>;
        })}</div>
      </div>
    </section>}
    <section className="container section">
      <div className="author-panel">
        <div className="author-art"><AuthorPortrait name={content.authorName} photo={authorPhoto} /></div>
        <div className="author-copy"><p className="eyebrow"><span className="diamond" /> THE AUTHOR</p><h2>{content.authorName}</h2>
          <p className="author-bio">{content.authorBio}</p>
          <Link to="/author" className="text-link">Meet the author <ArrowRight size={17} aria-hidden="true" /></Link>
        </div>
      </div>
    </section>
    <section className="closing"><div className="container closing-inner">
      <div><p className="eyebrow">FIND YOUR NEXT READ</p><h2>Which book will you open next?</h2></div>
      <BrowseLink>Browse all books</BrowseLink>
    </div></section>
  </>;
}
