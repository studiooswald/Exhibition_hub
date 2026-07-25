import { saveNoteFields, getNote } from './db.js';
import { normalizeFields, toNoteView } from './note.js';
import { reviewLink } from './link.js';

/**
 * Nimmt die Felder aus dem save_note-Aufruf entgegen, räumt sie auf, legt die
 * Notiz an oder aktualisiert die bestehende der Unterhaltung und prüft dabei
 * den Link. Ein bemängelter Link geht als Hinweis an den Bot zurück, der dann
 * nachbessern kann – gespeichert wird die Notiz trotzdem.
 */
export async function saveNoteFromAgent(conversationId, input) {
  const fields = normalizeFields(input);
  const { id, updated } = saveNoteFields({ conversationId, fields });
  const note = toNoteView(getNote(id));
  return { note, updated, linkWarning: await reviewLink(fields.link) };
}
