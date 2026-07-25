import { normalizeLink } from './link.js';

const GERMAN_MONTHS = ['JAN', 'FEB', 'MÄR', 'APR', 'MAI', 'JUN', 'JUL', 'AUG', 'SEP', 'OKT', 'NOV', 'DEZ'];

const FIELDS = [
  'title',
  'museum',
  'visit_date',
  'opening_date',
  'ending_date',
  'discipline',
  'artists',
  'link',
  'exhibition_text',
  'curator',
  'comment',
  'inspiration',
];

function monthAbbrev(isoDate) {
  const match = /^\d{4}-(\d{2})-\d{2}$/.exec(isoDate || '');
  if (!match) return null;
  return GERMAN_MONTHS[parseInt(match[1], 10) - 1] || null;
}

// Obsidian-Dateinamen dürfen kein / \ : * ? " < > | # ^ [ ] enthalten
function sanitizeFilename(name) {
  return name.replace(/[/\\:*?"<>|#^[\]]/g, '').replace(/\s+/g, ' ').trim();
}

function yamlScalar(value) {
  if (value === null || value === undefined || value === '') return '';
  const text = String(value).trim();
  // Quoten, wenn YAML-Sonderzeichen den Wert sonst falsch lesen würden
  if (/[:#{}[\],&*!|>'"%@`]/.test(text) || /^\s|\s$/.test(text) || /^[-?]/.test(text)) {
    return JSON.stringify(text);
  }
  return text;
}

function yamlList(items) {
  if (!Array.isArray(items) || items.length === 0) return ' []';
  return '\n' + items.map((item) => `  - ${yamlScalar(item)}`).join('\n');
}

/** Bringt die Felder aus dem Tool-Aufruf in eine feste, aufgeräumte Form. */
export function normalizeFields(input = {}) {
  const fields = {};
  for (const key of FIELDS) {
    const value = input[key];
    if (key === 'artists' || key === 'discipline') {
      fields[key] = Array.isArray(value)
        ? value.map((item) => String(item).trim()).filter(Boolean)
        : [];
    } else {
      fields[key] = String(value ?? '').trim();
    }
  }
  fields.title = fields.title || 'Ohne Titel';
  fields.link = normalizeLink(fields.link);
  return fields;
}

/** Dateiname im Obsidian-Schema: `{Nr} - {MONAT} {Titel}` */
export function buildFilename(nr, fields) {
  const month = monthAbbrev(fields.visit_date);
  const parts = [`${nr} -`];
  if (month) parts.push(month);
  parts.push(sanitizeFilename(fields.title || 'Ohne Titel'));
  return parts.join(' ');
}

/** Die fertige Obsidian-Notiz: YAML-Properties plus die vier Abschnitte. */
export function renderNote(fields) {
  const frontmatter = [
    '---',
    `Museum: ${yamlScalar(fields.museum)}`,
    `VisitDate: ${fields.visit_date || ''}`,
    `OpeningDate: ${fields.opening_date || ''}`,
    `EndingDate: ${fields.ending_date || ''}`,
    `Discipline:${yamlList(fields.discipline)}`,
    `Artists:${yamlList(fields.artists)}`,
    `Link: ${fields.link || ''}`,
    '---',
  ].join('\n');

  const body = [
    ['Exhibition Text', fields.exhibition_text],
    ['Curator', fields.curator],
    ['Comment', fields.comment],
    ['Inspiration for own work', fields.inspiration],
  ]
    .map(([heading, text]) => `**${heading}:**\n${(text || '').trim()}`)
    .join('\n\n');

  return `${frontmatter}\n\n${body}\n`;
}

/** Was das Frontend über eine Notiz braucht. */
export function toNoteView(note) {
  return {
    id: note.id,
    nr: note.nr,
    title: note.fields.title,
    filename: buildFilename(note.nr, note.fields),
    markdown: renderNote(note.fields),
    link: note.fields.link || '',
    created_at: note.created_at,
  };
}
