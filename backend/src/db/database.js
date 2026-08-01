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

  // Statement logging is very noisy; only enable it when explicitly asked for.
  const verbose = process.env.SQL_DEBUG === 'true' ? console.log : null;
  db = new Database(dbPath, { verbose });

  db.pragma('foreign_keys = ON');
  // WAL lets readers (incl. long-lived SSE clients) work while a write is in
  // flight, and avoids "database is locked" under concurrent use.
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  // Tables first (idempotent CREATE TABLE IF NOT EXISTS), then migrations,
  // then indexes -- an index may cover a column a migration has just added.
  db.exec(readFileSync(join(__dirname, 'schema.sql'), 'utf-8'));
  runMigrations(db);
  db.exec(readFileSync(join(__dirname, 'indexes.sql'), 'utf-8'));

  console.log('Database initialized successfully');
  return db;
}

/**
 * Ordered, one-shot migrations tracked via SQLite's `user_version`.
 * Append new entries to the end of the array; never reorder or remove.
 */
const MIGRATIONS = [
  (database) => {
    database.exec('ALTER TABLE items ADD COLUMN recipe_id INTEGER');
    database.exec('ALTER TABLE items ADD COLUMN recipe_name TEXT');
  },
];

/**
 * Apply any migrations the database has not seen yet.
 * @param {Database} database - The database instance
 */
function runMigrations(database) {
  const current = database.pragma('user_version', { simple: true });

  for (let version = current; version < MIGRATIONS.length; version++) {
    const migrate = database.transaction(() => {
      MIGRATIONS[version](database);
      database.pragma(`user_version = ${version + 1}`);
    });

    try {
      migrate();
      console.log(`Applied migration ${version + 1}`);
    } catch (error) {
      // Pre-`user_version` databases may already have these columns.
      if (error.message.includes('duplicate column name')) {
        database.pragma(`user_version = ${version + 1}`);
        continue;
      }
      throw error;
    }
  }
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
