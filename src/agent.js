import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.MODEL || 'claude-sonnet-5';
const MOCK = process.env.MOCK_AGENT === '1';

const SYSTEM_PROMPT = `Du bist ein persönlicher Assistent, der Ausstellungsbesuche als Obsidian-Notizen dokumentiert. Dein Nutzer erzählt dir, in welcher Ausstellung er war.

Dein Ablauf:
1. Recherchiere die Ausstellung gründlich mit der Web-Suche (offizielle Museums-Website bevorzugen): exakter Titel, Museum mit Stadt, Laufzeit (Eröffnungs- und Enddatum), vollständige Künstlerliste, Kurator:innen, offizieller Ausstellungstext, Link zur offiziellen Ausstellungsseite.
2. Übernimm den Ausstellungstext möglichst wortgetreu von der Museums-Website (in der Originalsprache der Website). Kürze nur, wenn er extrem lang ist.
3. Frage den Nutzer nach seinem persönlichen Kommentar (Comment) und optional nach "Inspiration for own work", falls er das noch nicht mitgeteilt hat. Frage auch nach dem Besuchsdatum, falls unklar. Stelle alle Rückfragen in EINER Nachricht, fasse dabei kurz zusammen, was du gefunden hast.
4. Sobald alles beisammen ist, speichere die Notiz mit dem Tool save_note. Rufe save_note genau einmal auf, erst wenn Kommentar und Besuchsdatum vorliegen.

Regeln für die Felder:
- Datumsfelder im Format YYYY-MM-DD. Wenn ein Datum nicht auffindbar ist, lass das Feld leer.
- artists: vollständige Liste aller Künstler:innen. Bei Einzelausstellungen entsprechend eine Person.
- discipline: nur füllen, wenn der Nutzer es angibt oder es eindeutig ist (z.B. Fotografie, Malerei, Video).
- exhibition_text: der offizielle Text, keine eigene Zusammenfassung, außer es gibt keinen auffindbaren Text.
- comment und inspiration: exakt die Worte des Nutzers, nur behutsam Tippfehler korrigieren.
- Wenn du etwas nicht findest, sag es ehrlich (z.B. "Eröffnungsdatum nicht gefunden") statt zu raten.

Antworte auf Deutsch, kurz und freundlich. Heute ist ${new Date().toISOString().slice(0, 10)}.`;

const SAVE_NOTE_TOOL = {
  name: 'save_note',
  description:
    'Speichert die fertige Ausstellungs-Notiz. Erst aufrufen, wenn Recherche abgeschlossen ist und der Nutzer seinen Kommentar gegeben hat.',
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
 * Führt einen Agenten-Turn aus.
 * @param {Array} messages - Bisheriger Verlauf im Anthropic-Format (inkl. neuer Nutzernachricht).
 * @param {Function} onEvent - Callback für SSE-Events: {type:'text', text} | {type:'status', text}
 * @returns {{assistantContent: Array, noteFields: object|null}}
 */
export async function runAgent(messages, onEvent) {
  if (MOCK) return runMockAgent(messages, onEvent);

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    messages,
    tools: [
      { type: 'web_search_20250305', name: 'web_search', max_uses: 8 },
      SAVE_NOTE_TOOL,
    ],
  });

  stream.on('text', (delta) => onEvent({ type: 'text', text: delta }));
  stream.on('contentBlock', (block) => {
    if (block.type === 'server_tool_use' && block.name === 'web_search') {
      const query = block.input?.query;
      onEvent({ type: 'status', text: query ? `Suche: ${query}` : 'Recherchiere im Web …' });
    }
  });

  const finalMessage = await stream.finalMessage();
  const toolUse = finalMessage.content.find(
    (block) => block.type === 'tool_use' && block.name === 'save_note'
  );

  return {
    assistantContent: finalMessage.content,
    noteFields: toolUse ? { toolUseId: toolUse.id, ...toolUse.input } : null,
  };
}

// Simulierter Agent für Tests ohne API-Key (MOCK_AGENT=1)
async function runMockAgent(messages, onEvent) {
  const assistantTurns = messages.filter((m) => m.role === 'assistant').length;
  await new Promise((r) => setTimeout(r, 300));

  if (assistantTurns === 0) {
    onEvent({ type: 'status', text: 'Suche: Shifting the Silence Lenbachhaus' });
    await new Promise((r) => setTimeout(r, 500));
    const text =
      'Ich habe die Ausstellung gefunden: "Shifting the Silence" im Lenbachhaus, München, ' +
      'kuratiert von Eva Huttenlauch und Matthias Mühling, mit 40 Künstler:innen (u.a. Etel Adnan, ' +
      'Jenny Holzer, Dan Flavin). Laufzeit bis 01.01.2027.\n\n' +
      'Bevor ich die Notiz erstelle: Was ist dein persönlicher Kommentar zur Ausstellung? ' +
      'Und gibt es eine Inspiration für deine eigene Arbeit? An welchem Tag warst du dort?';
    for (const chunk of text.match(/.{1,40}/gs)) {
      onEvent({ type: 'text', text: chunk });
      await new Promise((r) => setTimeout(r, 30));
    }
    return { assistantContent: [{ type: 'text', text }], noteFields: null };
  }

  const text = 'Alles klar, ich habe die Notiz erstellt – du kannst sie jetzt kopieren.';
  onEvent({ type: 'text', text });
  const noteFields = {
    toolUseId: 'mock_tool_use_1',
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
  return { assistantContent: [{ type: 'text', text }], noteFields };
}
