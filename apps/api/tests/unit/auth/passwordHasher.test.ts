import { describe, expect, it } from 'vitest';
import { createPasswordHasher } from '../../../src/services/auth/passwordHasher.js';

const hasher = createPasswordHasher({ N: 1024, r: 8, p: 1 });

describe('password hasher', () => {
  it('verifies the right password and rejects a wrong one', async () => {
    const stored = await hasher.hash('Correct-Horse-9');
    expect(await hasher.verify('Correct-Horse-9', stored)).toBe(true);
    expect(await hasher.verify('correct-horse-9', stored)).toBe(false);
  });

  it('salts every hash and never stores the password', async () => {
    const a = await hasher.hash('Same-Password-1');
    const b = await hasher.hash('Same-Password-1');
    expect(a).not.toBe(b);
    expect(a).not.toContain('Same-Password-1');
    expect(a.startsWith('scrypt$1024$8$1$')).toBe(true);
  });

  it('verifies a hash made with another cost, so the cost can be raised later', async () => {
    const old = await createPasswordHasher({ N: 2048, r: 8, p: 1 }).hash('Old-Cost-Pass-1');
    expect(await hasher.verify('Old-Cost-Pass-1', old)).toBe(true);
  });

  it('treats unicode-equivalent passwords as equal (NFKC)', async () => {
    const stored = await hasher.hash('Café-Passw0rd');
    expect(await hasher.verify('Café-Passw0rd', stored)).toBe(true);
  });

  it.each([
    '',
    'plain-text',
    'bcrypt$10$abc$def',
    'scrypt$1024$8$1$onlysalt',
    'scrypt$1024$8$1$salt$hash$extra',
    'scrypt$abc$8$1$c2FsdA==$aGFzaA==',
    'scrypt$1000$8$1$c2FsdA==$aGFzaA==',
    'scrypt$1073741824$8$1$c2FsdA==$aGFzaA==',
    'scrypt$1024$8$1$c2FsdA==$',
  ])('rejects the malformed stored hash %j without throwing', async (stored) => {
    expect(await hasher.verify('anything', stored)).toBe(false);
  });
});
