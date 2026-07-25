import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { useTempDataDir, fakeTelegram, incoming, CHAT_ID, USER_ID } from './helpers.js';

useTempDataDir('26');

const { createBot } = await import('../src/bot.js');
const db = (await import('../src/db.js')).default;

const telegram = fakeTelegram();
const bot = createBot(telegram);

beforeEach(() => telegram.reset());

/** Ein vollständiger Ablauf: frisch anfangen, erzählen, nachfragen, speichern. */
async function documentExhibition(text = 'War im Lenbachhaus') {
  await bot.handleMessage(incoming('/neu'));
  await bot.handleMessage(incoming(text));
  telegram.reset();
  await bot.handleMessage(incoming('Kommentar: sehr gut, am 15.3.2026'));
}

/** Zählt nur die Kopfzeilen der Notiz-Nachrichten, nicht den Fließtext des Bots. */
function noteHeaders() {
  return telegram.calls.messages.filter((message) => /^(📝|✏️) Notiz/.test(message.text));
}

describe('Zugang', () => {
  test('fremde Telegram-Konten kommen nicht durch', async () => {
    await bot.handleMessage(incoming('War im Lenbachhaus', { userId: USER_ID + 1 }));

    assert.equal(telegram.calls.messages.length, 1);
    assert.match(telegram.text, /privat/);
    assert.equal(telegram.calls.documents.length, 0);
  });

  test('leere Nachrichten werden einfach ignoriert', async () => {
    await bot.handleMessage(incoming('   '));
    assert.equal(telegram.calls.messages.length, 0);
  });
});

describe('Ausstellung dokumentieren', () => {
  test('erst wird zurückgefragt, noch nichts gespeichert', async () => {
    await bot.handleMessage(incoming('War im Lenbachhaus'));

    assert.match(telegram.text, /Kommentar/);
    assert.equal(telegram.calls.documents.length, 0, 'ohne Kommentar keine Notiz');
  });

  test('die erste Notiz übernimmt die eingestellte Nummer', async () => {
    await documentExhibition();

    assert.equal(noteHeaders().length, 1);
    assert.match(noteHeaders()[0].text, /^📝 Notiz gespeichert – Nr\. 26/, 'eine neue Notiz, keine Korrektur');
    assert.match(telegram.text, /26 - MÄR Shifting The Silence/);
  });

  test('die Notiz kommt zusätzlich als .md-Datei für Obsidian', async () => {
    await documentExhibition('War nochmal wo anders');
    const [document] = telegram.calls.documents;

    assert.ok(document, 'es wird eine Datei geschickt');
    assert.match(document.fileOptions.filename, /^27 - MÄR .+\.md$/);
    assert.ok(document.content.startsWith('---'));
    assert.match(document.content, /\*\*Comment:\*\*/);
  });

  test('bessert der Bot den Link nach, steht die Notiz trotzdem nur einmal im Chat', async () => {
    await documentExhibition('Dritte Ausstellung');

    assert.equal(noteHeaders().length, 1, 'nur eine Notiz-Nachricht');
    assert.equal(telegram.calls.documents.length, 1, 'nur eine Datei');
    // Am Ende steht der tiefe Link, nicht die Startseite
    assert.match(telegram.text, /programm\/ausstellungen\/detail/);
    assert.doesNotMatch(telegram.text, /⚠️/);
  });

  test('eine Korrektur aktualisiert dieselbe Notiz und behält die Nummer', async () => {
    const before = db.prepare('SELECT COUNT(*) AS n FROM notes').get().n;
    await bot.handleMessage(incoming('Das Enddatum stimmt nicht'));
    const after = db.prepare('SELECT COUNT(*) AS n FROM notes').get().n;

    assert.equal(after, before, 'es entsteht keine zweite Notiz');
    assert.equal(noteHeaders().length, 1);
    assert.match(noteHeaders()[0].text, /^✏️ Notiz aktualisiert – Nr\. \d+/);
    assert.match(telegram.text, /EndingDate: 2027-02-28/);
  });

  test('nach /neu beginnt die nächste Nachricht eine neue Ausstellung', async () => {
    await bot.handleMessage(incoming('/neu'));
    assert.match(telegram.text, /In welcher Ausstellung/i);

    telegram.reset();
    await bot.handleMessage(incoming('War im Belvedere'));
    assert.match(telegram.text, /Kommentar/, 'es wird wieder von vorn gefragt');
  });
});

describe('Befehle', () => {
  test('/nummer zeigt die nächste Nummer und setzt sie', async () => {
    await bot.handleMessage(incoming('/nummer'));
    assert.match(telegram.text, /Nummer \d+/);

    telegram.reset();
    await bot.handleMessage(incoming('/nummer 90'));
    assert.match(telegram.text, /Nummer 90/);

    telegram.reset();
    await bot.handleMessage(incoming('/nummer'));
    assert.match(telegram.text, /Nummer 90/);
  });

  test('/nummer unterhalb der vergebenen Nummern wird richtiggestellt', async () => {
    await bot.handleMessage(incoming('/nummer 2'));
    assert.match(telegram.text, /Es gibt schon Notizen bis Nummer/);
  });

  test('/liste zeigt die Notizen mit Nummer', async () => {
    await bot.handleMessage(incoming('/liste'));
    assert.match(telegram.text, /26 · Shifting The Silence/);
  });

  test('/notiz holt eine Notiz erneut, /loeschen entfernt sie', async () => {
    await bot.handleMessage(incoming('/notiz 26'));
    assert.match(telegram.text, /26 - MÄR Shifting The Silence/);
    assert.equal(telegram.calls.documents.length, 1);

    telegram.reset();
    await bot.handleMessage(incoming('/loeschen 26'));
    assert.match(telegram.text, /gelöscht/);

    telegram.reset();
    await bot.handleMessage(incoming('/notiz 26'));
    assert.match(telegram.text, /keine Notiz/);
  });

  test('unsinnige Argumente werden freundlich abgefangen', async () => {
    await bot.handleMessage(incoming('/notiz'));
    assert.match(telegram.text, /Welche Nummer/);

    telegram.reset();
    await bot.handleMessage(incoming('/nummer abc'));
    assert.match(telegram.text, /Bitte eine Zahl/);

    telegram.reset();
    await bot.handleMessage(incoming('/quatsch'));
    assert.match(telegram.text, /kenne ich nicht/);
  });

  test('Befehle mit Bot-Namen funktionieren auch', async () => {
    await bot.handleMessage(incoming('/liste@exhibitionbot'));
    assert.doesNotMatch(telegram.text, /kenne ich nicht/);
  });

  test('/export schickt alle Notizen als Datei', async () => {
    await bot.handleMessage(incoming('/export'));
    const [document] = telegram.calls.documents;

    assert.match(document.fileOptions.filename, /^exhibition-bot-\d{4}-\d{2}-\d{2}\.json$/);
    const payload = JSON.parse(document.content);
    assert.ok(payload.notes.length > 0);
    assert.ok(payload.notes[0].fields.title);
  });

  test('/hilfe erklärt die Befehle', async () => {
    await bot.handleMessage(incoming('/hilfe'));
    for (const command of ['/neu', '/liste', '/notiz', '/nummer', '/export']) {
      assert.match(telegram.text, new RegExp(command.replace('/', '\\/')));
    }
  });
});

describe('Gespräch läuft ab', () => {
  test('nach langer Pause zählt die nächste Nachricht als neue Ausstellung', async () => {
    await bot.handleMessage(incoming('/neu'));
    await bot.handleMessage(incoming('War im Mumok'));

    // Die Unterhaltung künstlich altern lassen
    db.prepare("UPDATE conversations SET updated_at = datetime('now', '-2 days') WHERE chat_id = ?").run(CHAT_ID);

    telegram.reset();
    await bot.handleMessage(incoming('War im Leopold Museum'));
    assert.match(telegram.text, /Kommentar/, 'es wird wieder von vorn recherchiert');
  });
});
