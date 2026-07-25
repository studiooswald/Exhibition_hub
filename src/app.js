import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleLogin, isAuthed } from './auth.js';
import { chatRouter } from './routes/chat.js';
import { notesRouter } from './routes/notes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.get('/healthz', (req, res) => res.json({ ok: true }));

  app.post('/api/login', handleLogin);
  app.get('/api/me', (req, res) => res.json({ authed: isAuthed(req) }));

  app.use('/api', chatRouter);
  app.use('/api', notesRouter);

  app.use(express.static(path.join(__dirname, '..', 'public')));

  return app;
}
