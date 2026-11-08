import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import type { Book, Category } from '../../shared/books';
import { defaultContent } from '../../shared/content';
import type { ContentRecord } from '../../shared/content';
import { errorMessage, storeRequest } from './account';

export type CatalogData = ContentRecord & { books: Book[]; categories: Category[] };
type CatalogState = CatalogData & {
  booksById: Map<string, Book>;
  ready: boolean;
  error: string;
  refresh: () => Promise<void>;
};

const CatalogContext = createContext<CatalogState | null>(null);
const initialCatalog: CatalogData = { books: [], categories: [], content: defaultContent, revision: 1, authorPhoto: null };

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState(initialCatalog);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const currentRequest = useRef(0);
  const { pathname } = useLocation();

  const refresh = useCallback(async () => {
    const request = ++currentRequest.current;
    setError('');
    try {
      const catalog = await storeRequest<CatalogData>('/catalog');
      if (request === currentRequest.current) {
        setData(catalog);
        setReady(true);
      }
    } catch (error) {
      if (request === currentRequest.current) setError(errorMessage(error));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [pathname, refresh]);

  useEffect(() => {
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  const booksById = useMemo(() => new Map(data.books.map(book => [book.id, book])), [data.books]);
  return <CatalogContext.Provider value={{ ...data, booksById, ready, error, refresh }}>{children}</CatalogContext.Provider>;
}

export function useCatalog() {
  const catalog = useContext(CatalogContext);
  if (!catalog) throw new Error('CatalogProvider is required.');
  return catalog;
}

export function CatalogReady({ children }: { children: ReactNode }) {
  const { ready, error, refresh } = useCatalog();
  if (ready) return children;
  return <div className="container section"><div className="empty-panel">
    {error ? <><h1>Can’t load the catalog</h1><p role="alert">{error}</p><button className="button primary" type="button" onClick={() => void refresh()}>Try again</button></> : <p role="status">Loading the collection…</p>}
  </div></div>;
}
