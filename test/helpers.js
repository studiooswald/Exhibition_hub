import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const CHAT_ID = 4711;
export const USER_ID = 1234567;

/** Jeder Testlauf bekommt eine eigene, leere Datenbank. */
export function useTempDataDir(startNr = '1') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exhibition-bot-test-'));
  process.env.DATA_DIR = dir;
  process.env.START_NR = startNr;
  process.env.TELEGRAM_BOT_TOKEN = `123456:${'A'.repeat(35)}`;
  process.env.TELEGRAM_USER_ID = String(USER_ID);
  process.env.MOCK_AGENT = '1';
  process.env.TIMEZONE = 'Europe/Berlin';
  // Kein Netz in Tests: der Netz-Check hat eigene Tests gegen einen lokalen Server
  process.env.LINK_CHECK = '0';
  return dir;
}

/** Attrappe der Telegram-Bibliothek, die alles mitschreibt statt zu senden. */
export function fakeTelegram() {
  let nextMessageId = 1;
  const calls = { messages: [], edits: [], deletes: [], documents: [], actions: [] };

  return {
    calls,
    /** Alle Nachrichtentexte als ein Block – praktisch für Zusicherungen. */
    get text() {
      return calls.messages.map((message) => message.text).join('\n---\n');
    },
    async sendMessage(chatId, text, options = {}) {
      calls.messages.push({ chatId, text, options });
      return { message_id: nextMessageId++ };
    },
    async editMessageText(text, options) {
      calls.edits.push({ text, options });
      return true;
    },
    async deleteMessage(chatId, messageId) {
      calls.deletes.push({ chatId, messageId });
      return true;
    },
    async sendDocument(chatId, buffer, options = {}, fileOptions = {}) {
      calls.documents.push({ chatId, content: buffer.toString('utf8'), options, fileOptions });
      return { message_id: nextMessageId++ };
    },
    async sendChatAction() {
      calls.actions.push('typing');
      return true;
    },
    reset() {
      for (const list of Object.values(calls)) list.length = 0;
    },
  };
}

/** Baut eine eingehende Telegram-Nachricht. */
export function incoming(text, { userId = USER_ID, chatId = CHAT_ID } = {}) {
  return { chat: { id: chatId }, from: { id: userId, username: 'pete' }, text };
}
