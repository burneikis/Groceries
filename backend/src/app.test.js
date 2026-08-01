import http from 'http';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestApp, destroyTestApp, silenceConsole } from './test/helpers.js';
import eventEmitter from './services/events.js';

let app;

beforeEach(() => {
  silenceConsole();
  app = createTestApp();
});

afterEach(() => {
  destroyTestApp();
  eventEmitter.clients.clear();
  vi.restoreAllMocks();
});

describe('GET /health', () => {
  it('reports ok with a timestamp', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(Date.parse(res.body.timestamp)).not.toBeNaN();
  });
});

describe('unknown routes', () => {
  it('returns JSON, not HTML, for an unknown /api route', async () => {
    const res = await request(app).get('/api/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({ error: 'Route not found' });
  });

  it('404s as JSON for an unknown method on a known route', async () => {
    const res = await request(app).patch('/api/categories');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Route not found' });
  });

  it('404s for a non-API route when no frontend build is present', async () => {
    const res = await request(app).get('/some/spa/route');
    expect(res.status).toBe(404);
  });
});

describe('CORS', () => {
  it('allows cross-origin requests from the local network', async () => {
    const res = await request(app).get('/api/categories').set('Origin', 'http://100.64.0.2:5173');

    expect(res.headers['access-control-allow-origin']).toBe('*');
  });
});

describe('request parsing', () => {
  it('rejects malformed JSON without crashing', async () => {
    const res = await request(app)
      .post('/api/items')
      .set('Content-Type', 'application/json')
      .send('{"name": broken}');

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});

describe('GET /api/events (SSE)', () => {
  /**
   * Opens a real SSE connection against an ephemeral server, since supertest
   * buffers responses and would hang on a stream that never ends.
   */
  const openStream = (server) =>
    new Promise((resolve) => {
      const { port } = server.address();
      const req = http.get({ host: '127.0.0.1', port, path: '/api/events' }, (res) => {
        let buffer = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { buffer += chunk; });
        resolve({ res, req, read: () => buffer });
      });
    });

  let server;

  beforeEach(async () => {
    server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('sends SSE headers that defeat proxy and service-worker buffering', async () => {
    const { res, req } = await openStream(server);

    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    expect(res.headers['cache-control']).toMatch(/no-cache/);
    expect(res.headers['x-accel-buffering']).toBe('no');

    req.destroy();
  });

  it('opens with a retry hint and a connected comment', async () => {
    const { req, read } = await openStream(server);
    await new Promise((r) => setTimeout(r, 50));

    expect(read()).toContain('retry: 3000');
    expect(read()).toContain(': connected');

    req.destroy();
  });

  it('registers the client and pushes broadcast events to it', async () => {
    const { req, read } = await openStream(server);
    await new Promise((r) => setTimeout(r, 50));

    expect(eventEmitter.clients.size).toBe(1);

    eventEmitter.emitChange('item-created', { id: 1, name: 'Milk' }, 'c1');
    await new Promise((r) => setTimeout(r, 50));

    const frame = read().split('\n\n').find((f) => f.startsWith('data: '));
    expect(JSON.parse(frame.replace('data: ', ''))).toMatchObject({
      type: 'item-created',
      data: { id: 1, name: 'Milk' },
      changeId: 'c1',
    });

    req.destroy();
  });

  it('unregisters the client when the connection drops', async () => {
    const { req } = await openStream(server);
    await new Promise((r) => setTimeout(r, 50));
    expect(eventEmitter.clients.size).toBe(1);

    req.destroy();
    await new Promise((r) => setTimeout(r, 100));

    expect(eventEmitter.clients.size).toBe(0);
  });

  it('delivers a mutation made over the API to a listening client', async () => {
    const { req, read } = await openStream(server);
    await new Promise((r) => setTimeout(r, 50));

    await request(app).post('/api/items').send({ name: 'Bread' });
    await new Promise((r) => setTimeout(r, 50));

    expect(read()).toContain('item-created');
    expect(read()).toContain('Bread');

    req.destroy();
  });
});
