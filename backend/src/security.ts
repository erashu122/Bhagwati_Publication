import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Request } from 'express';

const derive = promisify(scrypt) as (
  password: string, salt: Buffer, length: number, options: { N: number; r: number; p: number; maxmem: number }
) => Promise<Buffer>;
const parameters = { N: 2 ** 15, r: 8, p: 3, maxmem: 40 * 1024 * 1024 };
const placeholderHash = '0'.repeat(32) + ':' + '0'.repeat(128);

export const cookieName = 'bhagwati_session';
export const sessionLength = 7 * 24 * 60 * 60 * 1000;
export const adminLogin = 'admin';
export const adminAccountEmail = 'admin@bhagwati.invalid';

export function digest(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function sessionToken(request: Request) {
  return (request.get('cookie') ?? '').split(/;\s*/u)
    .find(part => part.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
}

export async function passwordHash(password: string) {
  const salt = randomBytes(16);
  const hashed = await derive(password, salt, 64, parameters);
  return salt.toString('hex') + ':' + hashed.toString('hex');
}

export async function verifyPassword(password: string, stored = placeholderHash) {
  const [salt, hashed] = stored.split(':');
  const candidate = await derive(password, Buffer.from(salt, 'hex'), 64, parameters);
  return timingSafeEqual(candidate, Buffer.from(hashed, 'hex'));
}
