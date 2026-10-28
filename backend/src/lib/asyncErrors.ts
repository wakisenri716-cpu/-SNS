// Express 4 doesn't notice errors thrown inside async route handlers: the
// rejected promise goes unhandled, the request hangs, and Node then exits
// the whole server. This makes every handler's rejection go to `next(err)`
// — and so to the JSON error handler in app.ts — the way synchronous throws
// already do. (Same idea as the express-async-errors package.) Import it
// before any router is created.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Layer = require("express/lib/router/layer");

const handleRequest = Layer.prototype.handle_request;
Layer.prototype.handle_request = function (this: { handle: (...args: unknown[]) => unknown }, req: unknown, res: unknown, next: (err?: unknown) => void) {
  // Error handlers (4 arguments) keep Express's own handling.
  if (this.handle.length > 3) return handleRequest.call(this, req, res, next);
  try {
    const result = this.handle(req, res, next);
    if (result && typeof (result as Promise<unknown>).catch === "function") (result as Promise<unknown>).catch(next);
  } catch (err) {
    next(err);
  }
};

export {};
