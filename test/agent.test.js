import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { useTempDataDir } from './helpers.js';

useTempDataDir();

const { withCacheControl, trimSearchResults } = await import('../src/agent.js');

describe('Cache-Punkt im Verlauf', () => {
  const cached = (messages) => {
    const last = withCacheControl(messages).at(-1);
    const content = typeof last.content === 'string' ? [] : last.content;
    return content.filter((block) => block.cache_control).map((block) => block.type);
  };

  test('sitzt am letzten Text-Block', () => {
    assert.deepEqual(cached([{ role: 'user', content: 'Hallo' }]), ['text']);
    assert.deepEqual(
      cached([{ role: 'user', content: 'x' }, { role: 'assistant', content: [{ type: 'text', text: 'Hi' }] }]),
      ['text']
    );
  });

  test('sitzt auch an einem tool_result', () => {
    const messages = [
      { role: 'assistant', content: [{ type: 'tool_use', id: 't', name: 'save_note', input: {} }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'ok' }] },
    ];
    assert.deepEqual(cached(messages), ['tool_result']);
  });

  test('wird nicht an Blöcke gehängt, an denen die API ihn zurückweist', () => {
    const messages = [
      { role: 'user', content: 'x' },
      { role: 'assistant', content: [{ type: 'tool_use', id: 't', name: 'save_note', input: {} }] },
    ];
    assert.deepEqual(cached(messages), []);
  });

  test('lässt den gespeicherten Verlauf unangetastet', () => {
    const messages = [{ role: 'user', content: 'Hallo' }];
    const before = JSON.stringify(messages);
    withCacheControl(messages);
    assert.equal(JSON.stringify(messages), before);
  });

  test('kommt mit leerem Verlauf klar', () => {
    assert.deepEqual(withCacheControl([]), []);
  });
});

describe('Suchergebnisse aus dem Verlauf werfen', () => {
  test('Such-Blöcke fliegen raus, der Text bleibt', () => {
    const messages = [
      {
        role: 'assistant',
        content: [
          { type: 'server_tool_use', id: 's', name: 'web_search', input: { query: 'x' } },
          { type: 'web_search_tool_result', tool_use_id: 's', content: [] },
          { type: 'text', text: 'Gefunden!' },
        ],
      },
    ];
    trimSearchResults(messages);

    assert.deepEqual(messages[0].content, [{ type: 'text', text: 'Gefunden!' }]);
  });

  test('bestand die Nachricht nur aus Suche, bleibt ein Platzhalter statt einer leeren Nachricht', () => {
    const messages = [
      {
        role: 'assistant',
        content: [
          { type: 'text', text: '  ' },
          { type: 'server_tool_use', id: 's', name: 'web_search', input: {} },
        ],
      },
    ];
    trimSearchResults(messages);

    assert.equal(messages[0].content.length, 1);
    assert.equal(messages[0].content[0].type, 'text');
    assert.ok(messages[0].content[0].text.trim().length > 0);
  });

  test('der save_note-Aufruf und sein Ergebnis bleiben erhalten', () => {
    const messages = [
      {
        role: 'assistant',
        content: [
          { type: 'server_tool_use', id: 's', name: 'web_search', input: {} },
          { type: 'tool_use', id: 't', name: 'save_note', input: { title: 'x' } },
        ],
      },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'ok' }] },
    ];
    trimSearchResults(messages);

    assert.deepEqual(messages[0].content.map((b) => b.type), ['tool_use']);
    assert.deepEqual(messages[1].content.map((b) => b.type), ['tool_result']);
  });

  test('Nachrichten des Nutzers werden nicht angefasst', () => {
    const messages = [{ role: 'user', content: 'Ich war im Lenbachhaus' }];
    trimSearchResults(messages);
    assert.equal(messages[0].content, 'Ich war im Lenbachhaus');
  });
});
