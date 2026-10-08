import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sha256Hex, sha256HexSync } from '../src/api/payloadHash';

const node = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const bytes = (s: string) => new TextEncoder().encode(s);

describe('payload hash', () => {
  it('matches the published SHA-256 test vectors (software implementation)', () => {
    expect(sha256HexSync(bytes(''))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(sha256HexSync(bytes('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(sha256HexSync(bytes('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it.each([55, 56, 57, 63, 64, 65, 119, 120, 1000])(
    'agrees with Node crypto around padding boundaries (%i bytes)',
    (n) => {
      const text = 'x'.repeat(n);
      expect(sha256HexSync(bytes(text))).toBe(node(text));
    },
  );

  it('hashes unicode as UTF-8 and agrees with Web Crypto / Node', async () => {
    const text = JSON.stringify({ name: 'Zoë ₹ 🚀', n: 1.5 });
    expect(sha256HexSync(bytes(text))).toBe(node(text));
    expect(await sha256Hex(text)).toBe(node(text));
  });

  it('falls back to the software implementation without Web Crypto', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try {
      expect(await sha256Hex('{"a":1}')).toBe(node('{"a":1}'));
    } finally {
      if (original) Object.defineProperty(globalThis, 'crypto', original);
    }
  });
});
