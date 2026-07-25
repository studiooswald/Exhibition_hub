// Zeigt den Chatverlauf im Terminal, wie er in Telegram ankäme.
// Aufruf: node test/demo.js
import { useTempDataDir, incoming } from './helpers.js';

useTempDataDir('27');

const { createBot } = await import('../src/bot.js');

const telegram = {
  async sendMessage(chatId, text) {
    console.log(`\n\x1b[36m┌─ Bot ─────────────────────────────\x1b[0m`);
    console.log(text.replace(/<\/?pre>/g, '\x1b[2m···\x1b[0m'));
    return { message_id: Math.random() };
  },
  async editMessageText(text) {
    console.log(`\x1b[2m   ${text}\x1b[0m`);
  },
  async deleteMessage() {},
  async sendDocument(chatId, buffer, options, fileOptions) {
    console.log(`\n\x1b[35m📎 Datei: ${fileOptions.filename} (${buffer.length} Bytes)\x1b[0m`);
  },
  async sendChatAction() {},
};

const bot = createBot(telegram);

for (const text of [
  'War heute in Shifting the Silence im Lenbachhaus',
  'Kommentar: das Spiel mit Materialien war sehr spannend. War am 15.3.2026 dort.',
  'Das Enddatum stimmt nicht, die läuft bis Ende Februar',
  '/liste',
]) {
  console.log(`\n\x1b[32m👤 Du: ${text}\x1b[0m`);
  await bot.handleMessage(incoming(text));
}
