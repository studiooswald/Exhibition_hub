import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { today } from './clock.js';

const DATA_DIR = process.env.DATA_DIR || './data';
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const BACKUP_KEEP = Math.max(1, parseInt(process.env.BACKUP_KEEP || '14', 10) || 14);

// Nummer, die die nächste Notiz bekommen soll, solange die Datenbank leer ist.
// Damit schließt der Bot an die Notizen an, die schon in Obsidian liegen.
const START_NR = Math.max(1, parseInt(process.env.START_NR || '1', 10) || 1);

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
    conversation_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Migration für Datenbanken aus der ersten Version
const noteColumns = db.prepare('PRAGMA table_info(notes)').all().map((c) => c.name);
if (!noteColumns.includes('conversation_id')) {
  db.exec('ALTER TABLE notes ADD COLUMN conversation_id TEXT');
}
if (!noteColumns.includes('updated_at')) {
  db.exec("ALTER TABLE notes ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''");
}
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_conversation
    ON notes(conversation_id) WHERE conversation_id IS NOT NULL
`);

// ---- Unterhaltungen -----------------------------------------------------

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

// ---- Notizen ------------------------------------------------------------

export function nextNoteNr() {
  const row = db.prepare('SELECT MAX(nr) AS max_nr FROM notes').get();
  return Math.max((row?.max_nr ?? 0) + 1, START_NR);
}

export function getNoteByConversation(conversationId) {
  if (!conversationId) return null;
  const row = db.prepare('SELECT * FROM notes WHERE conversation_id = ?').get(conversationId);
  return row ? { ...row, fields: JSON.parse(row.fields_json) } : null;
}

/**
 * Legt die Notiz einer Unterhaltung an – oder aktualisiert sie, wenn es schon
 * eine gibt. Korrekturen erzeugen dadurch keine zweite Notiz und verbrauchen
 * keine weitere Nummer.
 */
export function upsertNote({ id, conversationId, nr, title, filename, markdown, fields }) {
  const fieldsJson = JSON.stringify(fields);
  if (id) {
    db.prepare(`
      UPDATE notes
         SET title = ?, filename = ?, markdown = ?, fields_json = ?, updated_at = datetime('now')
       WHERE id = ?
    `).run(title, filename, markdown, fieldsJson, id);
    return id;
  }
  const result = db.prepare(`
    INSERT INTO notes (nr, title, filename, markdown, fields_json, conversation_id, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(nr, title, filename, markdown, fieldsJson, conversationId || null);
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

export function deleteNote(id) {
  return db.prepare('DELETE FROM notes WHERE id = ?').run(id).changes > 0;
}

// ---- Backups ------------------------------------------------------------

/**
 * Schreibt eine konsistente Kopie der Datenbank nach data/backups/.
 * Höchstens eine Sicherung pro Tag, ältere als BACKUP_KEEP werden gelöscht.
 */
export function backupNow() {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const target = path.join(BACKUP_DIR, `exhibition-hub-${today()}.db`);
    if (fs.existsSync(target)) return null;

    db.prepare('VACUUM INTO ?').run(target);

    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('exhibition-hub-') && f.endsWith('.db'))
      .sort();
    for (const file of files.slice(0, Math.max(0, files.length - BACKUP_KEEP))) {
      fs.rmSync(path.join(BACKUP_DIR, file), { force: true });
    }
    return target;
  } catch (err) {
    // Eine fehlgeschlagene Sicherung darf die App nie stoppen
    console.error('Backup fehlgeschlagen:', err.message);
    return null;
  }
}

export function startBackupSchedule() {
  backupNow();
  setInterval(backupNow, 6 * 60 * 60 * 1000).unref();
}

export default db;
