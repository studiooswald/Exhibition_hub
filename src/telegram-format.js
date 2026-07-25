// Telegram-Nachrichten dürfen 4096 Zeichen lang sein. Ausstellungstexte sind
// gern länger – deshalb wird hier sauber an Zeilengrenzen aufgeteilt.
// Als Parse-Modus wird HTML verwendet: dort sind nur drei Zeichen zu
// maskieren, während MarkdownV2 an jedem Bindestrich im Museumstext stolpert.

const TELEGRAM_LIMIT = 4096;
const CHUNK = 3800; // Platz für <pre>-Tags und Zählfehler

export function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Teilt Text an Zeilengrenzen in Stücke, die in eine Nachricht passen. */
export function splitText(text, size = CHUNK) {
  const chunks = [];
  let current = '';

  for (const line of String(text).split('\n')) {
    // Eine einzelne überlange Zeile muss hart geteilt werden
    if (line.length > size) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      for (let i = 0; i < line.length; i += size) chunks.push(line.slice(i, i + size));
      continue;
    }
    if (current.length + line.length + 1 > size) {
      chunks.push(current);
      current = line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [''];
}

/** Fertige Nachrichten für eine Notiz: Kopfzeile, Dateiname, Inhalt. */
export function noteMessages({ note, updated, linkWarning }) {
  const headline = updated
    ? `✏️ Notiz aktualisiert – Nr. ${note.nr}`
    : `📝 Notiz gespeichert – Nr. ${note.nr}`;

  const header = [headline];
  if (linkWarning) header.push(`⚠️ ${linkWarning}`);
  else if (note.link) header.push(`🔗 ${note.link}`);
  header.push('', 'Dateiname:', `<pre>${escapeHtml(note.filename)}</pre>`);

  const messages = [{ text: header.join('\n'), parse_mode: 'HTML' }];
  for (const chunk of splitText(note.markdown)) {
    messages.push({ text: `<pre>${escapeHtml(chunk)}</pre>`, parse_mode: 'HTML' });
  }
  return messages;
}

/** Übersicht für /liste */
export function noteListMessage(notes) {
  if (notes.length === 0) {
    return { text: 'Noch keine Notizen. Erzähl mir von einer Ausstellung, dann legen wir los.' };
  }
  const lines = notes.map((note) => {
    const link = note.link ? '' : ' · ohne Link';
    return `${note.nr} · ${note.title}${link}`;
  });
  return {
    text: [`Deine letzten ${notes.length} Notizen:`, '', ...lines, '', 'Einzeln holen: /notiz <Nr>'].join('\n'),
  };
}

export const HELP_TEXT = [
  'Erzähl mir einfach, in welcher Ausstellung du warst – ich recherchiere Museum,',
  'Laufzeit, Künstler:innen, Kurator:innen, den offiziellen Text und den Link,',
  'frage dich nach deinem Kommentar und baue die fertige Obsidian-Notiz.',
  '',
  'Stimmt etwas nicht, sag es einfach – ich korrigiere dieselbe Notiz, die Nummer bleibt.',
  '',
  'Befehle:',
  '/neu – nächste Ausstellung, frisch anfangen',
  '/liste – die letzten Notizen',
  '/notiz <Nr> – eine Notiz noch einmal schicken',
  '/loeschen <Nr> – eine Notiz löschen',
  '/nummer – zeigt die nächste Nummer, /nummer 27 setzt sie',
  '/export – alle Notizen als Datei sichern',
].join('\n');

export { TELEGRAM_LIMIT, CHUNK };
