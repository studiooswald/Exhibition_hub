import crypto from 'node:crypto';
import { config } from './config.js';

// Bremse gegen Passwort-Raten. Sie steigt an, statt pauschal lange zu sperren:
// ein paar Vertipper kosten fast nichts, hartnäckiges Raten wird sehr langsam.
const MAX_ATTEMPTS = 5;
const FIRST_LOCKOUT_MS = 60 * 1000;
const MAX_LOCKOUT_MS = 15 * 60 * 1000;
const WRONG_PASSWORD_DELAY_MS = 800;

const attempts = { failures: 0, lockouts: 0, lockedUntil: 0 };

function sign(payload) {
  return crypto.createHmac('sha256', config.sessionSecret).update(payload).digest('hex');
}

function equals(a, b) {
  const bufferA = Buffer.from(String(a));
  const bufferB = Buffer.from(String(b));
  return bufferA.length === bufferB.length && crypto.timingSafeEqual(bufferA, bufferB);
}

// Das Token trägt seinen Ausstellzeitpunkt bei sich und läuft ab. Ein Wechsel
// von SESSION_SECRET zieht darüber hinaus alle bestehenden Anmeldungen zurück.
function issueToken() {
  const issuedAt = Date.now().toString(36);
  return `${issuedAt}.${sign(issuedAt)}`;
}

export function verifyToken(token, now = Date.now()) {
  if (typeof token !== 'string') return false;
  const [issuedAt, signature] = token.split('.');
  if (!issuedAt || !signature) return false;
  if (!equals(signature, sign(issuedAt))) return false;

  const issued = parseInt(issuedAt, 36);
  return Number.isFinite(issued) && now - issued < config.sessionDays * 24 * 60 * 60 * 1000;
}

function readCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function isAuthed(req) {
  return verifyToken(readCookie(req, 'session'));
}

export function requireAuth(req, res, next) {
  if (!isAuthed(req)) return res.status(401).json({ error: 'unauthorized' });
  next();
}

export async function handleLogin(req, res) {
  const now = Date.now();
  if (now < attempts.lockedUntil) {
    const seconds = Math.ceil((attempts.lockedUntil - now) / 1000);
    return res.status(429).json({ error: `Zu viele Versuche. Bitte ${seconds} Sekunden warten.` });
  }

  const { password } = req.body || {};
  if (typeof password !== 'string' || !equals(password, config.appPassword)) {
    attempts.failures += 1;
    if (attempts.failures >= MAX_ATTEMPTS) {
      attempts.lockedUntil =
        now + Math.min(FIRST_LOCKOUT_MS * 2 ** attempts.lockouts, MAX_LOCKOUT_MS);
      attempts.lockouts += 1;
      attempts.failures = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, WRONG_PASSWORD_DELAY_MS));
    return res.status(401).json({ error: 'Falsches Passwort' });
  }

  attempts.failures = 0;
  attempts.lockouts = 0;
  const maxAge = config.sessionDays * 24 * 60 * 60;
  res.setHeader(
    'Set-Cookie',
    `session=${issueToken()}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}` +
      (config.production ? '; Secure' : '')
  );
  res.json({ ok: true });
}

/** Nur für Tests: setzt die Sperre zurück. */
export function resetLoginAttempts() {
  attempts.failures = 0;
  attempts.lockouts = 0;
  attempts.lockedUntil = 0;
}
