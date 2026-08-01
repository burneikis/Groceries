import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import express from 'express';
import cors from 'cors';
import categoriesRouter from './routes/categories.js';
import itemsRouter from './routes/items.js';
import recipesRouter from './routes/recipes.js';
import eventsRouter from './routes/events.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Build the Express application.
 *
 * Kept separate from `server.js` so tests can mount the app without opening a
 * port, initializing the real database, or installing signal handlers.
 *
 * @param {object} [options]
 * @param {boolean} [options.logRequests=true] - Log each incoming request
 * @param {string} [options.publicPath] - Directory holding the built frontend
 * @returns {import('express').Express}
 */
export function createApp({ logRequests = true, publicPath } = {}) {
  const app = express();

  app.use(cors());
  app.use(express.json());

  if (logRequests) {
    app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
      next();
    });
  }

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api/categories', categoriesRouter);
  app.use('/api/items', itemsRouter);
  app.use('/api/recipes', recipesRouter);
  app.use('/api/events', eventsRouter);

  // Unknown API routes must 404 as JSON rather than falling through to the SPA,
  // which would hand the client an HTML body it cannot parse.
  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Route not found' });
  });

  const staticPath = publicPath ?? join(__dirname, '..', 'public');
  if (existsSync(staticPath)) {
    app.use(express.static(staticPath));
    app.get('*', (req, res) => {
      res.sendFile(join(staticPath, 'index.html'));
    });
  } else {
    app.use((req, res) => {
      res.status(404).json({ error: 'Route not found' });
    });
  }

  // eslint-disable-next-line no-unused-vars -- Express identifies error
  // middleware by arity; `next` must stay in the signature.
  app.use((err, req, res, next) => {
    // Body-parser and friends attach a status (e.g. 400 for malformed JSON);
    // only a genuinely unexpected error should become a 500.
    const status = err.status ?? err.statusCode ?? 500;

    if (status >= 500) {
      console.error('Server error:', err);
      return res.status(status).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined,
      });
    }

    res.status(status).json({ error: err.message || 'Bad request' });
  });

  return app;
}

export default createApp;
