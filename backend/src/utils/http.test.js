import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, badRequest, conflict, handler, notFound } from './http.js';

/** Mount a single handler on a bare app so responses can be asserted. */
const appWith = (fn) => {
  const app = express();
  app.use(express.json());
  app.get('/test', handler('testing', fn));
  // eslint-disable-next-line no-unused-vars -- arity identifies error middleware
  app.use((err, req, res, next) => res.status(500).json({ error: 'Internal server error' }));
  return app;
};

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe('error constructors', () => {
  it('carry the right status codes', () => {
    expect(badRequest('x').status).toBe(400);
    expect(notFound('x').status).toBe(404);
    expect(conflict('x').status).toBe(409);
  });

  it('produce real Error instances so stacks are preserved', () => {
    const error = badRequest('nope');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.message).toBe('nope');
  });
});

describe('handler', () => {
  it('passes through a successful response', async () => {
    const res = await request(appWith((req, r) => r.json({ ok: true }))).get('/test');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('awaits async handlers', async () => {
    const app = appWith(async (req, res) => {
      await new Promise((r) => setTimeout(r, 5));
      res.json({ ok: true });
    });

    expect((await request(app).get('/test')).body).toEqual({ ok: true });
  });

  it('translates an ApiError into its status and message', async () => {
    const res = await request(appWith(() => { throw notFound('Item not found'); })).get('/test');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Item not found' });
  });

  it('translates a rejected promise the same way', async () => {
    const app = appWith(async () => { throw badRequest('bad input'); });
    const res = await request(app).get('/test');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'bad input' });
  });

  it('maps a UNIQUE constraint violation to 409', async () => {
    const app = appWith(() => {
      throw new Error('UNIQUE constraint failed: categories.name');
    });
    const res = await request(app).get('/test');

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'That name already exists' });
  });

  it('forwards an unexpected error to the error middleware without leaking details', async () => {
    const app = appWith(() => { throw new Error('kaboom: /secret/path'); });
    const res = await request(app).get('/test');

    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('/secret/path');
  });

  it('logs unexpected errors with the supplied description', async () => {
    const error = vi.spyOn(console, 'error');
    await request(appWith(() => { throw new Error('kaboom'); })).get('/test');

    expect(error.mock.calls.flat().join(' ')).toContain('testing');
  });

  it('does not log expected ApiErrors as server faults', async () => {
    const error = vi.spyOn(console, 'error');
    await request(appWith(() => { throw notFound('missing'); })).get('/test');

    expect(error).not.toHaveBeenCalled();
  });
});
