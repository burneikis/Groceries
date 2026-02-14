import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initializeDatabase, closeDatabase } from './db/database.js';
import { seedCategories } from './db/seed.js';
import categoriesRouter from './routes/categories.js';
import itemsRouter from './routes/items.js';
import recipesRouter from './routes/recipes.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const DATABASE_PATH = process.env.DATABASE_PATH || './data/grocery.db';

// Middleware
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Initialize database
try {
  initializeDatabase(DATABASE_PATH);
  seedCategories();
} catch (error) {
  console.error('Failed to initialize database:', error);
  process.exit(1);
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/categories', categoriesRouter);
app.use('/api/items', itemsRouter);
app.use('/api/recipes', recipesRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════╗
║                                               ║
║   Grocery App API Server                      ║
║                                               ║
║   Status: Running                             ║
║   Port: ${PORT}                                   ║
║   Database: ${DATABASE_PATH}                  ║
║   Environment: ${process.env.NODE_ENV || 'development'}              ║
║                                               ║
║   Endpoints:                                  ║
║   - GET  /health                              ║
║   - GET  /api/categories                      ║
║   - POST /api/categories                      ║
║   - GET  /api/items                           ║
║   - POST /api/items                           ║
║   - GET  /api/recipes                         ║
║   - POST /api/recipes                         ║
║                                               ║
╚═══════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
const gracefulShutdown = () => {
  console.log('\nReceived shutdown signal, closing server...');
  server.close(() => {
    console.log('Server closed');
    closeDatabase();
    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
