import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Archive, BookOpen, CirclePlus, FileImage, Pencil, RotateCcw, Search, Tags, Trash2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { bookArtworks, bookFormats, bookPalettes, formatPrice, readingPreviewKinds, readingPreviewMaxLength } from '../../../shared/books';
import type { Book, Category } from '../../../shared/books';
import { contentFields, matchesAuthor } from '../../../shared/content';
import { errorMessage, storeRequest } from '../account';
import { useCatalog } from '../catalog';
import type { CatalogData } from '../catalog';
import { BookCover } from '../components/BookCover';
import { AuthorPortrait } from '../components/AuthorPortrait';

export type CatalogSection = 'books' | 'bundles' | 'categories' | 'content' | 'author';
const root = '/publisher/catalog';
type Save = (path: string, method: string, body: unknown, message: string) => Promise<boolean>;

function readImage(file: File) {
  if (file.size > 1048576 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Choose a JPG, PNG or WebP image up to 1 MB.');
  }
  return new Promise<{ type: string; data: string }>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ type: file.type, data: String(reader.result).split(',')[1] });
    reader.onerror = () => reject(new Error('Could not read the image. Try selecting it again.'));
    reader.readAsDataURL(file);
  });
}

function BookForm({ book, categories, authorName, close, save, busy }: {
  book: Book | null; categories: Category[]; authorName: string; close: () => void; save: Save; busy: boolean;
}) {
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reading || busy) return;
    const form = new FormData(event.currentTarget);
    const fields = Object.fromEntries(form);
    setError('');
    setReading(true);
    try {
      const upload = form.get('cover');
      const cover = upload instanceof File && upload.size ? await readImage(upload) : form.has('clearCover') ? null : undefined;
      const saved = await save(root + '/books' + (book ? '/' + book.id : ''), book ? 'PATCH' : 'POST', {
        ...fields,
        categoryId: Number(fields.categoryId),
        price: fields.price === '' ? null : Number(fields.price),
        stock: fields.stock === '' ? null : Number(fields.stock),
        published: form.has('published'),
        featured: form.has('featured'),
        revision: book?.revision,
        cover
      }, book ? 'Book details saved.' : 'New book added.');
      if (saved) close();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not read the cover file.');
    } finally {
      setReading(false);
    }
  }

  return <form className="form-panel admin-editor" onSubmit={event => void submit(event)}>
    <div className="admin-editor-head"><div><p className="eyebrow">CATALOG EDITOR</p><h2>{book ? 'Edit book' : 'Add a book'}</h2></div>
      <button className="icon-button" type="button" disabled={busy || reading} onClick={close} aria-label="Close book editor"><X size={20} /></button>
    </div>
    <div className="form-grid">
      <label className="field field-wide">Book title<input name="title" maxLength={180} required defaultValue={book?.title} /></label>
      <label className="field">Author<input name="author" maxLength={100} required defaultValue={book?.author ?? authorName} /></label>
      <label className="field">Category<select required name="categoryId" defaultValue={book?.categoryId ?? ''}>
        <option value="" disabled>Choose a category</option>
        {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
      </select></label>
      <label className="field">Format<select name="format" defaultValue={book?.format ?? 'Paperback'}>{bookFormats.map(format => <option key={format}>{format}</option>)}</select></label>
      <label className="field">Language<input name="language" maxLength={60} required defaultValue={book?.language ?? 'English'} /></label>
      <label className="field">Price in rupees<input name="price" type="number" min={0} max={1000000} step={1} defaultValue={book?.price ?? ''} /><small>Leave blank to show the book as unavailable.</small></label>
      <label className="field">Stock quantity<input name="stock" type="number" min={0} max={1000000000} step={1} defaultValue={book?.stock ?? ''} /><small>Leave blank to skip stock tracking. Zero means sold out.</small></label>
      <label className="field field-wide">Description<textarea name="description" maxLength={3000} rows={4} defaultValue={book?.description} /></label>
    </div>
    <fieldset className="admin-content-group">
      <legend>Reading preview</legend>
      <div className="form-grid">
        <label className="field">Preview type<select name="readingPreviewKind" defaultValue={book?.readingPreviewKind ?? 'overview'}>
          {Object.entries(readingPreviewKinds).map(([kind, label]) => <option value={kind} key={kind}>{label}</option>)}
        </select></label>
        <label className="field field-wide">Preview text<textarea name="readingPreview" maxLength={readingPreviewMaxLength} rows={6}
          defaultValue={book?.readingPreview} aria-describedby="reading-preview-help" /></label>
        <p className="small-note field-wide" id="reading-preview-help">Write an overview or teaser, or choose Publisher sample for text you have permission to publish. Leave the text blank to hide the preview.</p>
      </div>
    </fieldset>
    <details className="admin-cover-options">
      <summary><FileImage size={17} aria-hidden="true" /> Cover image and design</summary>
      <div className="form-grid">
        <label className="field field-wide">Upload cover<input type="file" name="cover" accept="image/jpeg,image/png,image/webp" /><small>JPG, PNG or WebP, up to 1 MB. Uploading a new image replaces the current one.</small></label>
        {book?.coverImage && <label className="checkbox-field field-wide"><input type="checkbox" name="clearCover" /> Remove the uploaded image and use an illustrated cover</label>}
        <label className="field">Cover title<input name="coverTitle" maxLength={180} defaultValue={book?.coverTitle} /></label>
        <label className="field">Cover subtitle<input name="coverSubtitle" maxLength={180} defaultValue={book?.coverSubtitle ?? ''} /></label>
        <label className="field">Cover color<select name="palette" defaultValue={book?.palette ?? 'green'}>{bookPalettes.map(palette => <option key={palette}>{palette}</option>)}</select></label>
        <label className="field">Cover motif<select name="artwork" defaultValue={book?.artwork ?? 'orbit'}>{bookArtworks.map(artwork => <option key={artwork}>{artwork}</option>)}</select></label>
      </div>
    </details>
    <div className="admin-visibility">
      <label className="checkbox-field"><input type="checkbox" name="published" defaultChecked={book?.published ?? false} /> Show in the store</label>
      <label className="checkbox-field"><input type="checkbox" name="featured" defaultChecked={book?.featured ?? false} /> Feature on the homepage</label>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="inline-actions">
      <button className="button primary" type="submit" disabled={busy || reading}>{busy || reading ? 'Saving…' : 'Save book'}</button>
      <button className="button secondary" type="button" disabled={busy || reading} onClick={close}>Cancel</button>
    </div>
  </form>;
}

function BooksPanel({ data, save, busy, startAdding, lowStock }: { data: CatalogData; save: Save; busy: boolean; startAdding: boolean; lowStock: boolean }) {
  const [editor, setEditor] = useState<Book | null | undefined>(startAdding && data.categories.length ? null : undefined);
  const [filter, setFilter] = useState('all');
  const [stockOnly, setStockOnly] = useState(lowStock);
  const [query, setQuery] = useState('');
  const search = query.trim().toLocaleLowerCase();
  const books = data.books.filter(book => book.format !== 'Bundle');
  const results = books.filter(book =>
    (filter === 'all' || book.published === (filter === 'published')) &&
    (!stockOnly || (book.published && book.stock !== null && book.stock <= 5)) &&
    [book.title, book.author, book.category].some(text => text.toLocaleLowerCase().includes(search))
  );
  return <>
    <div className="admin-metrics">
      <div><strong>{books.length}</strong><span>Total titles</span></div>
      <div><strong>{books.filter(book => book.published).length}</strong><span>Visible in store</span></div>
      <div><strong>{books.filter(book => book.stock === 0).length}</strong><span>Out of stock</span></div>
    </div>
    <div className="admin-tools">
      <div><h2>Books</h2><p>Manage your catalog, prices, stock and covers.</p></div>
      <button type="button" className="button primary" disabled={busy || !data.categories.length} onClick={() => setEditor(null)}><CirclePlus size={17} aria-hidden="true" /> Add book</button>
    </div>
    {!data.categories.length && <p className="small-note">Create a category before adding books.</p>}
    {editor !== undefined && <BookForm key={editor?.id ?? 'new'} book={editor} categories={data.categories} authorName={data.content.authorName} close={() => setEditor(undefined)} save={save} busy={busy} />}
    <div className="admin-filters">
      <label className="field"><span>Search books</span><span className="search-field"><Search size={17} aria-hidden="true" /><input type="search" placeholder="Title, author or category" value={query} onChange={event => setQuery(event.target.value)} /></span></label>
      <label className="field">Visibility<select value={filter} onChange={event => setFilter(event.target.value)}>
        <option value="all">All books</option><option value="published">Visible in store</option><option value="hidden">Hidden from store</option>
      </select></label>
    </div>
    <label className="checkbox-field admin-stock-filter"><input type="checkbox" checked={stockOnly} onChange={event => setStockOnly(event.target.checked)} /> Low stock only</label>
    {results.length === 0 ? <div className="empty-panel"><BookOpen size={30} aria-hidden="true" /><h2>No books to display</h2><p>Adjust the filters or add a book.</p></div>
      : <ul className="admin-list">{results.map(book => <li key={book.id} className="admin-book-row">
        <div className={'admin-book-cover stage-' + book.palette}><BookCover book={book} /></div>
        <div className="admin-book-title"><h3>{book.title}</h3><p>{book.author} · {book.category} · {book.format}</p>
          <div className="admin-book-status">
            <span className={'status-pill ' + (book.published ? 'status-confirmed' : '')}>{book.published ? 'Published' : 'Hidden'}</span>
            {book.featured && <span className="status-pill">Featured</span>}
          </div>
        </div>
        <div className="admin-book-price"><strong>{book.price === null ? 'Unpriced' : formatPrice(book.price)}</strong><small>{book.stock === null ? 'Stock untracked' : book.stock + ' in stock'}</small></div>
        <div className="admin-row-actions">
          {book.published && <Link className="text-link" to={'/books/' + book.id}>View</Link>}
          <button type="button" className="button secondary" aria-label={'Edit ' + book.title} disabled={busy} onClick={() => { setEditor(book); window.scrollTo({ top: 0 }); }}><Pencil size={15} aria-hidden="true" /> Edit</button>
          <button type="button" className="button secondary" aria-label={(book.published ? 'Hide ' : 'Publish ') + book.title} disabled={busy} onClick={() => {
            void save(root + '/books/' + book.id + '/visibility', 'PATCH', { published: !book.published, revision: book.revision }, book.published ? 'Book hidden from the store.' : 'Book published.');
          }}>{book.published ? <Archive size={15} aria-hidden="true" /> : <RotateCcw size={15} aria-hidden="true" />}{book.published ? 'Hide' : 'Publish'}</button>
        </div>
      </li>)}</ul>}
  </>;
}

function CategoriesPanel({ data, save, busy }: { data: CatalogData; save: Save; busy: boolean }) {
  const [editor, setEditor] = useState<Category | null | undefined>();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    if (await save(root + '/categories' + (editor ? '/' + editor.id : ''), editor ? 'PATCH' : 'POST',
      { ...fields, revision: editor?.revision }, editor ? 'Category updated.' : 'Category added.')) setEditor(undefined);
  }

  return <>
    <div className="admin-tools"><div><h2>Categories</h2><p>Organize books and manage the category cards on the homepage.</p></div>
      <button type="button" className="button primary" disabled={busy} onClick={() => setEditor(null)}><CirclePlus size={17} aria-hidden="true" /> Add category</button>
    </div>
    {editor !== undefined && <form key={editor?.id ?? 'new'} className="form-panel admin-editor" onSubmit={event => void submit(event)}>
      <h2>{editor ? 'Edit category' : 'Add a category'}</h2>
      <div className="form-grid">
        <label className="field">Category name<input name="name" required maxLength={80} defaultValue={editor?.name} /></label>
        <label className="field">Description<input name="description" maxLength={250} defaultValue={editor?.description} /></label>
      </div>
      <div className="inline-actions"><button type="submit" className="button primary" disabled={busy}>Save category</button>
        <button type="button" className="button secondary" disabled={busy} onClick={() => setEditor(undefined)}>Cancel</button></div>
    </form>}
    <ul className="admin-list">{data.categories.map(category => {
      const count = data.books.filter(book => book.categoryId === category.id).length;
      return <li key={category.id} className="admin-category-row">
        <span className="dashboard-icon"><Tags size={19} aria-hidden="true" /></span>
        <div className="admin-book-title"><h3>{category.name}</h3><p>{category.description || 'No description'} · {count} {count === 1 ? 'book' : 'books'}</p></div>
        <div className="admin-row-actions"><button type="button" className="button secondary" disabled={busy} aria-label={'Edit category ' + category.name} onClick={() => setEditor(category)}><Pencil size={15} aria-hidden="true" /> Edit</button>
          {count === 0 && <button type="button" className="button secondary" disabled={busy} aria-label={'Delete category ' + category.name} onClick={() => {
            if (window.confirm('Delete the empty category “' + category.name + '”?')) void save(root + '/categories/' + category.id, 'DELETE', { revision: category.revision }, 'Category deleted.');
          }}><Trash2 size={15} aria-hidden="true" /> Delete</button>}
        </div>
      </li>;
    })}</ul>
  </>;
}

function ContentPanel({ data, save, busy }: { data: CatalogData; save: Save; busy: boolean }) {
  const groups = [
    { name: 'Homepage', fields: contentFields.slice(0, 4) },
    { name: 'About and contact', fields: contentFields.slice(6, 9) },
    { name: 'Store policies', fields: contentFields.slice(9) }
  ];
  return <form key={data.revision} className="form-panel admin-editor" onSubmit={event => {
    event.preventDefault();
    if (!busy) void save(root + '/content', 'PATCH', {
      revision: data.revision, content: { ...data.content, ...Object.fromEntries(new FormData(event.currentTarget)) }
    }, 'Store pages updated.');
  }}>
    <h2>Store content</h2><p className="small-note">Changes appear on the storefront as soon as you save.</p>
    {groups.map(group => <fieldset className="admin-content-group" key={group.name}>
      <legend>{group.name}</legend><div className="form-grid">{group.fields.map(({ key, label, max }) =>
        <label className={'field' + (max > 200 ? ' field-wide' : '')} key={key}>{label}
          {max > 200 ? <textarea name={key} maxLength={max} rows={max > 500 ? 4 : 2} defaultValue={data.content[key]} required />
            : <input name={key} maxLength={max} defaultValue={data.content[key]} required={key !== 'announcement' && key !== 'heroAccent'} />}
        </label>
      )}</div>
    </fieldset>)}
    <button className="button primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save store content'}</button>
  </form>;
}

function AuthorPanel({ data, save, busy }: { data: CatalogData; save: Save; busy: boolean }) {
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const [replacement, setReplacement] = useState<{ type: string; data: string } | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const photo = replacement ? `data:${replacement.type};base64,${replacement.data}` : removePhoto ? null : data.authorPhoto;
  const titles = data.books.filter(book => matchesAuthor(book.author, data.content.authorName)).length;

  async function choosePhoto(file?: File) {
    setError('');
    setReplacement(null);
    if (!file) return;
    setReading(true);
    try {
      setReplacement(await readImage(file));
      setRemovePhoto(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not read the photo.');
    } finally {
      setReading(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reading || busy) return;
    const form = new FormData(event.currentTarget);
    void save(root + '/author', 'PATCH', {
      authorName: form.get('authorName'), authorBio: form.get('authorBio'),
      revision: data.revision, photo: replacement ?? (removePhoto ? null : undefined)
    }, 'Author profile saved.');
  }

  return <>
    <div className="admin-tools"><div><h2>Author profile</h2><p>Manage the photo and bio shown on the storefront.</p></div>
      <Link className="button secondary" to="/author">View author page</Link>
    </div>
    <form className="form-panel admin-editor admin-author-editor" onSubmit={submit}>
      <div className="admin-author-preview">
        <AuthorPortrait name={data.content.authorName} photo={photo} />
        <p>{titles} {titles === 1 ? 'title' : 'titles'} linked to this profile</p>
      </div>
      <div className="admin-author-fields">
        <label className="field">Author name<input required maxLength={100} name="authorName" defaultValue={data.content.authorName} /></label>
        <p className="small-note">A name change also updates books currently linked to this profile.</p>
        <label className="field">Author biography<textarea required name="authorBio" maxLength={800} rows={5} defaultValue={data.content.authorBio} /></label>
        <label className="field">Upload author photo<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || reading}
          onChange={event => void choosePhoto(event.target.files?.[0])} /><small>JPG, PNG or WebP, up to 1 MB.</small></label>
        {data.authorPhoto && !replacement && <label className="checkbox-field"><input type="checkbox" checked={removePhoto} onChange={event => setRemovePhoto(event.target.checked)} /> Remove photo</label>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button primary" type="submit" disabled={busy || reading || Boolean(error)}>{busy || reading ? 'Saving…' : 'Save author profile'}</button>
      </div>
    </form>
  </>;
}

function BundlesPanel({ data, save, busy }: { data: CatalogData; save: Save; busy: boolean }) {
  const [editor, setEditor] = useState<Book | null | undefined>();
  const books = data.books.filter(book => book.format !== 'Bundle');
  const bundles = data.books.filter(book => book.format === 'Bundle');
  return <div className="feature-stack">
    <div className="admin-tools"><div><h2>Book bundles</h2><p>Combine two to ten titles under one price.</p></div>
      <button className="button primary" type="button" onClick={() => setEditor(null)} disabled={busy || books.length < 2}>Add bundle</button>
    </div>
    {editor !== undefined && <form className="form-panel form-stack" key={editor?.id ?? 'new'} onSubmit={async event => {
      event.preventDefault();
      const values = new FormData(event.currentTarget);
      const saved = await save(root + '/bundles' + (editor ? '/' + editor.id : ''), editor ? 'PATCH' : 'POST', {
        title: values.get('title'), description: values.get('description'), categoryId: Number(values.get('categoryId')),
        price: Number(values.get('price')), bookIds: values.getAll('bookId'), published: values.has('published'),
        revision: editor?.revision
      }, 'Bundle saved.');
      if (saved) setEditor(undefined);
    }}>
      <div className="form-grid">
        <label className="field">Bundle name<input name="title" required maxLength={180} defaultValue={editor?.title} /></label>
        <label className="field">Price (₹)<input name="price" type="number" required min={1} max={1000000} defaultValue={editor?.price ?? undefined} /></label>
        <label className="field">Category<select name="categoryId" required defaultValue={editor?.categoryId}>
          {data.categories.map(category => <option value={category.id} key={category.id}>{category.name}</option>)}
        </select></label>
        <label className="field field-wide">Description<textarea required name="description" rows={3} maxLength={3000} defaultValue={editor?.description} /></label>
      </div>
      <fieldset className="admin-content-group"><legend>Included books</legend><div className="feature-stack">
        {books.map(book => <label className="checkbox-field" key={book.id}><input name="bookId" type="checkbox" value={book.id}
          defaultChecked={editor?.bundle?.some(member => member.id === book.id)} />{book.title} · {book.format}{book.published ? '' : ' (hidden)'}</label>)}
      </div></fieldset>
      <label className="checkbox-field"><input name="published" type="checkbox" defaultChecked={editor?.published} /> Publish on the storefront</label>
      <div className="inline-actions"><button className="button primary" disabled={busy} type="submit">Save bundle</button>
        <button className="button secondary" type="button" onClick={() => setEditor(undefined)}>Close</button></div>
    </form>}
    {!bundles.length ? <p>No bundles created yet.</p> : <ul className="notification-list">{bundles.map(bundle => <li key={bundle.id}>
      <div><h3>{bundle.title}</h3><p>{bundle.bundle?.length ?? 0} books · {formatPrice(bundle.price ?? 0)} · {bundle.published ? 'Published' : 'Hidden'}</p></div>
      <button className="button secondary" type="button" disabled={busy} onClick={() => setEditor(bundle)}>Edit bundle</button>
    </li>)}</ul>}
  </div>;
}

export function CatalogAdmin({ section, startAdding = false, lowStock = false }: { section: CatalogSection; startAdding?: boolean; lowStock?: boolean }) {
  const [data, setData] = useState<CatalogData | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const { refresh } = useCatalog();

  useEffect(() => {
    let current = true;
    setBusy(true);
    storeRequest<CatalogData>(root).then(result => { if (current) setData(result); })
      .catch(error => { if (current) setError(errorMessage(error)); })
      .finally(() => { if (current) setBusy(false); });
    return () => { current = false; };
  }, [reload]);

  const save: Save = async (path, method, body, success) => {
    setBusy(true);
    setMessage('');
    setError('');
    try {
      await storeRequest(path, method, body);
      setMessage(success);
      setReload(value => value + 1);
      void refresh();
      return true;
    } catch (error) {
      setError(errorMessage(error));
      setBusy(false);
      return false;
    }
  };

  return <>
    {message && <p role="status" className="feedback">{message}</p>}
    {error && <div className="form-error" role="alert"><p>{error}</p><button type="button" className="button secondary" disabled={busy} onClick={() => {
      setError('');
      setData(null);
      setReload(value => value + 1);
    }}>Refresh dashboard</button></div>}
    {!data ? (!error && <p role="status">Loading the catalog…</p>) : section === 'books' ? <BooksPanel data={data} save={save} busy={busy} startAdding={startAdding} lowStock={lowStock} />
      : section === 'categories' ? <CategoriesPanel data={data} save={save} busy={busy} />
      : section === 'bundles' ? <BundlesPanel data={data} save={save} busy={busy} />
      : section === 'author' ? <AuthorPanel key={data.revision} data={data} save={save} busy={busy} />
      : <ContentPanel data={data} save={save} busy={busy} />}
  </>;
}
