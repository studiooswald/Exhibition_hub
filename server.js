import { createHmac, timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { getCookie, setCookie } from 'hono/cookie';
import { researchExhibition } from './lib/claude.js';
import { buildNote } from './lib/note.js';

const PORT = Number(process.env.PORT || 3000);
const APP_PASSWORD = process.env.APP_PASSWORD || '';
const SESSION_COOKIE = 'exh_session';

const app = new Hono();

function sessionToken() {
  return createHmac('sha256', APP_PASSWORD).update('exh-session-v1').digest('hex');
}

function isAuthed() {
  // Login entfernt — die App ist offen zugänglich.
  return true;
}

app.post('/api/login', async (c) => {
  const { password } = await c.req.json().catch(() => ({}));
  if (!APP_PASSWORD || password === APP_PASSWORD) {
    if (APP_PASSWORD) {
      setCookie(c, SESSION_COOKIE, sessionToken(), {
        httpOnly: true,
        sameSite: 'Strict',
        secure: c.req.header('x-forwarded-proto') === 'https',
        maxAge: 60 * 60 * 24 * 90,
        path: '/',
      });
    }
    return c.json({ ok: true });
  }
  return c.json({ ok: false, error: 'Falsches Passwort' }, 401);
});

app.get('/api/session', (c) => c.json({ authed: isAuthed(c) }));

app.post('/api/generate', async (c) => {
  if (!isAuthed(c)) return c.json({ error: 'Nicht angemeldet' }, 401);

  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.message !== 'string' || body.message.trim() === '') {
    return c.json({ error: 'message fehlt' }, 400);
  }

  const history = Array.isArray(body.history) ? body.history : [];
  const messages = [...history, { role: 'user', content: body.message }];

  try {
    const { result, rawText } = await researchExhibition(messages);
    const newHistory = [...messages, { role: 'assistant', content: rawText }];

    if (result.status === 'question') {
      return c.json({ type: 'question', question: result.question, history: newHistory });
    }

    const note = buildNote({
      research: result,
      visitDate: body.visitDate || '',
      number: body.number,
      comment: body.comment || '',
      inspiration: body.inspiration || '',
    });
    return c.json({ type: 'note', ...note, research: result, history: newHistory });
  } catch (err) {
    console.error('generate failed:', err);
    const detail = err?.status ? `Claude API Fehler (${err.status}): ${err.message}` : String(err?.message || err);
    return c.json({ error: detail }, 502);
  }
});

app.use('/*', serveStatic({ root: './public' }));

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`Exhibition Hub läuft auf http://localhost:${PORT}`);
  if (!APP_PASSWORD) console.warn('WARNUNG: APP_PASSWORD nicht gesetzt — Zugriff ist ungeschützt.');
});
