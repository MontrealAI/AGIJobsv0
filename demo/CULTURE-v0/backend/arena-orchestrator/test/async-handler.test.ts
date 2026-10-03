import { jest } from '@jest/globals';
import type { Request, Response } from 'express';
import { asyncHandler } from '../src/async-handler.js';

describe('Express async errors', () => {
  it('forwards a rejected request handler to Express error middleware', async () => {
    const error = new Error('metrics unavailable');
    const next = jest.fn();
    asyncHandler(() => Promise.reject(error))(
      {} as Request,
      {} as Response,
      next,
    );
    await Promise.resolve();
    expect(next).toHaveBeenCalledWith(error);
  });

  it('leaves successful responses alone', async () => {
    const next = jest.fn();
    asyncHandler(() => Promise.resolve())({} as Request, {} as Response, next);
    await Promise.resolve();
    expect(next).not.toHaveBeenCalled();
  });
});
