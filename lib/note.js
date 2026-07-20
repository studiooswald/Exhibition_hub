const GERMAN_MONTHS = ['JAN', 'FEB', 'MÄR', 'APR', 'MAI', 'JUN', 'JUL', 'AUG', 'SEP', 'OKT', 'NOV', 'DEZ'];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function monthAbbr(isoDate) {
  const month = Number(isoDate.slice(5, 7));
  return GERMAN_MONTHS[month - 1] ?? '';
}

// Windows/macOS/Obsidian-unverträgliche Zeichen aus dem Dateinamen entfernen
function sanitizeFilename(name) {
  return name.replace(/[\\/:*?"<>|#^[\]]/g, '').replace(/\s+/g, ' ').trim();
}

export function buildFilename({ number, visitDate, title }) {
  const parts = [];
  if (number !== undefined && number !== null && String(number).trim() !== '') {
    parts.push(`${String(number).trim()} - `);
  }
  if (visitDate && ISO_DATE.test(visitDate)) {
    parts.push(`${monthAbbr(visitDate)} `);
  }
  parts.push(title || 'Unbenannte Ausstellung');
  return sanitizeFilename(parts.join(''));
}

function dateOrText(value, fallback) {
  if (!value || String(value).trim() === '') return fallback;
  return String(value).trim();
}

export function buildNote({ research, visitDate, number, comment, inspiration }) {
  const {
    title = '',
    museum = '',
    opening_date: openingDate,
    ending_date: endingDate,
    discipline,
    artists = [],
    curator,
    link,
    exhibition_text: exhibitionText,
  } = research;

  const lines = [];
  lines.push('---');
  lines.push(`Museum: ${museum}`);
  lines.push(`VisitDate: ${dateOrText(visitDate, '')}`);
  lines.push(`OpeningDate: ${dateOrText(openingDate, 'nicht gefunden')}`);
  lines.push(`EndingDate: ${dateOrText(endingDate, 'nicht gefunden')}`);
  lines.push(`Discipline: ${dateOrText(discipline, '')}`);
  if (artists.length > 0) {
    lines.push('Artists:');
    for (const artist of artists) {
      lines.push(`  - ${artist}`);
    }
  } else {
    lines.push('Artists:');
  }
  lines.push(`Link: ${dateOrText(link, '')}`);
  lines.push('---');
  lines.push('Exhibition Text:');
  lines.push(dateOrText(exhibitionText, 'nicht gefunden'));
  lines.push('');
  lines.push('Curator:');
  lines.push(dateOrText(curator, 'nicht gefunden'));
  lines.push('');
  lines.push('Comment:');
  lines.push(dateOrText(comment, ''));
  lines.push('');
  lines.push('Inspiration for own work:');
  lines.push(dateOrText(inspiration, ''));
  lines.push('');

  return {
    filename: buildFilename({ number, visitDate, title }),
    markdown: lines.join('\n'),
  };
}
