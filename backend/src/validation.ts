import type { Address } from '../../shared/store.ts';

export class RequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new RequestError(400, 'Enter valid details and try again.');
  }
  return value as Record<string, unknown>;
}

export function field(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new RequestError(400, `Enter a valid ${label} (up to ${max} characters).`);
  }
  return value.trim();
}

export function emailField(value: unknown) {
  const email = field(value, 'email address', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    throw new RequestError(400, 'Enter a valid email address.');
  }
  return email;
}

export function passwordField(value: unknown, registering: boolean) {
  if (typeof value !== 'string' || value.length > 128 || value.length < (registering ? 12 : 1)) {
    throw new RequestError(400, registering ? 'Choose a password of 12 to 128 characters.' : 'Enter a valid password.');
  }
  return value;
}

export function addressField(value: unknown): Address {
  const input = record(value);
  const phone = field(input.phone, 'phone number', 15).replace(/[ -]/g, '');
  const pin = field(input.pin, 'PIN code', 6);
  if (!/^(?:\+91)?[6-9][0-9]{9}$/.test(phone) || !/^[1-9][0-9]{5}$/.test(pin)) {
    throw new RequestError(400, 'Enter a valid Indian mobile number and six-digit PIN code.');
  }
  return {
    fullName: field(input.fullName, 'recipient name', 100),
    phone: phone.startsWith('+91') ? phone : '+91' + phone,
    street: field(input.street, 'street address', 240),
    city: field(input.city, 'city', 100),
    state: field(input.state, 'state or union territory', 100),
    pin
  };
}

export function cartEntries(value: unknown): [string, number][] {
  const entries = Object.entries(record(value)).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0 || entries.length > 100) {
    throw new RequestError(400, 'Add available books to your bag before checking out.');
  }
  return entries.map(([id, quantity]) => {
    if (id.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
      throw new RequestError(400, 'Review the books and quantities in your bag.');
    }
    return [id, quantity];
  });
}

export function uuidField(value: unknown) {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) {
    throw new RequestError(400, 'This request is invalid. Reload the page and try again.');
  }
  return value;
}
