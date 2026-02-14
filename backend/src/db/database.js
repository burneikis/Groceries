import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let db = null;

/**
 * Initialize the SQLite database with schema
 * @param {string} dbPath - Path to the database file
 * @returns {Database} - The database instance
 */
export function initializeDatabase(dbPath) {
  if (db) {
    return db;
  }

  // Create database connection
  db = new Database(dbPath, { verbose: console.log });

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Read and execute schema
  const schemaPath = join(__dirname, 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');

  // Execute schema (split by semicolon and execute each statement)
  const statements = schema
    .split(';')
    .map(stmt => stmt.trim())
    .filter(stmt => stmt.length > 0);

  for (const statement of statements) {
    db.exec(statement);
  }

  console.log('Database initialized successfully');
  return db;
}

/**
 * Get the current database instance
 * @returns {Database} - The database instance
 * @throws {Error} - If database hasn't been initialized
 */
export function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase first.');
  }
  return db;
}

/**
 * Close the database connection
 */
export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
    console.log('Database connection closed');
  }
}
