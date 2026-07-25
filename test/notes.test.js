import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { useTempDataDir, startTestServer, lastNote } from './helpers.js';

useTempDataDir('26');

let client;
before(async () => {
  client = await startTestServer();
  const res = await client.post('/api/login', { password: 'test-passwort' });
  assert.equal(res.status, 200);
});
after(() => client.close());

describe('Notizen', () => {
  test('die erste Notiz übernimmt START_NR statt bei 1 anzufangen', async () => {
    await client.chat('a', 'War im Lenbachhaus');
    const note = lastNote(await client.chat('a', 'Kommentar: sehr gut, am 15.3.2026'));

    assert.equal(note.note.nr, 26);
    assert.equal(note.note.filename, '26 - MÄR Shifting The Silence');
  });

  test('eine Korrektur aktualisiert die Notiz, statt eine zweite anzulegen', async () => {
    const before = await client.json('GET', '/api/notes');
    const note = lastNote(await client.chat('a', 'Das Enddatum stimmt nicht'));
    const after = await client.json('GET', '/api/notes');

    assert.equal(after.length, before.length, 'es darf keine zweite Notiz entstehen');
    assert.equal(note.note.nr, 26, 'die Nummer bleibt erhalten');
    assert.match(note.note.markdown, /EndingDate: 2027-02-28/);
  });

  test('die nächste Ausstellung bekommt die nächste Nummer', async () => {
    await client.chat('b', 'War im Haus der Kunst');
    const note = lastNote(await client.chat('b', 'Kommentar dazu'));

    assert.equal(note.note.nr, 27);
  });

  test('die Notiz trägt die Obsidian-Properties im erwarteten Format', async () => {
    const [first] = await client.json('GET', '/api/notes');
    const lines = first.markdown.split('\n');

    assert.equal(lines[0], '---');
    assert.match(first.markdown, /^Museum: "Lenbachhaus, München"$/m);
    assert.match(first.markdown, /^VisitDate: 2026-03-15$/m);
    assert.match(first.markdown, /^Artists:\n {2}- Etel Adnan$/m);
    for (const heading of ['Exhibition Text', 'Curator', 'Comment', 'Inspiration for own work']) {
      assert.match(first.markdown, new RegExp(`^\\*\\*${heading}:\\*\\*$`, 'm'));
    }
  });

  test('Notizen lassen sich löschen', async () => {
    // Eigene Notiz anlegen, damit der Test keinem anderen die Grundlage wegnimmt
    await client.chat('zum-loeschen', 'War irgendwo');
    const note = lastNote(await client.chat('zum-loeschen', 'Kommentar dazu')).note;
    const before = await client.json('GET', '/api/notes');

    assert.equal((await client.delete(`/api/notes/${note.id}`)).status, 200);

    const after = await client.json('GET', '/api/notes');
    assert.equal(after.length, before.length - 1);
    assert.ok(!after.some((n) => n.id === note.id));
    assert.equal((await client.delete(`/api/notes/${note.id}`)).status, 404, 'zweimal löschen ist 404');
  });

  test('der Export enthält Felder und fertiges Markdown', async () => {
    const res = await client.get('/api/export');
    assert.match(res.headers.get('content-disposition'), /attachment; filename="exhibition-hub-/);

    const { notes } = await res.json();
    assert.ok(notes.length > 0);
    assert.ok(notes[0].fields.title);
    assert.ok(notes[0].markdown.startsWith('---'));
  });
});

describe('Unterhaltung', () => {
  test('der Verlauf lässt sich nach einem Reload wiederherstellen', async () => {
    const { messages, note } = await client.json('GET', '/api/conversations/b');

    assert.ok(messages.length >= 4, 'Fragen und Antworten sind erhalten');
    assert.equal(messages[0].role, 'user');
    assert.ok(note, 'die Notiz der Unterhaltung kommt mit');
  });

  test('unbekannte Unterhaltungen liefern einen leeren Verlauf statt eines Fehlers', async () => {
    const { messages, note } = await client.json('GET', '/api/conversations/gibt-es-nicht');

    assert.deepEqual(messages, []);
    assert.equal(note, null);
  });

  test('die Rohergebnisse der Web-Suche fliegen nach dem Speichern aus dem Verlauf', async () => {
    const { getConversation } = await import('../src/db.js');
    const types = new Set(
      getConversation('b')
        .filter((message) => Array.isArray(message.content))
        .flatMap((message) => message.content.map((block) => block.type))
    );

    assert.ok(!types.has('web_search_tool_result'));
    assert.ok(!types.has('server_tool_use'));
  });
});
