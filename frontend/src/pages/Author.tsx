import { BookOpen } from 'lucide-react';
import { matchesAuthor } from '../../../shared/content';
import { useCatalog } from '../catalog';
import { AuthorPortrait } from '../components/AuthorPortrait';
import { BookCard, BrowseLink } from '../components/Storefront';

export function Author({ add }: { add: (id: string) => void }) {
  const { content, authorPhoto, books } = useCatalog();
  const titles = books.filter(book => matchesAuthor(book.author, content.authorName));

  return <>
    <section className="author-page-banner">
      <div className="container author-page-intro">
        <div className="author-art"><AuthorPortrait name={content.authorName} photo={authorPhoto} /></div>
        <div className="author-page-copy">
          <p className="eyebrow"><span className="diamond" /> MEET THE AUTHOR</p>
          <h1>{content.authorName}</h1>
          <p className="author-bio">{content.authorBio}</p>
          <span className="author-title-count"><BookOpen size={17} aria-hidden="true" /> {titles.length} {titles.length === 1 ? 'book' : 'books'} in the catalog</span>
        </div>
      </div>
    </section>
    <section className="container section" aria-label="Books by the author">
      <div className="section-heading"><div><p className="eyebrow"><span className="diamond" /> FROM THE COLLECTION</p><h2>Books by {content.authorName}</h2></div></div>
      {titles.length > 0
        ? <div className="book-grid">{titles.map(book => <BookCard key={book.id} book={book} add={add} />)}</div>
        : <div className="empty-panel"><h2>No titles in this collection yet</h2><BrowseLink>Browse all books</BrowseLink></div>}
    </section>
  </>;
}
