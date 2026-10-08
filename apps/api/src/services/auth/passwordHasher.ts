// Password hashing with scrypt (node:crypto; no extra dependency). Stored format:
//   scrypt$<N>$<r>$<p>$<salt base64>$<hash base64>
// so the cost can be raised later and old hashes still verify.
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

export interface ScryptCost {
  N: number;
  r: number;
  p: number;
}

/** OWASP-recommended scrypt setting (64 MiB, ~100–200 ms). */
export const DEFAULT_SCRYPT_COST: ScryptCost = { N: 65_536, r: 8, p: 2 };
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  /** False for a wrong password or a malformed stored hash; never throws on bad input. */
  verify(password: string, stored: string): Promise<boolean>;
}

function derive(
  password: string,
  salt: Buffer,
  { N, r, p }: ScryptCost,
  keyLength: number,
): Promise<Buffer> {
  // scrypt needs about 128 * N * r bytes; give it 2x headroom.
  const options: ScryptOptions = { N, r, p, maxmem: 256 * N * r };
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, keyLength, options, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export function createPasswordHasher(cost: ScryptCost = DEFAULT_SCRYPT_COST): PasswordHasher {
  return {
    async hash(password) {
      const salt = randomBytes(SALT_LENGTH);
      const key = await derive(password, salt, cost, KEY_LENGTH);
      return [
        'scrypt',
        cost.N,
        cost.r,
        cost.p,
        salt.toString('base64'),
        key.toString('base64'),
      ].join('$');
    },

    async verify(password, stored) {
      const [scheme, n, r, p, saltB64, keyB64, ...extra] = stored.split('$');
      if (scheme !== 'scrypt' || !keyB64 || !saltB64 || extra.length > 0) return false;
      const parsed = { N: Number(n), r: Number(r), p: Number(p) };
      // Bound the work a (corrupted) stored value can demand.
      const sane =
        Number.isInteger(parsed.N) &&
        parsed.N >= 2 &&
        parsed.N <= 2 ** 20 &&
        (parsed.N & (parsed.N - 1)) === 0 &&
        Number.isInteger(parsed.r) &&
        parsed.r >= 1 &&
        parsed.r <= 16 &&
        Number.isInteger(parsed.p) &&
        parsed.p >= 1 &&
        parsed.p <= 16;
      if (!sane) return false;
      const expected = Buffer.from(keyB64, 'base64');
      if (expected.length === 0) return false;
      try {
        const actual = await derive(
          password,
          Buffer.from(saltB64, 'base64'),
          parsed,
          expected.length,
        );
        return timingSafeEqual(actual, expected);
      } catch {
        return false;
      }
    },
  };
}
