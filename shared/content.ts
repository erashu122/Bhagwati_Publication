export const contentFields = [
  { key: 'announcement', label: 'Announcement bar', max: 100 },
  { key: 'heroTitle', label: 'Home headline', max: 120 },
  { key: 'heroAccent', label: 'Home headline accent', max: 55 },
  { key: 'heroIntro', label: 'Home introduction', max: 300 },
  { key: 'authorName', label: 'Featured author', max: 100 },
  { key: 'authorBio', label: 'Featured author description', max: 800 },
  { key: 'aboutLead', label: 'About headline', max: 160 },
  { key: 'aboutBody', label: 'About page text', max: 1200 },
  { key: 'contactIntro', label: 'Contact introduction', max: 400 },
  { key: 'shipping', label: 'Shipping policy', max: 2000 },
  { key: 'returns', label: 'Returns policy', max: 2000 },
  { key: 'privacy', label: 'Privacy policy', max: 2000 }
] as const;

export type ContentKey = typeof contentFields[number]['key'];
export type StoreContent = Record<ContentKey, string>;
export type ContentRecord = { content: StoreContent; revision: number; authorPhoto: string | null };

export function matchesAuthor(bookAuthor: string, profileName: string) {
  return bookAuthor.trim().toLowerCase() === profileName.trim().toLowerCase();
}

export const defaultContent: StoreContent = {
  announcement: 'Books in English and Hindi',
  heroTitle: 'A new perspective is just a',
  heroAccent: 'page away.',
  heroIntro: 'Explore business wisdom, ideas that shape our future, and stories of life told through Hindi literature.',
  authorName: 'Dr. S. B. Saraswat',
  authorBio: 'Explore Dr. S. B. Saraswat’s work on management, auctions, artificial intelligence and Hindi literature.',
  aboutLead: 'A books-only collection spanning business, management, technology and Hindi literature.',
  aboutBody: 'Discover Dr. S. B. Saraswat’s titles on auctions, inventory, leadership and artificial intelligence alongside his Hindi work भाई हो तो ऐसा.\n\nPublisher history, a verified author biography and official business information are pending publisher approval.',
  contactIntro: 'Ask about books, bulk orders or publishing using the form below.',
  shipping: 'Print orders require a delivery address. You can see the shipping charge and total at checkout. Orders containing only digital titles do not require a shipping address or a shipping fee.',
  returns: 'Return eligibility, timelines and the process for requesting a return are pending publisher confirmation.',
  privacy: 'The cart saves book IDs and quantities in your browser. The store keeps your account details, order requests, delivery addresses and any enquiries you submit in its database. Your optional UPI ID, wishlist and notification history are saved to your account. A browser cookie keeps you signed in. You can remove your default address and UPI ID from your account.'
};
