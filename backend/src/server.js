import dotenv from 'dotenv';
import { createApp } from './app.js';
import { initializeDatabase, closeDatabase } from './db/database.js';
import { seedCategories } from './db/seed.js';

dotenv.config();

const PORT = process.env.PORT || 3000;
const DATABASE_PATH = process.env.DATABASE_PATH || './data/grocery.db';

try {
  initializeDatabase(DATABASE_PATH);
  seedCategories();
} catch (error) {
  console.error('Failed to initialize database:', error);
  process.exit(1);
}

const app = createApp();

const server = app.listen(PORT, () => {
  console.log('Grocery App API server listening');
  console.log(`  Port:        ${PORT}`);
  console.log(`  Database:    ${DATABASE_PATH}`);
  console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
});

const gracefulShutdown = () => {
  console.log('\nReceived shutdown signal, closing server...');
  server.close(() => {
    console.log('Server closed');
    closeDatabase();
    process.exit(0);
  });

  // Force close if connections (e.g. open SSE streams) do not drain
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
