import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { useTempDataDir } from './helpers.js';

useTempDataDir();

const { normalizeLink, isHomepage, reviewLink, checkLink } = await import('../src/link.js');

describe('Link aufräumen', () => {
  test('fehlendes Schema wird ergänzt', () => {
    assert.equal(normalizeLink('lenbachhaus.de/ausstellung'), 'https://lenbachhaus.de/ausstellung');
  });

  test('Tracking-Parameter fliegen raus, echte Parameter bleiben', () => {
    assert.equal(
      normalizeLink('https://museum.de/aus?id=7&utm_source=news&fbclid=xy'),
      'https://museum.de/aus?id=7'
    );
  });

  test('Markdown-Klammern und angehängte Satzzeichen werden abgestreift', () => {
    assert.equal(normalizeLink('[Seite](https://museum.de/aus)'), 'https://museum.de/aus');
    assert.equal(normalizeLink('<https://museum.de/aus>'), 'https://museum.de/aus');
    assert.equal(normalizeLink('https://museum.de/aus.'), 'https://museum.de/aus');
  });

  test('Anker verschwinden', () => {
    assert.equal(normalizeLink('https://museum.de/aus#top'), 'https://museum.de/aus');
  });

  test('was keine brauchbare Adresse ist, wird verworfen', () => {
    for (const value of ['', '   ', 'kein Link gefunden', 'javascript:alert(1)', 'ftp://x.de/a']) {
      assert.equal(normalizeLink(value), '', `"${value}" darf nicht durchgehen`);
    }
  });
});

describe('Link bewerten', () => {
  test('die Startseite wird als solche erkannt', () => {
    assert.equal(isHomepage('https://www.lenbachhaus.de/'), true);
    assert.equal(isHomepage('https://www.lenbachhaus.de'), true);
    assert.equal(isHomepage('https://www.lenbachhaus.de/programm/detail'), false);
  });

  test('ein fehlender Link wird bemängelt', async () => {
    assert.match(await reviewLink(''), /kein Link/i);
  });

  test('eine Startseite wird bemängelt, ohne dass das Netz gefragt werden muss', async () => {
    const warning = await reviewLink('https://www.lenbachhaus.de/');
    assert.match(warning, /Startseite/);
  });
});

describe('Link anklopfen (gegen einen lokalen Server)', () => {
  let base;
  let server;

  before(async () => {
    const http = await import('node:http');
    server = http.createServer((req, res) => {
      if (req.url === '/weg') return res.writeHead(404).end();
      if (req.url === '/gesperrt') return res.writeHead(403).end();
      if (req.url === '/kein-head' && req.method === 'HEAD') return res.writeHead(405).end();
      res.writeHead(200).end('ok');
    });
    server.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(() => new Promise((resolve) => server.close(resolve)));

  test('eine erreichbare Seite ist in Ordnung', async () => {
    assert.equal((await checkLink(`${base}/ausstellung`)).state, 'ok');
    assert.equal(await reviewLink(`${base}/ausstellung`, { check: true }), null);
  });

  test('404 gilt als tot und wird bemängelt', async () => {
    assert.equal((await checkLink(`${base}/weg`)).state, 'tot');
    assert.match(await reviewLink(`${base}/weg`, { check: true }), /404/);
  });

  test('eine Seite, die Bots aussperrt, gilt nicht als tot', async () => {
    assert.equal((await checkLink(`${base}/gesperrt`)).state, 'unbestaetigt');
    assert.equal(await reviewLink(`${base}/gesperrt`, { check: true }), null);
  });

  test('kennt die Seite kein HEAD, wird es mit GET versucht', async () => {
    assert.equal((await checkLink(`${base}/kein-head`)).state, 'ok');
  });

  test('eine unerreichbare Adresse blockiert das Speichern nicht', async () => {
    assert.equal((await checkLink('http://127.0.0.1:1/weg', 500)).state, 'unbestaetigt');
  });
});
