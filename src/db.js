import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { today } from './clock.js';

const DB_NAME = 'exhibition-hub.db';

fs.mkdirSync(config.dataDir, { recursive: true });

const db = new Database(path.join(config.dataDir, DB_NAME));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Gespeichert werden nur die Felder einer Notiz. Dateiname und Markdown
// entstehen daraus beim Ausliefern – so gilt eine Änderung am Notiz-Format
// rückwirkend auch für alte Notizen.
db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    messages_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nr INTEGER NOT NULL,
    conversation_id TEXT,
    fields_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_conversation
    ON notes(conversation_id) WHERE conversation_id IS NOT NULL;
`);

migrateFromFirstVersion();

/**
 * Die erste Fassung legte Titel, Dateiname und Markdown zusätzlich als Spalten
 * ab. Deren Inhalte stecken alle in fields_json – die Zeilen werden also nur
 * umgehängt, es geht nichts verloren.
 */
function migrateFromFirstVersion() {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'notes_old'")
    .all();
  if (tables.length > 0) return;

  const columns = db.prepare('PRAGMA table_info(notes)').all().map((c) => c.name);
  if (!columns.includes('markdown')) return;

  db.exec('BEGIN');
  try {
    db.exec(`
      ALTER TABLE notes RENAME TO notes_old;
      CREATE TABLE notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nr INTEGER NOT NULL,
        conversation_id TEXT,
        fields_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO notes (id, nr, conversation_id, fields_json, created_at, updated_at)
        SELECT id, nr,
               ${columns.includes('conversation_id') ? 'conversation_id' : 'NULL'},
               fields_json, created_at, created_at
          FROM notes_old;
      DROP TABLE notes_old;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_conversation
        ON notes(conversation_id) WHERE conversation_id IS NOT NULL;
    `);
    db.exec('COMMIT');
    console.log('Notizen aus der ersten Fassung übernommen.');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// ---- Unterhaltungen -----------------------------------------------------

export function getConversation(id) {
  const row = db.prepare('SELECT messages_json FROM conversations WHERE id = ?').get(id);
  return row ? JSON.parse(row.messages_json) : null;
}

export function saveConversation(id, messages) {
  db.prepare(`
    INSERT INTO conversations (id, messages_json) VALUES (?, ?)
    ON CONFLICT(id) DO UPDATE SET messages_json = excluded.messages_json,
                                  updated_at = datetime('now')
  `).run(id, JSON.stringify(messages));
}

// ---- Notizen ------------------------------------------------------------

function hydrate(row) {
  return row ? { ...row, fields: JSON.parse(row.fields_json) } : null;
}

/** Nummer, die die nächste neue Notiz bekommt. */
export function nextNoteNr() {
  const row = db.prepare('SELECT MAX(nr) AS max_nr FROM notes').get();
  return Math.max((row?.max_nr ?? 0) + 1, config.startNr);
}

export function getNoteByConversation(conversationId) {
  if (!conversationId) return null;
  return hydrate(db.prepare('SELECT * FROM notes WHERE conversation_id = ?').get(conversationId));
}

export function getNote(id) {
  return hydrate(db.prepare('SELECT * FROM notes WHERE id = ?').get(id));
}

export function listNotes() {
  return db.prepare('SELECT * FROM notes ORDER BY nr DESC').all().map(hydrate);
}

/**
 * Legt die Notiz einer Unterhaltung an – oder aktualisiert sie, wenn es schon
 * eine gibt. Korrekturen erzeugen dadurch keine zweite Notiz und verbrauchen
 * keine weitere Nummer.
 */
export function saveNoteFields({ conversationId, fields }) {
  const existing = getNoteByConversation(conversationId);
  const fieldsJson = JSON.stringify(fields);

  if (existing) {
    db.prepare(
      "UPDATE notes SET fields_json = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(fieldsJson, existing.id);
    return { id: existing.id, nr: existing.nr, updated: true };
  }

  const nr = nextNoteNr();
  const result = db
    .prepare('INSERT INTO notes (nr, conversation_id, fields_json) VALUES (?, ?, ?)')
    .run(nr, conversationId || null, fieldsJson);
  return { id: Number(result.lastInsertRowid), nr, updated: false };
}

export function deleteNote(id) {
  return db.prepare('DELETE FROM notes WHERE id = ?').run(id).changes > 0;
}

// ---- Backups ------------------------------------------------------------

const backupDir = () => path.join(config.dataDir, 'backups');

/**
 * Legt eine konsistente Kopie der Datenbank an, höchstens eine pro Tag.
 * Ältere als BACKUP_KEEP werden entfernt.
 */
export function backupNow() {
  try {
    fs.mkdirSync(backupDir(), { recursive: true });
    const target = path.join(backupDir(), `${DB_NAME}.${today()}.bak`);
    if (fs.existsSync(target)) return null;

    db.prepare('VACUUM INTO ?').run(target);

    const files = fs
      .readdirSync(backupDir())
      .filter((name) => name.startsWith(`${DB_NAME}.`) && name.endsWith('.bak'))
      .sort();
    for (const name of files.slice(0, Math.max(0, files.length - config.backupKeep))) {
      fs.rmSync(path.join(backupDir(), name), { force: true });
    }
    return target;
  } catch (err) {
    // Eine fehlgeschlagene Sicherung darf die App nie aufhalten
    console.error('Backup fehlgeschlagen:', err.message);
    return null;
  }
}

export function startBackupSchedule() {
  backupNow();
  return setInterval(backupNow, 6 * 60 * 60 * 1000).unref();
}

export default db;
