import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || './data';
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'exhibition-hub.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    messages_json TEXT NOT NULL DEFAULT '[]'
  );
  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nr INTEGER NOT NULL,
    title TEXT NOT NULL,
    filename TEXT NOT NULL,
    markdown TEXT NOT NULL,
    fields_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

export function getConversation(id) {
  const row = db.prepare('SELECT messages_json FROM conversations WHERE id = ?').get(id);
  return row ? JSON.parse(row.messages_json) : null;
}

export function saveConversation(id, messages) {
  db.prepare(`
    INSERT INTO conversations (id, messages_json) VALUES (?, ?)
    ON CONFLICT(id) DO UPDATE SET messages_json = excluded.messages_json
  `).run(id, JSON.stringify(messages));
}

export function nextNoteNr() {
  const row = db.prepare('SELECT MAX(nr) AS max_nr FROM notes').get();
  return (row?.max_nr ?? 0) + 1;
}

export function insertNote({ nr, title, filename, markdown, fields }) {
  const result = db.prepare(`
    INSERT INTO notes (nr, title, filename, markdown, fields_json) VALUES (?, ?, ?, ?, ?)
  `).run(nr, title, filename, markdown, JSON.stringify(fields));
  return result.lastInsertRowid;
}

export function listNotes() {
  return db.prepare(`
    SELECT id, nr, title, filename, created_at FROM notes ORDER BY nr DESC
  `).all();
}

export function getNote(id) {
  const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
  if (!row) return null;
  return { ...row, fields: JSON.parse(row.fields_json) };
}

export default db;
