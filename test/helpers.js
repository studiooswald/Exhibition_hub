import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Jeder Testlauf bekommt eine eigene, leere Datenbank. */
export function useTempDataDir(startNr = '1') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exhibition-hub-test-'));
  process.env.DATA_DIR = dir;
  process.env.START_NR = startNr;
  process.env.APP_PASSWORD = 'test-passwort';
  process.env.SESSION_SECRET = 'test-secret-mindestens-16-zeichen';
  process.env.MOCK_AGENT = '1';
  process.env.TIMEZONE = 'Europe/Berlin';
  // Kein Netz in Tests: der Netz-Check hat eigene Tests gegen einen lokalen Server
  process.env.LINK_CHECK = '0';
  return dir;
}

/** Startet die App auf einem freien Port und liefert einen Client dazu. */
export async function startTestServer() {
  const { createApp } = await import('../src/app.js');
  const server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  let cookie = '';
  const client = {
    base,
    async request(method, url, body) {
      const res = await fetch(base + url, {
        method,
        headers: {
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const setCookie = res.headers.getSetCookie?.()[0];
      if (setCookie) cookie = setCookie.split(';')[0];
      return res;
    },
    get: (url) => client.request('GET', url),
    post: (url, body) => client.request('POST', url, body),
    delete: (url) => client.request('DELETE', url),
    async json(method, url, body) {
      const res = await client.request(method, url, body);
      return res.json();
    },
    /** Schickt eine Chat-Nachricht und sammelt die SSE-Ereignisse ein. */
    async chat(conversationId, message) {
      const res = await client.request('POST', '/api/chat', { conversationId, message });
      const text = await res.text();
      const events = [];
      for (const chunk of text.split('\n\n')) {
        const type = /^event: (.+)$/m.exec(chunk)?.[1];
        const data = /^data: (.+)$/m.exec(chunk)?.[1];
        if (type && data) events.push({ type, data: JSON.parse(data) });
      }
      return events;
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
  return client;
}

/** Letztes Notiz-Ereignis aus einem Chat-Durchlauf. */
export function lastNote(events) {
  const notes = events.filter((event) => event.type === 'note');
  return notes[notes.length - 1]?.data;
}
