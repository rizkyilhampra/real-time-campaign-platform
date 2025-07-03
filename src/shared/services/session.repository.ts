import db from '../session-database';
import { SessionConfig } from '../types';

export const getSessionConfigs = (): SessionConfig[] => {
  const stmt = db.prepare('SELECT id, friendlyName, businessUnit FROM sessions');
  return stmt.all() as SessionConfig[];
};

export const getSessionConfig = (id: string): SessionConfig | null => {
  const stmt = db.prepare('SELECT id, friendlyName, businessUnit FROM sessions WHERE id = ?');
  return (stmt.get(id) as SessionConfig) || null;
};

export const createSessionConfig = (session: SessionConfig): void => {
  const stmt = db.prepare('INSERT INTO sessions (id, friendlyName, businessUnit) VALUES (?, ?, ?)');
  stmt.run(session.id, session.friendlyName, session.businessUnit);
};

export const updateSessionConfig = (id: string, session: Partial<SessionConfig>): void => {
  const fields = Object.keys(session).map(key => `${key} = ?`).join(', ');
  const values = Object.values(session);
  const stmt = db.prepare(`UPDATE sessions SET ${fields} WHERE id = ?`);
  stmt.run(...values, id);
};

export const deleteSessionConfig = (id: string): void => {
  const stmt = db.prepare('DELETE FROM sessions WHERE id = ?');
  stmt.run(id);
};