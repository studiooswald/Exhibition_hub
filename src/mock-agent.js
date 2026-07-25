// Simulierter Bot für Tests und zum Ausprobieren ohne API-Key (MOCK_AGENT=1).
// Er spielt den echten Ablauf nach: recherchieren, nachfragen, speichern,
// einen bemängelten Link nachbessern und Korrekturen einarbeiten.

const BASE_FIELDS = {
  title: 'Shifting The Silence',
  museum: 'Lenbachhaus, München',
  visit_date: '2026-03-15',
  opening_date: '',
  ending_date: '2027-01-01',
  discipline: [],
  artists: ['Etel Adnan', 'Saâdane Afif', 'Nevin Aladağ', 'Jenny Holzer', 'Dan Flavin', 'Jiří Kovanda'],
  link: 'https://www.lenbachhaus.de/',
  exhibition_text:
    '"Shifting the Silence" ist der Titel des letzten Buches von Etel Adnan, erschienen 2021. ' +
    'Die deutsche Übersetzung "Die Stille verschieben" erschien posthum 2022.',
  curator: 'Eva Huttenlauch und Matthias Mühling',
  comment:
    'Das Spiel mit Materialien war sehr spannend, vor allem waren es Positionen die mir bis dato nicht bekannt waren.',
  inspiration: '',
};

const DEEP_LINK =
  'https://www.lenbachhaus.de/programm/ausstellungen/detail/shifting-the-silence';

const QUESTIONS =
  'Ich habe die Ausstellung gefunden: "Shifting the Silence" im Lenbachhaus, München, ' +
  'kuratiert von Eva Huttenlauch und Matthias Mühling, mit 40 Künstler:innen (u.a. Etel Adnan, ' +
  'Jenny Holzer, Dan Flavin). Laufzeit bis 01.01.2027.\n\n' +
  'Bevor ich die Notiz erstelle: Was ist dein persönlicher Kommentar zur Ausstellung? ' +
  'Und gibt es eine Inspiration für deine eigene Arbeit? An welchem Tag warst du dort?';

async function streamText(text, onEvent) {
  for (const chunk of text.match(/.{1,40}/gs) || []) {
    onEvent({ type: 'text', text: chunk });
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
}

export async function runMockAgent(messages, { onEvent, onSaveNote, trimSearchResults }) {
  const assistantTurns = messages.filter((m) => m.role === 'assistant').length;
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Erster Zug: recherchieren und in einer Nachricht alles Offene fragen
  if (assistantTurns === 0) {
    onEvent({ type: 'status', text: 'Suche: Shifting the Silence Lenbachhaus' });
    await new Promise((resolve) => setTimeout(resolve, 200));
    await streamText(QUESTIONS, onEvent);
    messages.push({
      role: 'assistant',
      content: [
        { type: 'server_tool_use', id: 'srvtoolu_mock', name: 'web_search', input: { query: 'mock' } },
        { type: 'text', text: QUESTIONS },
      ],
    });
    return;
  }

  const fields = { ...BASE_FIELDS };
  // Ab dem dritten Zug: der Nutzer hat etwas richtiggestellt
  if (assistantTurns > 1) fields.ending_date = '2027-02-28';

  let round = 0;
  let updatedThisRun = null;
  let result = await mockSave(fields, ++round);

  // Der Link zeigte nur auf die Startseite – nachbessern, wie es der echte Bot tut
  if (result.linkWarning) {
    onEvent({ type: 'status', text: 'Suche: offizielle Ausstellungsseite' });
    result = await mockSave({ ...fields, link: DEEP_LINK }, ++round);
  }

  const closing = updatedThisRun
    ? `Ich habe die Notiz aktualisiert – Nummer ${result.note.nr} bleibt.`
    : 'Alles klar, die Notiz steht – du kannst sie jetzt kopieren.';
  await streamText(closing, onEvent);
  messages.push({ role: 'assistant', content: [{ type: 'text', text: closing }] });

  async function mockSave(saveFields, index) {
    const toolUseId = `toolu_mock_${assistantTurns}_${index}`;
    messages.push({
      role: 'assistant',
      content: [{ type: 'tool_use', id: toolUseId, name: 'save_note', input: saveFields }],
    });
    onEvent({ type: 'status', text: 'Notiz wird gespeichert …' });

    const saved = await onSaveNote(saveFields);
    updatedThisRun = updatedThisRun ?? saved.updated;
    onEvent({ type: 'note', note: saved.note, updated: updatedThisRun, linkWarning: saved.linkWarning });
    trimSearchResults(messages);
    messages.push({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolUseId,
          content: saved.linkWarning
            ? `gespeichert: ${saved.note.filename} – ${saved.linkWarning}`
            : `gespeichert: ${saved.note.filename}`,
        },
      ],
    });
    return saved;
  }
}
