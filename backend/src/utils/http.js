/**
 * Small helpers to remove the repeated try/catch + console.error + 500 blocks
 * that were duplicated across every route handler.
 */

/**
 * An error carrying an HTTP status code. Thrown from route handlers and
 * translated into a response by `handler()`.
 */
export class ApiError extends Error {
  /**
   * @param {number} status - HTTP status code
   * @param {string} message - Message returned to the client
   */
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export const badRequest = (message) => new ApiError(400, message);
export const notFound = (message) => new ApiError(404, message);
export const conflict = (message) => new ApiError(409, message);

/**
 * Wrap a route handler so thrown errors become proper HTTP responses.
 * @param {string} description - Used in the server-side error log
 * @param {(req: import('express').Request, res: import('express').Response) => any} fn
 * @returns {import('express').RequestHandler}
 */
export function handler(description, fn) {
  return async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (error) {
      if (error instanceof ApiError) {
        return res.status(error.status).json({ error: error.message });
      }
      if (error.message?.includes('UNIQUE constraint')) {
        return res.status(409).json({ error: 'That name already exists' });
      }
      console.error(`Error ${description}:`, error);
      next(error);
    }
  };
}
