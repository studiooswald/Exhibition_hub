import fs from 'node:fs';
import path from 'node:path';
import TelegramBot from 'node-telegram-bot-api';
import { config, assertConfig } from './config.js';
import { createBot } from './bot.js';
import { startBackupSchedule, nextNoteNr } from './db.js';

assertConfig();
startBackupSchedule();

// Lebenszeichen für den Docker-Healthcheck: Ein Bot, dessen Polling sich
// aufgehängt hat, sieht von außen sonst aus wie einer, der nur nichts zu tun hat.
const heartbeatFile = path.join(config.dataDir, 'heartbeat');
const beat = () => fs.writeFileSync(heartbeatFile, String(Date.now()));
beat();
setInterval(beat, 60 * 1000).unref();

const telegram = new TelegramBot(config.telegramToken, { polling: true });
const bot = createBot(telegram);

telegram.on('message', (msg) => {
  bot.handleMessage(msg).catch((err) => {
    console.error('Nachricht konnte nicht verarbeitet werden:', err);
    telegram.sendMessage(msg.chat.id, '⚠️ Da ist etwas schiefgelaufen.').catch(() => {});
  });
});

// Polling bricht bei Netzproblemen gern mal ab – das darf den Bot nicht beenden
telegram.on('polling_error', (err) => console.error('Polling-Fehler:', err.message));
telegram.on('error', (err) => console.error('Telegram-Fehler:', err.message));

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    console.log(`\n${signal} – Bot wird beendet.`);
    await telegram.stopPolling().catch(() => {});
    process.exit(0);
  });
}

console.log(
  `Exhibition Bot läuft${config.mock ? ' (MOCK-Modus, ohne API-Key)' : ''}. ` +
    `Nächste Notiz: Nr. ${nextNoteNr()}.`
);
