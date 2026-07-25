import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { useTempDataDir, startTestServer } from './helpers.js';

useTempDataDir();

const { verifyToken, resetLoginAttempts } = await import('../src/auth.js');
const { checkConfig } = await import('../src/config.js');

let client;
before(async () => {
  client = await startTestServer();
});
after(() => client.close());

describe('Anmeldung', () => {
  test('ohne Anmeldung ist nichts zu holen', async () => {
    for (const url of ['/api/notes', '/api/export', '/api/conversations/x']) {
      assert.equal((await client.get(url)).status, 401, url);
    }
    assert.equal((await client.post('/api/chat', { conversationId: 'x', message: 'hi' })).status, 401);
  });

  test('der Health-Check bleibt ohne Anmeldung erreichbar', async () => {
    const res = await client.get('/healthz');
    assert.equal(res.status, 200);
  });

  test('falsches Passwort wird abgewiesen, richtiges lässt herein', async () => {
    resetLoginAttempts();
    assert.equal((await client.post('/api/login', { password: 'daneben' })).status, 401);
    assert.equal((await client.post('/api/login', { password: 'test-passwort' })).status, 200);
    assert.equal((await client.get('/api/notes')).status, 200);
  });

  test('nach fünf Fehlversuchen greift eine Sperre', async () => {
    resetLoginAttempts();
    for (let i = 0; i < 5; i++) await client.post('/api/login', { password: 'daneben' });

    const res = await client.post('/api/login', { password: 'test-passwort' });
    assert.equal(res.status, 429);
    assert.match((await res.json()).error, /Zu viele Versuche/);
    resetLoginAttempts();
  });
});

describe('Session-Token', () => {
  const day = 24 * 60 * 60 * 1000;

  test('ein frisches Token gilt, ein zu altes nicht mehr', async () => {
    const res = await client.post('/api/login', { password: 'test-passwort' });
    const token = /session=([^;]+)/.exec(res.headers.getSetCookie()[0])[1];

    assert.equal(verifyToken(token), true);
    assert.equal(verifyToken(token, Date.now() + 366 * day), false);
  });

  test('gefälschte oder kaputte Token gelten nicht', () => {
    for (const token of ['', 'kaputt', `${Date.now().toString(36)}.${'0'.repeat(64)}`, null]) {
      assert.equal(verifyToken(token), false, String(token));
    }
  });
});

describe('Konfiguration', () => {
  test('fehlende Pflichtwerte werden benannt', () => {
    const problems = checkConfig({
      appPassword: '',
      sessionSecret: '',
      anthropicApiKey: '',
      mock: false,
      timezone: 'Europe/Berlin',
    });

    assert.equal(problems.length, 3);
    assert.ok(problems.some((p) => p.includes('APP_PASSWORD')));
    assert.ok(problems.some((p) => p.includes('SESSION_SECRET')));
    assert.ok(problems.some((p) => p.includes('ANTHROPIC_API_KEY')));
  });

  test('zu kurze Geheimnisse und unbekannte Zeitzonen fallen auf', () => {
    const problems = checkConfig({
      appPassword: 'kurz',
      sessionSecret: 'auch-kurz',
      anthropicApiKey: 'sk-test',
      mock: false,
      timezone: 'Mars/Olympus',
    });

    assert.equal(problems.length, 3);
    assert.ok(problems.some((p) => p.includes('Mars/Olympus')));
  });

  test('mit MOCK_AGENT braucht es keinen API-Key', () => {
    const problems = checkConfig({
      appPassword: 'langes-passwort',
      sessionSecret: 'ein-ausreichend-langes-secret',
      anthropicApiKey: '',
      mock: true,
      timezone: 'Europe/Berlin',
    });

    assert.deepEqual(problems, []);
  });
});
