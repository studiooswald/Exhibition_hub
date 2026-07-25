import { config } from './config.js';
import { runAgent } from './agent.js';
import { saveNoteFromAgent } from './save-note.js';
import { toNoteView } from './note.js';
import {
  getActiveConversation,
  createConversation,
  saveConversation,
  endConversation,
  listNotes,
  getNoteByNr,
  deleteNote,
  nextNoteNr,
  setNextNoteNr,
} from './db.js';
import { noteMessages, noteListMessage, splitText, HELP_TEXT } from './telegram-format.js';
import { today } from './clock.js';

const TYPING_INTERVAL_MS = 4000;
const STATUS_EDIT_THROTTLE_MS = 1500;

/**
 * Die ganze Gesprächslogik – unabhängig von der Telegram-Bibliothek, damit sie
 * sich mit einem einfachen Attrappen-Client testen lässt.
 *
 * @param {object} telegram  sendMessage, editMessageText, deleteMessage, sendDocument, sendChatAction
 */
export function createBot(telegram) {
  async function send(chatId, text, options = {}) {
    return telegram.sendMessage(chatId, text, options);
  }

  /** Schickt langen Text als mehrere Nachrichten. */
  async function sendLong(chatId, text) {
    for (const chunk of splitText(text)) {
      if (chunk.trim()) await send(chatId, chunk);
    }
  }

  async function handleMessage(msg) {
    const chatId = msg?.chat?.id;
    const text = String(msg?.text ?? '').trim();
    if (!chatId || !text) return;

    // Der Bot gehört genau einer Person – alles andere wird abgewiesen
    if (config.allowedUserId && msg.from?.id !== config.allowedUserId) {
      console.warn(`Fremder Zugriff von ${msg.from?.id} (@${msg.from?.username ?? '?'})`);
      await send(chatId, 'Dieser Bot ist privat.');
      return;
    }

    if (text.startsWith('/')) return handleCommand(chatId, text);
    return handleExhibition(chatId, text);
  }

  async function handleCommand(chatId, text) {
    // "/notiz@meinbot 27" → command "notiz", rest "27"
    const [rawCommand, ...rest] = text.split(/\s+/);
    const command = rawCommand.slice(1).split('@')[0].toLowerCase();
    const argument = rest.join(' ').trim();

    switch (command) {
      case 'start':
      case 'hilfe':
      case 'help':
        return send(chatId, HELP_TEXT);

      case 'neu':
        endConversation(chatId);
        return send(chatId, 'Alles klar – in welcher Ausstellung warst du?');

      case 'liste': {
        const notes = listNotes(15).map(toNoteView);
        const message = noteListMessage(notes);
        return send(chatId, message.text, message.parse_mode ? { parse_mode: message.parse_mode } : {});
      }

      case 'notiz': {
        const nr = parseInt(argument, 10);
        if (!Number.isFinite(nr)) return send(chatId, 'Welche Nummer? Zum Beispiel: /notiz 27');

        const note = getNoteByNr(nr);
        if (!note) return send(chatId, `Zu Nummer ${nr} habe ich keine Notiz.`);
        return sendNote(chatId, { note: toNoteView(note), updated: false, linkWarning: null });
      }

      case 'loeschen':
      case 'löschen': {
        const nr = parseInt(argument, 10);
        if (!Number.isFinite(nr)) return send(chatId, 'Welche Nummer? Zum Beispiel: /loeschen 27');

        const note = getNoteByNr(nr);
        if (!note) return send(chatId, `Zu Nummer ${nr} habe ich keine Notiz.`);
        deleteNote(note.id);
        return send(chatId, `Notiz ${nr} „${note.fields.title}" ist gelöscht.`);
      }

      case 'nummer': {
        if (!argument) return send(chatId, `Die nächste Notiz bekommt die Nummer ${nextNoteNr()}.`);

        const nr = parseInt(argument, 10);
        if (!Number.isFinite(nr) || nr < 1) return send(chatId, 'Bitte eine Zahl, zum Beispiel: /nummer 27');

        const actual = setNextNoteNr(nr);
        return actual === nr
          ? send(chatId, `Gut – die nächste Notiz bekommt die Nummer ${nr}.`)
          : send(
              chatId,
              `Es gibt schon Notizen bis Nummer ${actual - 1}. Die nächste bekommt daher die ${actual}.`
            );
      }

      case 'export':
        return sendExport(chatId);

      default:
        return send(chatId, `Den Befehl /${command} kenne ich nicht.\n\n${HELP_TEXT}`);
    }
  }

  /** Der eigentliche Ablauf: recherchieren, nachfragen, speichern. */
  async function handleExhibition(chatId, text) {
    const conversation = getActiveConversation(chatId) || createConversation(chatId);
    const messages = conversation.messages;
    messages.push({ role: 'user', content: text });

    const typing = setInterval(
      () => telegram.sendChatAction(chatId, 'typing').catch(() => {}),
      TYPING_INTERVAL_MS
    );
    telegram.sendChatAction(chatId, 'typing').catch(() => {});

    let statusMessageId = null;
    let lastStatusEdit = 0;
    let lastStatusText = '';
    try {
      statusMessageId = (await send(chatId, '🔎 Ich schaue nach …'))?.message_id ?? null;
    } catch {
      // Ohne Statusmeldung geht es auch weiter
    }

    // Der Agent ruft onEvent synchron auf – deshalb wird hier nur gesammelt und
    // erst nach dem Durchlauf in der richtigen Reihenfolge verschickt.
    const items = [];
    const onEvent = (event) => {
      if (event.type === 'text') {
        const last = items[items.length - 1];
        if (last?.type === 'text') last.text += event.text;
        else items.push({ type: 'text', text: event.text });
        return;
      }
      if (event.type === 'note') {
        // Bessert der Bot innerhalb eines Zuges nach (etwa den Link), soll die
        // Notiz nicht zweimal im Chat stehen – die spätere Fassung ersetzt die
        // frühere. Ob sie neu ist, entscheidet der erste Stand.
        const existing = items.find((item) => item.type === 'note' && item.note.id === event.note.id);
        if (existing) {
          existing.note = event.note;
          existing.linkWarning = event.linkWarning;
        } else {
          items.push({
            type: 'note',
            note: event.note,
            updated: event.updated,
            linkWarning: event.linkWarning,
          });
        }
        return;
      }
      if (event.type === 'status' && statusMessageId) {
        // Zwischenstand zeigen, aber Telegram nicht mit Änderungen überfahren
        const now = Date.now();
        if (now - lastStatusEdit < STATUS_EDIT_THROTTLE_MS || event.text === lastStatusText) return;
        lastStatusEdit = now;
        lastStatusText = event.text;
        telegram
          .editMessageText(`🔎 ${event.text}`, { chat_id: chatId, message_id: statusMessageId })
          .catch(() => {});
      }
    };

    try {
      await runAgent(messages, {
        onEvent,
        onSaveNote: (input) => saveNoteFromAgent(conversation.id, input),
      });
      saveConversation(conversation.id, messages);
    } catch (err) {
      console.error('Fehler im Gespräch:', err);
      // Verlauf trotzdem sichern, damit weitergeredet werden kann
      try {
        saveConversation(conversation.id, messages);
      } catch (saveErr) {
        console.error('Verlauf konnte nicht gespeichert werden:', saveErr);
      }
      items.push({ type: 'text', text: '⚠️ Da ist etwas schiefgelaufen. Versuch es bitte noch einmal.' });
    } finally {
      clearInterval(typing);
      if (statusMessageId) {
        await telegram.deleteMessage(chatId, statusMessageId).catch(() => {});
      }
    }

    for (const item of items) {
      if (item.type === 'text') await sendLong(chatId, item.text.trim());
      else await sendNote(chatId, item);
    }
  }

  /** Notiz als kopierbare Nachricht plus als .md-Datei für Obsidian. */
  async function sendNote(chatId, { note, updated, linkWarning }) {
    for (const message of noteMessages({ note, updated, linkWarning })) {
      await send(chatId, message.text, { parse_mode: message.parse_mode });
    }
    try {
      await telegram.sendDocument(
        chatId,
        Buffer.from(note.markdown, 'utf8'),
        {},
        { filename: `${note.filename}.md`, contentType: 'text/markdown' }
      );
    } catch (err) {
      console.error('Notiz konnte nicht als Datei geschickt werden:', err.message);
    }
  }

  async function sendExport(chatId) {
    const notes = listNotes(1000).map((note) => ({ ...toNoteView(note), fields: note.fields }));
    if (notes.length === 0) return send(chatId, 'Es gibt noch nichts zu sichern.');

    const payload = JSON.stringify({ exported_at: new Date().toISOString(), notes }, null, 2);
    await telegram.sendDocument(
      chatId,
      Buffer.from(payload, 'utf8'),
      { caption: `${notes.length} Notizen` },
      { filename: `exhibition-bot-${today()}.json`, contentType: 'application/json' }
    );
  }

  return { handleMessage, handleCommand, handleExhibition, sendNote };
}
