import { Boxes, Building2, Gavel, Landmark, Scale } from 'lucide-react';
import type { Book } from '../data/books';

function CoverArt({ artwork }: { artwork: Book['artwork'] }) {
  if (artwork === 'orbit') {
    return <svg viewBox="0 0 120 100" fill="none" stroke="currentColor" strokeWidth=".7">
      {[0, 30, 60, 90, 120, 150].map(angle => <ellipse key={angle} cx="60" cy="50" rx="44" ry="18" transform={`rotate(${angle} 60 50)`} />)}
      <circle cx="60" cy="50" r="8" /><circle cx="60" cy="50" r="3" fill="currentColor" />
      <path d="M60 1v8m-4-4h8m40 64v8m-4-4h8M14 28v8m-4-4h8" />
    </svg>;
  }
  if (artwork === 'sun') {
    return <svg viewBox="0 0 120 100" fill="none" stroke="currentColor" strokeWidth=".8">
      {Array.from({ length: 24 }, (_, index) => <path key={index} d="M60 5v9" transform={`rotate(${index * 15} 60 49)`} />)}
      <circle cx="60" cy="49" r="31" /><circle cx="60" cy="49" r="27" />
      <path d="M37 63h46M43 59h34M47 55h26v-8l-13-9-13 9zm8 0V45m10 10V45M60 38V28m-3 5h6M33 69h54" />
    </svg>;
  }
  if (artwork === 'sprig') {
    return <svg viewBox="0 0 120 100" fill="none" stroke="currentColor" strokeWidth="1">
      <path d="M45 93C51 71 67 55 69 21M55 72C31 72 26 60 23 53c18 0 29 9 32 19Zm8-15c-17-2-25-14-24-25 16 6 22 14 24 25Zm5-19c-9-6-9-22-2-30 7 9 8 19 2 30Zm-8 26c21-2 33-12 33-26-18 5-29 14-33 26ZM51 82c20 4 34-1 39-12-16-1-29 4-39 12Z" />
      <circle cx="30" cy="28" r="1.8" /><circle cx="85" cy="21" r="1.8" /><circle cx="98" cy="62" r="1.8" />
    </svg>;
  }
  const Icon = { scale: Scale, tower: Building2, boxes: Boxes, gavel: Gavel, arch: Landmark }[artwork];
  return <span className="cover-icon"><Icon strokeWidth={0.8} /></span>;
}

export function BookCover({ book }: { book: Book }) {
  if (book.coverImage) {
    return <img className="book-cover cover-photo" src={book.coverImage} alt={`${book.title} book cover`} />;
  }

  return (
    <div className={`book-cover cover-${book.palette}`} role="img" aria-label={`Illustrative cover for ${book.title}`}>
      <div className="cover-rule" aria-hidden="true">
        <span className="cover-imprint">BHAGWATI PUBLICATION</span>
        <span className="cover-title" lang={book.language === 'Hindi' ? 'hi' : 'en'}>{book.coverTitle}</span>
        {book.coverSubtitle && <span className="cover-subtitle">{book.coverSubtitle}</span>}
        <span className="cover-art"><CoverArt artwork={book.artwork} /></span>
        <span className="cover-author">{book.author}</span>
      </div>
    </div>
  );
}
