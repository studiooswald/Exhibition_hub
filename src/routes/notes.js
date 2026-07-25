import express from 'express';
import { requireAuth } from '../auth.js';
import { listNotes, getNote, deleteNote } from '../db.js';
import { toNoteView } from '../note.js';
import { today } from '../clock.js';

export const notesRouter = express.Router();

notesRouter.get('/notes', requireAuth, (req, res) => {
  res.json(listNotes().map(toNoteView));
});

notesRouter.get('/notes/:id', requireAuth, (req, res) => {
  const note = getNote(Number(req.params.id));
  if (!note) return res.status(404).json({ error: 'not found' });
  res.json(toNoteView(note));
});

notesRouter.delete('/notes/:id', requireAuth, (req, res) => {
  if (!deleteNote(Number(req.params.id))) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

// Alles zum Mitnehmen: Felder und fertiges Markdown in einer Datei
notesRouter.get('/export', requireAuth, (req, res) => {
  const notes = listNotes().map((note) => ({ ...toNoteView(note), fields: note.fields }));
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="exhibition-hub-${today()}.json"`);
  res.send(JSON.stringify({ exported_at: new Date().toISOString(), notes }, null, 2));
});
