import Anthropic from '@anthropic-ai/sdk';
import { today } from './clock.js';

const MODEL = process.env.MODEL || 'claude-sonnet-5';
const MOCK = process.env.MOCK_AGENT === '1';
const MAX_ROUNDS = 4;

// Blöcke der Web-Suche: nützlich während der Recherche, danach nur noch Ballast
const SEARCH_BLOCKS = new Set(['server_tool_use', 'web_search_tool_result']);

function systemPrompt() {
  return `Du bist ein persönlicher Assistent, der Ausstellungsbesuche als Obsidian-Notizen dokumentiert. Dein Nutzer erzählt dir, in welcher Ausstellung er war.

Dein Ablauf:
1. Recherchiere die Ausstellung gründlich mit der Web-Suche (offizielle Museums-Website bevorzugen): exakter Titel, Museum mit Stadt, Laufzeit (Eröffnungs- und Enddatum), vollständige Künstlerliste, Kurator:innen, offizieller Ausstellungstext, Link zur offiziellen Ausstellungsseite.
2. Übernimm den Ausstellungstext möglichst wortgetreu von der Museums-Website (in der Originalsprache der Website). Kürze nur, wenn er extrem lang ist.
3. Frage den Nutzer nach seinem persönlichen Kommentar (Comment) und optional nach "Inspiration for own work", falls er das noch nicht mitgeteilt hat. Frage auch nach dem Besuchsdatum, falls unklar. Stelle alle Rückfragen in EINER Nachricht, fasse dabei kurz zusammen, was du gefunden hast.
4. Sobald alles beisammen ist, speichere die Notiz mit dem Tool save_note. Nach dem Speichern bestätigst du dem Nutzer kurz, dass die Notiz bereitsteht.

Korrekturen:
- Wenn der Nutzer nach dem Speichern etwas richtigstellt oder ergänzt, rufe save_note einfach erneut auf – mit ALLEN Feldern, die korrigierten in der neuen Fassung, die übrigen unverändert. Die bestehende Notiz wird dann aktualisiert; sie behält ihre Nummer, und es entsteht keine zweite Notiz.
- Lege niemals absichtlich eine zweite Notiz für dieselbe Ausstellung an.

Regeln für die Felder:
- Datumsfelder im Format YYYY-MM-DD. Wenn ein Datum nicht auffindbar ist, lass das Feld leer.
- artists: vollständige Liste aller Künstler:innen. Bei Einzelausstellungen entsprechend eine Person.
- discipline: nur füllen, wenn der Nutzer es angibt oder es eindeutig ist (z.B. Fotografie, Malerei, Video).
- exhibition_text: der offizielle Text, keine eigene Zusammenfassung, außer es gibt keinen auffindbaren Text.
- comment und inspiration: exakt die Worte des Nutzers, nur behutsam Tippfehler korrigieren.
- Wenn du etwas nicht findest, sag es ehrlich (z.B. "Eröffnungsdatum nicht gefunden") statt zu raten.

Antworte auf Deutsch, kurz und freundlich. Heute ist ${today()}.`;
}

const SAVE_NOTE_TOOL = {
  name: 'save_note',
  description:
    'Speichert die fertige Ausstellungs-Notiz. Erst aufrufen, wenn die Recherche abgeschlossen ist und der Nutzer seinen Kommentar gegeben hat. Ein erneuter Aufruf in derselben Unterhaltung aktualisiert die bestehende Notiz, statt eine neue anzulegen – dafür immer alle Felder mitgeben.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Titel der Ausstellung' },
      museum: { type: 'string', description: 'Museum mit Stadt, z.B. "Lenbachhaus, München"' },
      visit_date: { type: 'string', description: 'Besuchsdatum YYYY-MM-DD' },
      opening_date: { type: 'string', description: 'Eröffnungsdatum YYYY-MM-DD, leer wenn unbekannt' },
      ending_date: { type: 'string', description: 'Enddatum YYYY-MM-DD, leer wenn unbekannt' },
      discipline: { type: 'array', items: { type: 'string' }, description: 'Disziplinen, leer wenn unbekannt' },
      artists: { type: 'array', items: { type: 'string' }, description: 'Alle Künstler:innen' },
      link: { type: 'string', description: 'URL der offiziellen Ausstellungsseite' },
      exhibition_text: { type: 'string', description: 'Offizieller Ausstellungstext' },
      curator: { type: 'string', description: 'Kurator:innen' },
      comment: { type: 'string', description: 'Persönlicher Kommentar des Nutzers' },
      inspiration: { type: 'string', description: 'Inspiration for own work, leer wenn nicht angegeben' },
    },
    required: ['title', 'museum', 'visit_date', 'artists', 'exhibition_text', 'comment'],
  },
};

const client = MOCK ? null : new Anthropic();

/**
 * Setzt einen Cache-Punkt an das Ende des Verlaufs. Der gesamte Text davor
 * wird von der API zwischengespeichert, sodass jede weitere Nachricht in
 * derselben Unterhaltung deutlich günstiger und schneller ist.
 * Arbeitet auf einer Kopie – der gespeicherte Verlauf bleibt unverändert.
 */
export function withCacheControl(messages) {
  if (messages.length === 0) return messages;
  const out = messages.slice();
  const last = out[out.length - 1];
  const content =
    typeof last.content === 'string'
      ? [{ type: 'text', text: last.content }]
      : last.content.slice();

  const lastBlock = content[content.length - 1];
  if (!lastBlock || (lastBlock.type !== 'text' && lastBlock.type !== 'tool_result')) return out;

  content[content.length - 1] = { ...lastBlock, cache_control: { type: 'ephemeral' } };
  out[out.length - 1] = { ...last, content };
  return out;
}

/**
 * Entfernt die Rohergebnisse der Web-Suche aus dem Verlauf. Wird aufgerufen,
 * sobald die Notiz steht: Ab da zählt nur noch, was der Bot daraus gemacht
 * hat, und der Verlauf bleibt für Rückfragen schlank.
 */
function trimSearchResults(messages) {
  for (const message of messages) {
    if (message.role !== 'assistant' || typeof message.content === 'string') continue;
    if (!message.content.some((block) => SEARCH_BLOCKS.has(block.type))) continue;

    const kept = message.content.filter(
      (block) =>
        !SEARCH_BLOCKS.has(block.type) &&
        !(block.type === 'text' && !String(block.text || '').trim())
    );
    message.content = kept.length
      ? kept
      : [{ type: 'text', text: '(Recherche-Ergebnisse ausgeblendet)' }];
  }
}

/**
 * Führt einen Agenten-Zug aus – inklusive der Runde nach dem Speichern, damit
 * der Bot den Vorgang noch selbst abschließt.
 *
 * @param {Array} messages       Verlauf im Anthropic-Format, wird ergänzt.
 * @param {Function} onEvent     SSE-Events: {type:'text'|'status'|'note', …}
 * @param {Function} onSaveNote  Speichert die Notiz, liefert {id, nr, filename, markdown, updated}.
 */
export async function runAgent(messages, { onEvent, onSaveNote }) {
  if (MOCK) return runMockAgent(messages, { onEvent, onSaveNote });

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 8000,
      system: systemPrompt(),
      messages: withCacheControl(messages),
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 8 }, SAVE_NOTE_TOOL],
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

    onEvent({ type: 'note', ...result });
    trimSearchResults(messages);
    messages.push({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: result.updated
            ? `Notiz "${result.filename}" wurde aktualisiert. Bestätige das dem Nutzer in einem Satz.`
            : `Notiz gespeichert als "${result.filename}". Bestätige das dem Nutzer in einem Satz und weise darauf hin, dass er sie mit den Buttons kopieren kann.`,
        },
      ],
    });
  }
}

// ---- Simulierter Agent für Tests ohne API-Key (MOCK_AGENT=1) -------------

const MOCK_FIELDS = {
  title: 'Shifting The Silence',
  museum: 'Lenbachhaus, München',
  visit_date: '2026-03-15',
  opening_date: '',
  ending_date: '2027-01-01',
  discipline: [],
  artists: ['Etel Adnan', 'Saâdane Afif', 'Nevin Aladağ', 'Jenny Holzer', 'Dan Flavin', 'Jiří Kovanda'],
  link: 'https://www.lenbachhaus.de/programm/ausstellungen/detail/shifting-the-silence',
  exhibition_text:
    '"Shifting the Silence" ist der Titel des letzten Buches von Etel Adnan, erschienen 2021. ' +
    'Die deutsche Übersetzung "Die Stille verschieben" erschien posthum 2022.',
  curator: 'Eva Huttenlauch und Matthias Mühling',
  comment:
    'Das Spiel mit Materialien war sehr spannend, vor allem waren es Positionen die mir bis dato nicht bekannt waren.',
  inspiration: '',
};

async function streamMockText(text, onEvent) {
  for (const chunk of text.match(/.{1,40}/gs)) {
    onEvent({ type: 'text', text: chunk });
    await new Promise((r) => setTimeout(r, 25));
  }
}

async function runMockAgent(messages, { onEvent, onSaveNote }) {
  const assistantTurns = messages.filter((m) => m.role === 'assistant').length;
  await new Promise((r) => setTimeout(r, 300));

  if (assistantTurns === 0) {
    onEvent({ type: 'status', text: 'Suche: Shifting the Silence Lenbachhaus' });
    await new Promise((r) => setTimeout(r, 400));
    const text =
      'Ich habe die Ausstellung gefunden: "Shifting the Silence" im Lenbachhaus, München, ' +
      'kuratiert von Eva Huttenlauch und Matthias Mühling, mit 40 Künstler:innen (u.a. Etel Adnan, ' +
      'Jenny Holzer, Dan Flavin). Laufzeit bis 01.01.2027.\n\n' +
      'Bevor ich die Notiz erstelle: Was ist dein persönlicher Kommentar zur Ausstellung? ' +
      'Und gibt es eine Inspiration für deine eigene Arbeit? An welchem Tag warst du dort?';
    await streamMockText(text, onEvent);
    messages.push({
      role: 'assistant',
      content: [
        { type: 'server_tool_use', id: 'srvtoolu_mock', name: 'web_search', input: { query: 'mock' } },
        { type: 'text', text },
      ],
    });
    return;
  }

  // Jede weitere Nachricht speichert – beim zweiten Mal als Korrektur der bestehenden Notiz
  const fields = { ...MOCK_FIELDS };
  if (assistantTurns > 1) fields.ending_date = '2027-02-28';

  messages.push({
    role: 'assistant',
    content: [{ type: 'tool_use', id: `toolu_mock_${assistantTurns}`, name: 'save_note', input: fields }],
  });
  onEvent({ type: 'status', text: 'Notiz wird gespeichert …' });
  const result = await onSaveNote(fields);
  onEvent({ type: 'note', ...result });
  trimSearchResults(messages);
  messages.push({
    role: 'user',
    content: [
      { type: 'tool_result', tool_use_id: `toolu_mock_${assistantTurns}`, content: `gespeichert: ${result.filename}` },
    ],
  });

  const closing = result.updated
    ? `Ich habe die Notiz aktualisiert – Nummer ${result.nr} bleibt.`
    : 'Alles klar, die Notiz steht – du kannst sie jetzt kopieren.';
  await streamMockText(closing, onEvent);
  messages.push({ role: 'assistant', content: [{ type: 'text', text: closing }] });
}
