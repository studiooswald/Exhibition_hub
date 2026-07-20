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
  insertNote,
  listNotes,
  getNote,
} from './db.js';

const PORT = process.env.PORT || 3000;
const APP_PASSWORD = process.env.APP_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET;

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

const AUTH_TOKEN = crypto
  .createHmac('sha256', SESSION_SECRET)
  .update('exhibition-hub-session')
  .digest('hex');

function timingSafeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
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
  const token = getCookie(req, 'session');
  return token !== null && timingSafeEqual(token, AUTH_TOKEN);
}

function requireAuth(req, res, next) {
  if (!isAuthed(req)) return res.status(401).json({ error: 'unauthorized' });
  next();
}

app.post('/api/login', async (req, res) => {
  const { password } = req.body || {};
  if (typeof password !== 'string' || !timingSafeEqual(password, APP_PASSWORD)) {
    await new Promise((r) => setTimeout(r, 800)); // Brute-Force bremsen
    return res.status(401).json({ error: 'Falsches Passwort' });
  }
  const oneYear = 365 * 24 * 60 * 60;
  res.setHeader(
    'Set-Cookie',
    `session=${AUTH_TOKEN}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${oneYear}${
      process.env.NODE_ENV === 'production' ? '; Secure' : ''
    }`
  );
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => res.json({ authed: isAuthed(req) }));

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

  try {
    const messages = getConversation(conversationId) || [];
    messages.push({ role: 'user', content: message.trim() });

    const { assistantContent, noteFields } = await runAgent(messages, (event) => {
      send(event.type, event);
    });

    messages.push({ role: 'assistant', content: assistantContent });

    if (noteFields) {
      const { toolUseId, ...fields } = noteFields;
      const nr = nextNoteNr();
      const filename = buildFilename(nr, fields.visit_date, fields.title || 'Ohne Titel');
      const markdown = renderNote(fields);
      const id = insertNote({ nr, title: fields.title || 'Ohne Titel', filename, markdown, fields });
      // Tool-Ergebnis in den Verlauf, damit die Konversation fortsetzbar bleibt
      messages.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: toolUseId,
            content: `Notiz gespeichert als "${filename}".`,
          },
        ],
      });
      send('note', { id, nr, filename, markdown });
    }

    saveConversation(conversationId, messages);
    send('done', { ok: true });
  } catch (err) {
    console.error('Chat-Fehler:', err);
    send('error', { error: 'Da ist etwas schiefgelaufen. Bitte versuche es erneut.' });
  } finally {
    clearInterval(keepAlive);
    res.end();
  }
});

// ---- Notizen ------------------------------------------------------------

app.get('/api/notes', requireAuth, (req, res) => res.json(listNotes()));

app.get('/api/notes/:id', requireAuth, (req, res) => {
  const note = getNote(Number(req.params.id));
  if (!note) return res.status(404).json({ error: 'not found' });
  res.json({ id: note.id, nr: note.nr, title: note.title, filename: note.filename, markdown: note.markdown });
});

// ---- Static -------------------------------------------------------------

app.use(express.static(path.join(__dirname, '..', 'public')));

app.listen(PORT, () => {
  console.log(`Exhibition Hub läuft auf Port ${PORT}${process.env.MOCK_AGENT === '1' ? ' (MOCK-Modus)' : ''}`);
});
