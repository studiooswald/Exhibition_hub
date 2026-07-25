// Alle Einstellungen an einer Stelle. Fehlt etwas Wichtiges, sagt der Bot das
// beim Start in einem klaren Satz, statt später mitten im Gespräch umzufallen.

function num(value, fallback, min = 1) {
  const parsed = parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed >= min ? parsed : fallback;
}

export const config = {
  telegramToken: process.env.TELEGRAM_BOT_TOKEN || '',
  // Nur diese Telegram-Nutzer:in darf den Bot benutzen. Das ersetzt jeden Login.
  allowedUserId: num(process.env.TELEGRAM_USER_ID, 0, 0),

  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  model: process.env.MODEL || 'claude-sonnet-5',
  mock: process.env.MOCK_AGENT === '1',

  dataDir: process.env.DATA_DIR || './data',
  // Nummer der nächsten Notiz, solange noch keine gespeichert ist – damit der
  // Bot an die Notizen anschließt, die schon in Obsidian liegen. Lässt sich
  // jederzeit im Chat mit /nummer ändern.
  startNr: num(process.env.START_NR, 1),
  backupKeep: num(process.env.BACKUP_KEEP, 14),

  // Nach so vielen Stunden Pause gilt die nächste Nachricht als neue
  // Ausstellung, damit nichts versehentlich als Korrektur gedeutet wird.
  conversationTimeoutHours: num(process.env.CONVERSATION_TIMEOUT_HOURS, 6),

  timezone: process.env.TIMEZONE || 'Europe/Berlin',
  // Beim Speichern wird die Ausstellungsseite einmal angefragt, um tote Links
  // zu erkennen. Mit LINK_CHECK=0 abschaltbar (z.B. für Tests).
  checkLinks: process.env.LINK_CHECK !== '0',
};

/** Prüft die Konfiguration. Gibt die Liste der Probleme zurück (leer = alles gut). */
export function checkConfig(cfg = config) {
  const problems = [];

  if (!cfg.telegramToken) {
    problems.push('TELEGRAM_BOT_TOKEN fehlt – den bekommst du in Telegram von @BotFather.');
  } else if (!/^\d+:[\w-]{30,}$/.test(cfg.telegramToken)) {
    problems.push('TELEGRAM_BOT_TOKEN sieht nicht wie ein Bot-Token aus (Form: 123456:ABC-DEF…).');
  }

  if (!cfg.allowedUserId) {
    problems.push(
      'TELEGRAM_USER_ID fehlt – ohne die dürfte jede:r den Bot benutzen. ' +
        'Deine ID sagt dir @userinfobot in Telegram.'
    );
  }

  if (!cfg.anthropicApiKey && !cfg.mock) {
    problems.push(
      'ANTHROPIC_API_KEY fehlt – ohne den kann der Bot nicht recherchieren. ' +
        'Zum Ausprobieren ohne Key: MOCK_AGENT=1 setzen.'
    );
  }

  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: cfg.timezone });
  } catch {
    problems.push(`TIMEZONE "${cfg.timezone}" kennt Node nicht (erwartet z.B. Europe/Berlin).`);
  }

  return problems;
}

/** Bricht mit einer verständlichen Meldung ab, wenn die Konfiguration nicht reicht. */
export function assertConfig(cfg = config) {
  const problems = checkConfig(cfg);
  if (problems.length === 0) return;
  console.error('Exhibition Bot kann so nicht starten:\n');
  for (const problem of problems) console.error(`  • ${problem}`);
  console.error('\nDie erwarteten Werte stehen in .env.example.');
  process.exit(1);
}
