// Alle Einstellungen an einer Stelle. Fehlt etwas Wichtiges, sagt die App das
// beim Start in einem klaren Satz, statt später mitten im Chat umzufallen.

function num(value, fallback, min = 1) {
  const parsed = parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed >= min ? parsed : fallback;
}

export const config = {
  port: num(process.env.PORT, 3000, 1),
  production: process.env.NODE_ENV === 'production',

  appPassword: process.env.APP_PASSWORD || '',
  sessionSecret: process.env.SESSION_SECRET || '',
  sessionDays: num(process.env.SESSION_DAYS, 365),

  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  model: process.env.MODEL || 'claude-sonnet-5',
  mock: process.env.MOCK_AGENT === '1',

  dataDir: process.env.DATA_DIR || './data',
  // Nummer der nächsten Notiz, solange noch keine gespeichert ist – damit der
  // Bot an die Notizen anschließt, die schon in Obsidian liegen.
  startNr: num(process.env.START_NR, 1),
  backupKeep: num(process.env.BACKUP_KEEP, 14),

  timezone: process.env.TIMEZONE || 'Europe/Berlin',
  // Beim Speichern wird die Ausstellungsseite einmal angefragt, um tote Links
  // zu erkennen. Mit LINK_CHECK=0 abschaltbar (z.B. für Tests).
  checkLinks: process.env.LINK_CHECK !== '0',
};

/** Prüft die Konfiguration. Gibt die Liste der Probleme zurück (leer = alles gut). */
export function checkConfig(cfg = config) {
  const problems = [];

  if (!cfg.appPassword) {
    problems.push('APP_PASSWORD fehlt – das ist dein Login-Passwort für die App.');
  } else if (cfg.appPassword.length < 8) {
    problems.push('APP_PASSWORD ist kürzer als 8 Zeichen. Bitte ein längeres wählen.');
  }

  if (!cfg.sessionSecret) {
    problems.push('SESSION_SECRET fehlt – ein langer Zufallsstring zum Signieren der Anmeldung.');
  } else if (cfg.sessionSecret.length < 16) {
    problems.push('SESSION_SECRET ist zu kurz. Bitte mindestens 16 zufällige Zeichen.');
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
  console.error('Exhibition Hub kann so nicht starten:\n');
  for (const problem of problems) console.error(`  • ${problem}`);
  console.error('\nDie erwarteten Werte stehen in .env.example.');
  process.exit(1);
}
