import { canOrder } from './data/books';
import type { Book } from './data/books';

export type Cart = Record<string, number>;
export const maxQuantity = 10;
export const cartStorageKey = 'bhagwati-publication.cart';

export function readCart(): Cart {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(cartStorageKey) ?? '{}');
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};

    return Object.fromEntries(Object.entries(value).filter(([id, quantity]) => {
      return id.length <= 80 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) && Number.isInteger(quantity) && quantity > 0 && quantity <= maxQuantity;
    }));
  } catch {
    return {};
  }
}

export function cartItems(cart: Cart, booksById: Map<string, Book>) {
  return Object.entries(cart).flatMap(([id, quantity]) => {
    const book = booksById.get(id);
    return canOrder(book) ? [{ book, quantity, total: book.price * quantity }] : [];
  });
}
