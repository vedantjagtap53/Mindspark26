// Verifies the X-Payload-Hash header: the hex SHA-256 of the exact request body bytes, computed
// by the browser before sending. It detects corrupted or tampered bodies (and proxies that
// rewrite them). It is an integrity check, not a secret: anyone who can call the API can compute
// it, so it never replaces authentication.
import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { PAYLOAD_HASH_HEADER } from '@mindspark/shared';
import { AppError } from '../utils/errors.js';

const WITH_BODY = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const HEX_SHA256 = /^[0-9a-f]{64}$/;

export function verifyPayloadHash(options: { required: boolean }): RequestHandler {
  return (req, _res, next) => {
    const body = req.rawBody;
    if (!WITH_BODY.has(req.method) || !body || body.length === 0) {
      next();
      return;
    }
    const header = req.get(PAYLOAD_HASH_HEADER)?.trim().toLowerCase();
    if (header === undefined || header === '') {
      next(
        options.required
          ? new AppError('PAYLOAD_HASH_MISMATCH', 'The X-Payload-Hash header is required')
          : undefined,
      );
      return;
    }
    const actual = createHash('sha256').update(body).digest();
    const matches = HEX_SHA256.test(header) && timingSafeEqual(actual, Buffer.from(header, 'hex'));
    next(
      matches
        ? undefined
        : new AppError('PAYLOAD_HASH_MISMATCH', 'The request body does not match its payload hash'),
    );
  };
}
