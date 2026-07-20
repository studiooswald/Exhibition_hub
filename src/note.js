const GERMAN_MONTHS = ['JAN', 'FEB', 'MÄR', 'APR', 'MAI', 'JUN', 'JUL', 'AUG', 'SEP', 'OKT', 'NOV', 'DEZ'];

function monthAbbrev(isoDate) {
  const m = /^\d{4}-(\d{2})-\d{2}$/.exec(isoDate || '');
  if (!m) return null;
  return GERMAN_MONTHS[parseInt(m[1], 10) - 1] || null;
}

// Obsidian-Dateinamen dürfen kein / \ : * ? " < > | # ^ [ ] enthalten
function sanitizeFilename(name) {
  return name.replace(/[/\\:*?"<>|#^[\]]/g, '').replace(/\s+/g, ' ').trim();
}

function yamlScalar(value) {
  if (value === null || value === undefined || value === '') return '';
  const s = String(value).trim();
  // Quoten, wenn YAML-Sonderzeichen den Wert sonst falsch parsen würden
  if (/[:#{}[\],&*!|>'"%@`]/.test(s) || /^\s|\s$/.test(s) || /^[-?]/.test(s)) {
    return JSON.stringify(s);
  }
  return s;
}

function yamlList(items) {
  if (!Array.isArray(items) || items.length === 0) return ' []';
  return '\n' + items.map((item) => `  - ${yamlScalar(item)}`).join('\n');
}

export function buildFilename(nr, visitDate, title) {
  const month = monthAbbrev(visitDate);
  const parts = [`${nr} -`];
  if (month) parts.push(month);
  parts.push(sanitizeFilename(title));
  return parts.join(' ');
}

export function renderNote(fields) {
  const {
    museum = '',
    visit_date = '',
    opening_date = '',
    ending_date = '',
    discipline = [],
    artists = [],
    link = '',
    exhibition_text = '',
    curator = '',
    comment = '',
    inspiration = '',
  } = fields;

  const frontmatter = [
    '---',
    `Museum: ${yamlScalar(museum)}`,
    `VisitDate: ${visit_date || ''}`,
    `OpeningDate: ${opening_date || ''}`,
    `EndingDate: ${ending_date || ''}`,
    `Discipline:${yamlList(discipline)}`,
    `Artists:${yamlList(artists)}`,
    `Link: ${link || ''}`,
    '---',
  ].join('\n');

  const sections = [
    ['Exhibition Text', exhibition_text],
    ['Curator', curator],
    ['Comment', comment],
    ['Inspiration for own work', inspiration],
  ];

  const body = sections
    .map(([heading, text]) => `**${heading}:**\n${(text || '').trim()}`)
    .join('\n\n');

  return `${frontmatter}\n\n${body}\n`;
}
