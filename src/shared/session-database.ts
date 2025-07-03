import Database from 'better-sqlite3';
import path from 'path';
import logger from './logger';

const dbPath = path.join(__dirname, '..', '..', 'data', 'sessions.sqlite');
const db = new Database(dbPath);

logger.info(`Session database connected at ${dbPath}`);

// Create the sessions table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    friendlyName TEXT NOT NULL,
    businessUnit TEXT
  )
`);

export default db;