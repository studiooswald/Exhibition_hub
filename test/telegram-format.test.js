import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { useTempDataDir } from './helpers.js';

useTempDataDir();

const { escapeHtml, splitText, noteMessages, TELEGRAM_LIMIT } = await import(
  '../src/telegram-format.js'
);

describe('HTML maskieren', () => {
  test('die drei kritischen Zeichen werden ersetzt', () => {
    assert.equal(escapeHtml('a & b < c > d'), 'a &amp; b &lt; c &gt; d');
  });

  test('Museumstexte mit Anführungszeichen und Bindestrichen bleiben unangetastet', () => {
    const text = '„Shifting the Silence" – Etel Adnan (2021), 100 % Video-Arbeit *mit* _Sound_';
    assert.equal(escapeHtml(text), text);
  });
});

describe('Lange Texte aufteilen', () => {
  test('kurzer Text bleibt ein Stück', () => {
    assert.deepEqual(splitText('kurz'), ['kurz']);
  });

  test('wird an Zeilengrenzen geteilt, nicht mitten im Wort', () => {
    const text = Array.from({ length: 500 }, (_, i) => `Zeile ${i} mit etwas Text dahinter`).join('\n');
    const chunks = splitText(text, 1000);

    assert.ok(chunks.length > 1);
    for (const chunk of chunks) assert.ok(chunk.length <= 1000);
    assert.equal(chunks.join('\n'), text, 'nichts geht verloren');
  });

  test('eine einzelne überlange Zeile wird hart geteilt', () => {
    const chunks = splitText('x'.repeat(2500), 1000);

    assert.equal(chunks.length, 3);
    assert.equal(chunks.join('').length, 2500);
  });
});

describe('Notiz-Nachrichten', () => {
  const note = {
    id: 1,
    nr: 26,
    title: 'Shifting The Silence',
    filename: '26 - MÄR Shifting The Silence',
    markdown: '---\nMuseum: Lenbachhaus\n---\n\n**Comment:**\nWar gut & spannend <wirklich>\n',
    link: 'https://www.lenbachhaus.de/programm/detail',
  };

  test('Kopfzeile, Dateiname und Inhalt kommen getrennt', () => {
    const [header, ...rest] = noteMessages({ note, updated: false, linkWarning: null });

    assert.match(header.text, /Notiz gespeichert – Nr\. 26/);
    assert.match(header.text, /<pre>26 - MÄR Shifting The Silence<\/pre>/);
    assert.match(header.text, /lenbachhaus\.de/);
    assert.ok(rest.length >= 1);
  });

  test('der Inhalt steht in einem kopierbaren Block und ist maskiert', () => {
    const [, body] = noteMessages({ note, updated: false, linkWarning: null });

    assert.match(body.text, /^<pre>/);
    assert.match(body.text, /<\/pre>$/);
    assert.match(body.text, /War gut &amp; spannend &lt;wirklich&gt;/);
    assert.equal(body.parse_mode, 'HTML');
  });

  test('eine Korrektur wird als solche angekündigt', () => {
    const [header] = noteMessages({ note, updated: true, linkWarning: null });
    assert.match(header.text, /Notiz aktualisiert/);
  });

  test('ein bemängelter Link steht als Warnung statt als Link', () => {
    const [header] = noteMessages({ note, updated: false, linkWarning: 'Zeigt nur auf die Startseite.' });

    assert.match(header.text, /⚠️ Zeigt nur auf die Startseite\./);
    assert.doesNotMatch(header.text, /🔗/);
  });

  test('eine sehr lange Notiz passt in mehrere Nachrichten', () => {
    const lang = { ...note, markdown: 'Zeile mit Text\n'.repeat(2000) };
    const messages = noteMessages({ note: lang, updated: false, linkWarning: null });

    assert.ok(messages.length > 2);
    for (const message of messages) {
      assert.ok(message.text.length <= TELEGRAM_LIMIT, 'keine Nachricht überschreitet das Limit');
    }
  });
});
