import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAgent } from './agent.js';
import { buildFilename, renderNote } from './note.js';
import {
  getConversation,
  saveConversation,
  nextNoteNr,
  upsertNote,
  getNoteByConversation,
  listNotes,
  getNote,
  deleteNote,
  startBackupSchedule,
} from './db.js';

const PORT = process.env.PORT || 3000;
const APP_PASSWORD = process.env.APP_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET;
const SESSION_DAYS = Math.max(1, parseInt(process.env.SESSION_DAYS || '365', 10) || 365);
const SESSION_MAX_AGE_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

if (!APP_PASSWORD || !SESSION_SECRET) {
  console.error('APP_PASSWORD und SESSION_SECRET müssen gesetzt sein (siehe .env.example).');
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY && process.env.MOCK_AGENT !== '1') {
  console.error('ANTHROPIC_API_KEY muss gesetzt sein (oder MOCK_AGENT=1 für Tests).');
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

// ---- Auth ---------------------------------------------------------------

function sign(payload) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
}

function timingSafeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

// Das Token trägt seinen Ausstellzeitpunkt mit sich und läuft ab. Ein Wechsel
// von SESSION_SECRET zieht weiterhin alle bestehenden Sessions zurück.
function issueToken() {
  const issuedAt = Date.now().toString(36);
  return `${issuedAt}.${sign(issuedAt)}`;
}

function verifyToken(token) {
  if (typeof token !== 'string') return false;
  const [issuedAt, signature] = token.split('.');
  if (!issuedAt || !signature) return false;
  if (!timingSafeEqual(signature, sign(issuedAt))) return false;
  const issued = parseInt(issuedAt, 36);
  return Number.isFinite(issued) && Date.now() - issued < SESSION_MAX_AGE_MS;
}

function getCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function isAuthed(req) {
  return verifyToken(getCookie(req, 'session'));
}

function requireAuth(req, res, next) {
  if (!isAuthed(req)) return res.status(401).json({ error: 'unauthorized' });
  next();
}

// Bremse gegen Passwort-Raten. Sie steigt an, statt pauschal lange zu sperren:
// ein paar Vertipper kosten fast nichts, hartnäckiges Raten wird sehr langsam.
const MAX_ATTEMPTS = 5;
const FIRST_LOCKOUT_MS = 60 * 1000;
const MAX_LOCKOUT_MS = 15 * 60 * 1000;
const login = { failures: 0, lockouts: 0, lockedUntil: 0 };

app.post('/api/login', async (req, res) => {
  if (Date.now() < login.lockedUntil) {
    const seconds = Math.ceil((login.lockedUntil - Date.now()) / 1000);
    return res.status(429).json({ error: `Zu viele Versuche. Bitte ${seconds} Sekunden warten.` });
  }

  const { password } = req.body || {};
  if (typeof password !== 'string' || !timingSafeEqual(password, APP_PASSWORD)) {
    login.failures += 1;
    if (login.failures >= MAX_ATTEMPTS) {
      login.lockedUntil =
        Date.now() + Math.min(FIRST_LOCKOUT_MS * 2 ** login.lockouts, MAX_LOCKOUT_MS);
      login.lockouts += 1;
      login.failures = 0;
    }
    await new Promise((r) => setTimeout(r, 800));
    return res.status(401).json({ error: 'Falsches Passwort' });
  }

  login.failures = 0;
  login.lockouts = 0;
  res.setHeader(
    'Set-Cookie',
    `session=${issueToken()}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 24 * 60 * 60}${
      process.env.NODE_ENV === 'production' ? '; Secure' : ''
    }`
  );
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => res.json({ authed: isAuthed(req) }));

app.get('/healthz', (req, res) => res.json({ ok: true }));

// ---- Chat (SSE) ---------------------------------------------------------

app.post('/api/chat', requireAuth, async (req, res) => {
  const { conversationId, message } = req.body || {};
  if (typeof conversationId !== 'string' || !conversationId.trim() ||
      typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'conversationId und message erforderlich' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const keepAlive = setInterval(() => res.write(': ping\n\n'), 15000);

  const messages = getConversation(conversationId) || [];
  messages.push({ role: 'user', content: message.trim() });

  // Speichert die Notiz dieser Unterhaltung – oder aktualisiert sie, wenn der
  // Bot nach einer Korrektur ein zweites Mal speichert.
  const saveNote = async (input) => {
    const fields = { ...input };
    const existing = getNoteByConversation(conversationId);
    const nr = existing ? existing.nr : nextNoteNr();
    const title = String(fields.title || '').trim() || 'Ohne Titel';
    const filename = buildFilename(nr, fields.visit_date, title);
    const markdown = renderNote(fields);
    const id = upsertNote({
      id: existing?.id,
      conversationId,
      nr,
      title,
      filename,
      markdown,
      fields,
    });
    return { id: Number(id), nr, filename, markdown, updated: Boolean(existing) };
  };

  try {
    await runAgent(messages, {
      onEvent: (event) => send(event.type, event),
      onSaveNote: saveNote,
    });
    saveConversation(conversationId, messages);
    send('done', { ok: true });
  } catch (err) {
    console.error('Chat-Fehler:', err);
    // Verlauf trotzdem sichern, damit die Unterhaltung fortsetzbar bleibt
    try {
      saveConversation(conversationId, messages);
    } catch (saveErr) {
      console.error('Verlauf konnte nicht gespeichert werden:', saveErr);
    }
    send('error', { error: 'Da ist etwas schiefgelaufen. Bitte versuche es erneut.' });
  } finally {
    clearInterval(keepAlive);
    res.end();
  }
});

// ---- Unterhaltung wiederherstellen --------------------------------------

/** Baut aus dem Verlauf das, was im Chat sichtbar war (ohne Tool-Innereien). */
function toTranscript(messages) {
  const transcript = [];
  for (const message of messages) {
    if (typeof message.content === 'string') {
      if (message.content.trim()) transcript.push({ role: message.role, text: message.content });
      continue;
    }
    const text = message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();
    if (text && text !== '(Recherche-Ergebnisse ausgeblendet)') {
      transcript.push({ role: message.role, text });
    }
  }
  return transcript;
}

app.get('/api/conversations/:id', requireAuth, (req, res) => {
  const messages = getConversation(req.params.id) || [];
  const note = getNoteByConversation(req.params.id);
  res.json({
    messages: toTranscript(messages),
    note: note
      ? { id: note.id, nr: note.nr, filename: note.filename, markdown: note.markdown }
      : null,
  });
});

// ---- Notizen ------------------------------------------------------------

app.get('/api/notes', requireAuth, (req, res) => res.json(listNotes()));

app.get('/api/notes/:id', requireAuth, (req, res) => {
  const note = getNote(Number(req.params.id));
  if (!note) return res.status(404).json({ error: 'not found' });
  res.json({ id: note.id, nr: note.nr, title: note.title, filename: note.filename, markdown: note.markdown });
});

app.delete('/api/notes/:id', requireAuth, (req, res) => {
  if (!deleteNote(Number(req.params.id))) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

// ---- Static -------------------------------------------------------------

app.use(express.static(path.join(__dirname, '..', 'public')));

startBackupSchedule();

app.listen(PORT, () => {
  console.log(`Exhibition Hub läuft auf Port ${PORT}${process.env.MOCK_AGENT === '1' ? ' (MOCK-Modus)' : ''}`);
});
