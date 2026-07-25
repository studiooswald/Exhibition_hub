import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';
import { systemPrompt, SAVE_NOTE_TOOL, WEB_SEARCH_TOOL, saveFeedback } from './prompt.js';
import { runMockAgent } from './mock-agent.js';

// Nach dem Speichern läuft noch eine Runde, damit der Bot den Vorgang selbst
// abschließt. Mehr als ein paar Runden braucht es nie – die Grenze schützt vor
// einer Schleife, falls das Speichern wiederholt scheitert.
const MAX_ROUNDS = 4;

// Blöcke der Web-Suche: während der Recherche nötig, danach nur noch Ballast
const SEARCH_BLOCKS = new Set(['server_tool_use', 'web_search_tool_result']);

const client = config.mock ? null : new Anthropic({ apiKey: config.anthropicApiKey });

/**
 * Setzt einen Cache-Punkt ans Ende des Verlaufs: Alles davor liegt bei der API
 * zwischengespeichert, sodass jede weitere Nachricht derselben Unterhaltung
 * deutlich günstiger und schneller wird.
 * Arbeitet auf einer Kopie – der gespeicherte Verlauf bleibt unangetastet.
 */
export function withCacheControl(messages) {
  if (messages.length === 0) return messages;

  const out = messages.slice();
  const last = out[out.length - 1];
  const content =
    typeof last.content === 'string' ? [{ type: 'text', text: last.content }] : last.content.slice();

  const lastBlock = content[content.length - 1];
  // Nur an Blöcken, an denen die API einen Cache-Punkt erlaubt
  if (!lastBlock || (lastBlock.type !== 'text' && lastBlock.type !== 'tool_result')) return out;

  content[content.length - 1] = { ...lastBlock, cache_control: { type: 'ephemeral' } };
  out[out.length - 1] = { ...last, content };
  return out;
}

/**
 * Wirft die Rohergebnisse der Web-Suche aus dem Verlauf. Sobald die Notiz
 * steht, zählt nur noch, was der Bot daraus gemacht hat.
 */
export function trimSearchResults(messages) {
  for (const message of messages) {
    if (message.role !== 'assistant' || typeof message.content === 'string') continue;
    if (!message.content.some((block) => SEARCH_BLOCKS.has(block.type))) continue;

    const kept = message.content.filter(
      (block) =>
        !SEARCH_BLOCKS.has(block.type) &&
        !(block.type === 'text' && !String(block.text || '').trim())
    );
    // Leere Nachrichten weist die API zurück – lieber ein Platzhalter
    message.content = kept.length
      ? kept
      : [{ type: 'text', text: '(Recherche-Ergebnisse ausgeblendet)' }];
  }
}

/**
 * Führt einen Zug des Bots aus, inklusive der Runde nach dem Speichern.
 *
 * @param {Array} messages       Verlauf im Anthropic-Format, wird ergänzt.
 * @param {Function} onEvent     Ereignisse fürs Frontend: {type:'text'|'status'|'note', …}
 * @param {Function} onSaveNote  Speichert die Notiz, liefert {filename, updated, linkWarning, …}.
 */
export async function runAgent(messages, { onEvent, onSaveNote }) {
  if (config.mock) return runMockAgent(messages, { onEvent, onSaveNote, trimSearchResults });

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const stream = client.messages.stream({
      model: config.model,
      max_tokens: 8000,
      system: systemPrompt(),
      messages: withCacheControl(messages),
      tools: [WEB_SEARCH_TOOL, SAVE_NOTE_TOOL],
    });

    stream.on('text', (delta) => onEvent({ type: 'text', text: delta }));
    stream.on('contentBlock', (block) => {
      if (block.type === 'server_tool_use' && block.name === 'web_search') {
        const query = block.input?.query;
        onEvent({ type: 'status', text: query ? `Suche: ${query}` : 'Recherchiere im Web …' });
      }
    });

    const finalMessage = await stream.finalMessage();
    messages.push({ role: 'assistant', content: finalMessage.content });

    const toolUse = finalMessage.content.find(
      (block) => block.type === 'tool_use' && block.name === 'save_note'
    );
    if (!toolUse) return;

    onEvent({ type: 'status', text: 'Notiz wird gespeichert …' });

    let result;
    try {
      result = await onSaveNote(toolUse.input);
    } catch (err) {
      console.error('Notiz konnte nicht gespeichert werden:', err);
      messages.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: toolUse.id,
            is_error: true,
            content: 'Die Notiz konnte nicht gespeichert werden. Sag dem Nutzer kurz Bescheid.',
          },
        ],
      });
      continue;
    }

    onEvent({ type: 'note', note: result.note, linkWarning: result.linkWarning });
    trimSearchResults(messages);
    messages.push({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: saveFeedback({
            filename: result.note.filename,
            updated: result.updated,
            linkWarning: result.linkWarning,
          }),
        },
      ],
    });
  }
}
