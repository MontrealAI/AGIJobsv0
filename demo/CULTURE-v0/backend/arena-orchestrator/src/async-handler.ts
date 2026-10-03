import type { NextFunction, Request, RequestHandler, Response } from 'express';

export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    // Express 4 requires forwarding rejected handlers to its error callback.
    // eslint-disable-next-line promise/no-callback-in-promise
    void handler(req, res, next).catch(next);
  };
}
