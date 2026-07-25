import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { today } from './clock.js';

const DB_NAME = 'exhibition-bot.db';

fs.mkdirSync(config.dataDir, { recursive: true });

const db = new Database(path.join(config.dataDir, DB_NAME));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Gespeichert werden nur die Felder einer Notiz. Dateiname und Markdown
// entstehen daraus beim Verschicken – so gilt eine Änderung am Notiz-Format
// rückwirkend auch für alte Notizen.
db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    chat_id INTEGER NOT NULL,
    messages_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_conversations_chat ON conversations(chat_id, updated_at);

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

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// ---- Einstellungen ------------------------------------------------------

function getSetting(key) {
  return db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value ?? null;
}

function setSetting(key, value) {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, String(value));
}

// ---- Unterhaltungen -----------------------------------------------------

/**
 * Die laufende Unterhaltung eines Chats – aber nur, wenn sie noch frisch ist.
 * Nach einer längeren Pause beginnt die nächste Nachricht eine neue
 * Ausstellung, damit sie nicht versehentlich als Korrektur der letzten gilt.
 */
export function getActiveConversation(chatId, timeoutHours = config.conversationTimeoutHours) {
  const row = db
    .prepare('SELECT * FROM conversations WHERE chat_id = ? ORDER BY updated_at DESC LIMIT 1')
    .get(chatId);
  if (!row) return null;

  const ageMs = Date.now() - new Date(row.updated_at.replace(' ', 'T') + 'Z').getTime();
  if (ageMs > timeoutHours * 60 * 60 * 1000) return null;

  return { id: row.id, messages: JSON.parse(row.messages_json) };
}

export function createConversation(chatId) {
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO conversations (id, chat_id) VALUES (?, ?)').run(id, chatId);
  return { id, messages: [] };
}

export function saveConversation(id, messages) {
  db.prepare(
    "UPDATE conversations SET messages_json = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(JSON.stringify(messages), id);
}

/** Beendet die laufende Unterhaltung, sodass die nächste Nachricht neu anfängt. */
export function endConversation(chatId) {
  db.prepare(
    "UPDATE conversations SET updated_at = datetime('now', '-100 years') WHERE chat_id = ?"
  ).run(chatId);
}

// ---- Notizen ------------------------------------------------------------

function hydrate(row) {
  return row ? { ...row, fields: JSON.parse(row.fields_json) } : null;
}

/** Nummer, die die nächste neue Notiz bekommt. */
export function nextNoteNr() {
  const highest = db.prepare('SELECT MAX(nr) AS max_nr FROM notes').get()?.max_nr ?? 0;
  const floor = parseInt(getSetting('next_nr') ?? '', 10);
  return Math.max(highest + 1, Number.isFinite(floor) ? floor : config.startNr);
}

/** Legt fest, welche Nummer die nächste neue Notiz bekommt (Befehl /nummer). */
export function setNextNoteNr(nr) {
  setSetting('next_nr', nr);
  return nextNoteNr();
}

export function getNoteByConversation(conversationId) {
  if (!conversationId) return null;
  return hydrate(db.prepare('SELECT * FROM notes WHERE conversation_id = ?').get(conversationId));
}

export function getNote(id) {
  return hydrate(db.prepare('SELECT * FROM notes WHERE id = ?').get(id));
}

export function getNoteByNr(nr) {
  return hydrate(db.prepare('SELECT * FROM notes WHERE nr = ?').get(nr));
}

export function listNotes(limit = 100) {
  return db.prepare('SELECT * FROM notes ORDER BY nr DESC LIMIT ?').all(limit).map(hydrate);
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
    // Eine fehlgeschlagene Sicherung darf den Bot nie aufhalten
    console.error('Backup fehlgeschlagen:', err.message);
    return null;
  }
}

export function startBackupSchedule() {
  backupNow();
  return setInterval(backupNow, 6 * 60 * 60 * 1000).unref();
}

export default db;
