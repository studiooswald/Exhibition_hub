import express from 'express';
import { requireAuth } from '../auth.js';
import { runAgent } from '../agent.js';
import { saveNoteFromAgent } from '../save-note.js';
import { getConversation, saveConversation, getNoteByConversation } from '../db.js';
import { toNoteView } from '../note.js';

const KEEPALIVE_MS = 15000;

export const chatRouter = express.Router();

chatRouter.post('/chat', requireAuth, async (req, res) => {
  const { conversationId, message } = req.body || {};
  if (
    typeof conversationId !== 'string' || !conversationId.trim() ||
    typeof message !== 'string' || !message.trim()
  ) {
    return res.status(400).json({ error: 'conversationId und message erforderlich' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const keepAlive = setInterval(() => res.write(': ping\n\n'), KEEPALIVE_MS);

  const messages = getConversation(conversationId) || [];
  messages.push({ role: 'user', content: message.trim() });

  try {
    await runAgent(messages, {
      onEvent: (event) => send(event.type, event),
      onSaveNote: (input) => saveNoteFromAgent(conversationId, input),
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

/** Baut aus dem Verlauf das, was im Chat sichtbar war – ohne Tool-Innereien. */
export function toTranscript(messages) {
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

chatRouter.get('/conversations/:id', requireAuth, (req, res) => {
  const note = getNoteByConversation(req.params.id);
  res.json({
    messages: toTranscript(getConversation(req.params.id) || []),
    note: note ? toNoteView(note) : null,
  });
});
