export const categories = ['Business', 'Leadership', 'Technology', 'Hindi Literature'] as const;
export const bookFormats = ['eBook', 'Paperback', 'Hardcover'] as const;
export const bookPalettes = ['green', 'wine', 'ink', 'sand', 'teal', 'clay', 'plum', 'slate'] as const;
export const bookArtworks = ['orbit', 'sun', 'scale', 'sprig', 'tower', 'boxes', 'gavel', 'arch'] as const;
export const readingPreviewKinds = { overview: 'Book overview', story: 'Story teaser', excerpt: 'Publisher sample' } as const;
export type ReadingPreviewKind = keyof typeof readingPreviewKinds;
export const readingPreviewMaxLength = 6000;

type BookDetails = {
  id: string;
  title: string;
  coverTitle: string;
  coverSubtitle?: string;
  category: string;
  price: number | null;
  format: typeof bookFormats[number];
  language: string;
  artwork: typeof bookArtworks[number];
  palette: typeof bookPalettes[number];
  description: string;
  coverImage?: string;
};

export type Book = BookDetails & {
  readingPreview: string;
  readingPreviewKind: ReadingPreviewKind;
  author: string;
  categoryId: number;
  stock: number | null;
  featured: boolean;
  published: boolean;
  revision: number;
};

export type Category = { id: number; name: string; description: string; revision: number };

export function canOrder(book: Book | undefined): book is Book & { price: number } {
  return Boolean(book?.published && book.price !== null && book.stock !== 0);
}

export const author = 'Dr. S. B. Saraswat';

export const seedBooks: BookDetails[] = [
  {
    id: 'artificial-intelligence', title: 'Artificial Intelligence: Opportunities, Challenges and the Future of Humanity',
    coverTitle: 'Artificial\nIntelligence', coverSubtitle: 'Opportunities, Challenges and the Future of Humanity',
    category: 'Technology', price: 400, format: 'eBook', language: 'English', artwork: 'orbit', palette: 'green',
    description: 'An introduction to questions raised by artificial intelligence, from the opportunities it opens to the choices it asks of society.'
  },
  {
    id: 'sundarkand', title: 'SundarKand: Executing Impossible Corporate Missions',
    coverTitle: 'SundarKand', coverSubtitle: 'Executing Impossible Corporate Missions',
    category: 'Leadership', price: 299, format: 'Paperback', language: 'English', artwork: 'sun', palette: 'wine',
    description: 'A reading of the SundarKand through the lens of leadership, teamwork and the work of pursuing an ambitious mission.'
  },
  {
    id: 'black-and-white', title: 'Black and White of E-Auctions in India',
    coverTitle: 'Black and White', coverSubtitle: 'of E-Auctions in India',
    category: 'Business', price: 881, format: 'Paperback', language: 'English', artwork: 'scale', palette: 'ink',
    description: 'An exploration of electronic auctions in India and the decisions that shape how buyers and sellers participate.'
  },
  {
    id: 'bhai-ho-to-aisa', title: 'भाई हो तो ऐसा', coverTitle: 'भाई हो\nतो ऐसा',
    category: 'Hindi Literature', price: 381, format: 'eBook', language: 'Hindi', artwork: 'sprig', palette: 'sand',
    description: 'भाईचारे और रिश्तों की संवेदनाओं पर केंद्रित एक हिंदी रचना।'
  },
  {
    id: 'market-leadership', title: 'Market Leadership by Steel Companies through Management of Change',
    coverTitle: 'Market\nLeadership', coverSubtitle: 'Management of Change in Steel Companies',
    category: 'Leadership', price: 1755, format: 'Hardcover', language: 'English', artwork: 'tower', palette: 'teal',
    description: 'A look at market leadership and organizational change through the example of steel companies.'
  },
  {
    id: 'inventory-management', title: 'Strategies to Increase Profit through Inventory Management',
    coverTitle: 'Inventory\nManagement', coverSubtitle: 'Strategies to Increase Profit',
    category: 'Business', price: 1755, format: 'Hardcover', language: 'English', artwork: 'boxes', palette: 'clay',
    description: 'A business title on the relationship between inventory decisions, operating costs and profitability.'
  },
  {
    id: 'practical-e-auctions', title: 'A Practical Guide to E-Auctions — 75 Ideas for Increasing your Company’s Profit',
    coverTitle: 'A Practical Guide\nto E-Auctions', coverSubtitle: '75 Ideas for Increasing your Company’s Profit',
    category: 'Business', price: null, format: 'Hardcover', language: 'English', artwork: 'gavel', palette: 'plum',
    description: 'A guide organized around ideas for using electronic auctions in business purchasing and sales.'
  },
  {
    id: 'construction-arbitration', title: 'Construction Arbitration — Delays, Disputes & Resolution',
    coverTitle: 'Construction\nArbitration', coverSubtitle: 'Delays, Disputes & Resolution',
    category: 'Business', price: null, format: 'Hardcover', language: 'English', artwork: 'arch', palette: 'slate',
    description: 'An overview of delays, disputes and the role of arbitration in construction projects.'
  }
];

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 0
});

export function formatPrice(price: number) {
  return inr.format(price);
}
