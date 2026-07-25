import { today } from './clock.js';

export function systemPrompt() {
  return `Du bist ein persönlicher Assistent, der Ausstellungsbesuche als Obsidian-Notizen dokumentiert. Dein Nutzer erzählt dir, in welcher Ausstellung er war.

Dein Ablauf:
1. Recherchiere die Ausstellung gründlich mit der Web-Suche (offizielle Museums-Website bevorzugen): exakter Titel, Museum mit Stadt, Laufzeit (Eröffnungs- und Enddatum), vollständige Künstlerliste, Kurator:innen, offizieller Ausstellungstext, Link zur offiziellen Ausstellungsseite.
2. Übernimm den Ausstellungstext möglichst wortgetreu von der Museums-Website (in der Originalsprache der Website). Kürze nur, wenn er extrem lang ist.
3. Frage den Nutzer nach seinem persönlichen Kommentar (Comment) und optional nach "Inspiration for own work", falls er das noch nicht mitgeteilt hat. Frage auch nach dem Besuchsdatum, falls unklar. Stelle alle Rückfragen in EINER Nachricht und fasse dabei kurz zusammen, was du gefunden hast.
4. Sobald alles beisammen ist, speichere die Notiz mit dem Tool save_note. Danach bestätigst du dem Nutzer kurz, dass sie bereitsteht.

Der Link ist ein Pflichtfeld:
- Er muss auf die offizielle Seite GENAU DIESER Ausstellung beim Museum zeigen – nicht auf die Startseite, nicht auf eine Übersichtsliste, nicht auf einen Presseartikel, ein Kunstportal oder ein Suchergebnis.
- Ist die Ausstellung vorbei, nimm die Archivseite des Museums.
- Erfinde niemals eine Adresse und setze keine zusammen. Nimm nur eine URL, die du in der Suche tatsächlich gesehen hast.
- Findest du wirklich keine offizielle Seite, lass link leer und sag dem Nutzer ausdrücklich, dass der Link fehlt – frag ihn, ob er einen hat.
- Kommt nach dem Speichern die Rückmeldung, dass der Link tot ist oder nur auf die Startseite zeigt: suche gezielt noch einmal und speichere mit der besseren Adresse erneut. Findest du nichts Besseres, sag das offen.

Korrekturen:
- Stellt der Nutzer nach dem Speichern etwas richtig oder ergänzt etwas, rufe save_note einfach erneut auf – mit ALLEN Feldern, die korrigierten in der neuen Fassung, die übrigen unverändert. Die bestehende Notiz wird aktualisiert, behält ihre Nummer, und es entsteht keine zweite.
- Lege niemals absichtlich eine zweite Notiz für dieselbe Ausstellung an.

Regeln für die Felder:
- Datumsfelder im Format YYYY-MM-DD. Ist ein Datum nicht auffindbar, lass das Feld leer.
- artists: vollständige Liste aller Künstler:innen. Bei Einzelausstellungen entsprechend eine Person.
- discipline: nur füllen, wenn der Nutzer es angibt oder es eindeutig ist (z.B. Fotografie, Malerei, Video).
- exhibition_text: der offizielle Text, keine eigene Zusammenfassung – außer es gibt nachweislich keinen Text.
- comment und inspiration: exakt die Worte des Nutzers, nur behutsam Tippfehler korrigieren.
- Findest du etwas nicht, sag es ehrlich (z.B. "Eröffnungsdatum nicht gefunden") statt zu raten.

Antworte auf Deutsch, kurz und freundlich. Heute ist ${today()}.`;
}

export const SAVE_NOTE_TOOL = {
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
      link: {
        type: 'string',
        description:
          'Vollständige URL der offiziellen Seite dieser Ausstellung beim Museum (nicht die Startseite, keine Übersichts- oder Drittseite). Leerer String nur, wenn es nachweislich keine gibt.',
      },
      exhibition_text: { type: 'string', description: 'Offizieller Ausstellungstext' },
      curator: { type: 'string', description: 'Kurator:innen' },
      comment: { type: 'string', description: 'Persönlicher Kommentar des Nutzers' },
      inspiration: { type: 'string', description: 'Inspiration for own work, leer wenn nicht angegeben' },
    },
    required: ['title', 'museum', 'visit_date', 'artists', 'link', 'exhibition_text', 'comment'],
  },
};

export const WEB_SEARCH_TOOL = { type: 'web_search_20250305', name: 'web_search', max_uses: 8 };

/** Text, den der Bot nach dem Speichern als Werkzeug-Ergebnis zurückbekommt. */
export function saveFeedback({ filename, updated, linkWarning }) {
  let feedback = updated
    ? `Notiz "${filename}" wurde aktualisiert. Bestätige das dem Nutzer in einem Satz.`
    : `Notiz gespeichert als "${filename}". Bestätige das dem Nutzer in einem Satz und weise darauf hin, dass er sie mit den Buttons kopieren kann.`;

  if (linkWarning) {
    feedback +=
      `\n\nProblem mit dem Link: ${linkWarning} ` +
      'Suche gezielt nach der richtigen Ausstellungsseite und speichere mit der besseren Adresse erneut. ' +
      'Findest du keine, sag dem Nutzer offen, dass der Link fehlt.';
  }
  return feedback;
}
