import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';

export function requireWriteToken(token?: string): RequestHandler {
  const expected = token
    ? createHash('sha256').update(token).digest()
    : undefined;
  return (req, res, next) => {
    if (!expected || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      next();
      return;
    }
    const authorization = req.get('authorization') ?? '';
    const supplied = authorization.startsWith('Bearer ')
      ? authorization.slice(7)
      : '';
    const actual = createHash('sha256').update(supplied).digest();
    if (!supplied || !timingSafeEqual(expected, actual)) {
      res.status(401).json({
        error: 'unauthorized',
        message: 'A valid operator API token is required.',
      });
      return;
    }
    next();
  };
}
