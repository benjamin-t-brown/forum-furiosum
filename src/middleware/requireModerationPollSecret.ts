import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { fail } from '../routes/api/helpers';

export function getModerationPollSecret(): string | undefined {
  const secret = process.env.MODERATION_POLL_SECRET?.trim();
  return secret || undefined;
}

function secretsEqual(provided: string, expected: string): boolean {
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) {
    crypto.timingSafeEqual(expectedBuf, expectedBuf);
    return false;
  }
  return crypto.timingSafeEqual(providedBuf, expectedBuf);
}

export function requireModerationPollSecret(req: Request, res: Response, next: NextFunction): void {
  const expected = getModerationPollSecret();
  if (!expected) {
    fail(res, 404, 'NOT_FOUND', 'Not found');
    return;
  }

  const authHeader = req.headers.authorization;
  let provided: string | undefined;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    provided = authHeader.slice('Bearer '.length);
  } else if (typeof req.headers['x-moderation-poll-secret'] === 'string') {
    provided = req.headers['x-moderation-poll-secret'];
  }

  if (!provided || !secretsEqual(provided, expected)) {
    fail(res, 401, 'UNAUTHORIZED', 'Invalid or missing secret');
    return;
  }

  next();
}
