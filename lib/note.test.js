import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNote, buildFilename } from './note.js';

const research = {
  status: 'ok',
  title: 'Shifting the Silence',
  museum: 'Lenbachhaus, München',
  opening_date: '',
  ending_date: '2027-01-01',
  discipline: '',
  artists: ['Etel Adnan', 'Jenny Holzer'],
  curator: 'Eva Huttenlauch und Matthias Mühling',
  link: 'https://www.lenbachhaus.de/programm/ausstellungen/detail/shifting-the-silence',
  exhibition_text: '"Shifting the Silence" ist der Titel des letzten Buches von Etel Adnan.',
};

test('filename follows "NN - MON Titel" with German month abbreviation', () => {
  assert.equal(
    buildFilename({ number: '26', visitDate: '2026-03-15', title: 'Shifting the Silence' }),
    '26 - MÄR Shifting the Silence',
  );
});

test('filename omits missing number and date', () => {
  assert.equal(buildFilename({ title: 'Shifting the Silence' }), 'Shifting the Silence');
});

test('filename strips characters invalid in file systems and Obsidian', () => {
  assert.equal(
    buildFilename({ number: 3, visitDate: '2026-12-01', title: 'What: is/this?' }),
    '3 - DEZ What isthis',
  );
});

test('note contains frontmatter properties in screenshot order', () => {
  const { markdown } = buildNote({ research, visitDate: '2026-03-15', number: 26, comment: 'Spannend.', inspiration: '' });
  const lines = markdown.split('\n');
  assert.equal(lines[0], '---');
  assert.equal(lines[1], 'Museum: Lenbachhaus, München');
  assert.equal(lines[2], 'VisitDate: 2026-03-15');
  assert.equal(lines[3], 'OpeningDate: nicht gefunden');
  assert.equal(lines[4], 'EndingDate: 2027-01-01');
  assert.equal(lines[5], 'Discipline: ');
  assert.equal(lines[6], 'Artists:');
  assert.equal(lines[7], '  - Etel Adnan');
  assert.equal(lines[8], '  - Jenny Holzer');
  assert.ok(lines[9].startsWith('Link: https://www.lenbachhaus.de/'));
  assert.equal(lines[10], '---');
});

test('note body has the four sections with user content', () => {
  const { markdown } = buildNote({
    research,
    visitDate: '2026-03-15',
    number: 26,
    comment: 'Das Spiel mit Materialien war spannend.',
    inspiration: 'Tiefer in Jiri Kovanda schauen.',
  });
  assert.ok(markdown.includes('Exhibition Text:\n"Shifting the Silence" ist der Titel'));
  assert.ok(markdown.includes('Curator:\nEva Huttenlauch und Matthias Mühling'));
  assert.ok(markdown.includes('Comment:\nDas Spiel mit Materialien war spannend.'));
  assert.ok(markdown.includes('Inspiration for own work:\nTiefer in Jiri Kovanda schauen.'));
});

test('missing research fields fall back gracefully', () => {
  const { markdown, filename } = buildNote({
    research: { status: 'ok', title: 'X', museum: 'Y', artists: [] },
    visitDate: '',
    number: '',
    comment: '',
    inspiration: '',
  });
  assert.equal(filename, 'X');
  assert.ok(markdown.includes('OpeningDate: nicht gefunden'));
  assert.ok(markdown.includes('EndingDate: nicht gefunden'));
  assert.ok(markdown.includes('Curator:\nnicht gefunden'));
});
