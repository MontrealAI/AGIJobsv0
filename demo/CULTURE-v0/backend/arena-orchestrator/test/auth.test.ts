import { jest } from '@jest/globals';
import type { Request, Response } from 'express';
import { requireWriteToken } from '../src/auth.js';

const token = 'test-operator-token-for-local-tests-only';

function request(
  method: string,
  authorization?: string,
  configured: string | undefined = token,
) {
  const next = jest.fn();
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  requireWriteToken(configured)(
    { method, get: () => authorization } as unknown as Request,
    { status } as unknown as Response,
    next,
  );
  return { next, status, json };
}

describe('operator write authorization', () => {
  it.each([undefined, '', 'Basic abc', 'Bearer incorrect'])(
    'rejects invalid credentials %s',
    (header) => {
      const result = request('POST', header);
      expect(result.status).toHaveBeenCalledWith(401);
      expect(result.next).not.toHaveBeenCalled();
    },
  );
  it('authorizes a matching bearer token', () => {
    expect(request('POST', `Bearer ${token}`).next).toHaveBeenCalledTimes(1);
  });
  it.each(['GET', 'HEAD', 'OPTIONS'])(
    'permits public %s requests',
    (method) => {
      expect(request(method).next).toHaveBeenCalledTimes(1);
    },
  );
  it('supports an explicitly unconfigured local simulation', () => {
    const next = jest.fn();
    requireWriteToken()({ method: 'POST' } as Request, {} as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
