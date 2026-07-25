import { config } from './config.js';

// Der Link zur Ausstellungsseite ist das Feld, bei dem Web-Recherche am
// ehesten danebengreift: Startseite statt Ausstellungsseite, eine Seite, die es
// nicht mehr gibt, oder eine mit Tracking-Parametern verunstaltete Adresse.
// Deshalb wird er hier aufgeräumt und beim Speichern einmal angeklopft.

const TRACKING_PARAMS = [/^utm_/i, /^fbclid$/i, /^gclid$/i, /^mc_(cid|eid)$/i, /^(ref|source)$/i];
const CHECK_TIMEOUT_MS = 6000;

/** Räumt eine Adresse auf: Markdown-Klammern, fehlendes Schema, Tracking-Parameter. */
export function normalizeLink(raw) {
  let value = String(raw || '').trim();
  if (!value) return '';

  const markdown = /\[[^\]]*\]\(([^)]+)\)/.exec(value);
  if (markdown) value = markdown[1].trim();
  value = value.replace(/^<+|>+$/g, '').replace(/[.,;)\]]+$/, '').trim();
  if (!value) return '';

  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    if (!/^[\w-]+(\.[\w-]+)+(\/|$)/.test(value)) return '';
    value = `https://${value}`;
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    return '';
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
  if (!url.hostname.includes('.')) return '';

  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.some((pattern) => pattern.test(key))) url.searchParams.delete(key);
  }
  url.hash = '';
  return url.toString();
}

/** Zeigt der Link nur auf die Startseite statt auf die Ausstellungsseite? */
export function isHomepage(link) {
  try {
    const url = new URL(link);
    return url.pathname.replace(/\/+$/, '') === '' && !url.search;
  } catch {
    return false;
  }
}

/**
 * Klopft die Seite einmal an. Nur eine klare Absage (404/410) gilt als tot –
 * Museums-Websites sperren Bots gern aus, das darf kein Fehlalarm werden.
 */
export async function checkLink(link, timeoutMs = CHECK_TIMEOUT_MS) {
  if (!link) return { state: 'fehlt' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res = await fetch(link, { method: 'HEAD', redirect: 'follow', signal: controller.signal });
    if (res.status === 405 || res.status === 501) {
      res = await fetch(link, { method: 'GET', redirect: 'follow', signal: controller.signal });
    }
    if (res.status === 404 || res.status === 410) return { state: 'tot', code: res.status };
    if (res.ok) return { state: 'ok', code: res.status };
    return { state: 'unbestaetigt', code: res.status };
  } catch {
    return { state: 'unbestaetigt' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Prüft den Link einer Notiz und formuliert, was daran nicht stimmt.
 * Gibt null zurück, wenn nichts dagegen spricht.
 *
 * Die Startseite erkennt man ohne Netz – deshalb zuerst. Erst danach wird die
 * Seite tatsächlich angefragt.
 */
export async function reviewLink(link, { check = config.checkLinks } = {}) {
  if (!link) return 'Zu dieser Notiz ist kein Link gespeichert.';

  if (isHomepage(link)) {
    return `Der Link ${link} zeigt nur auf die Startseite, nicht auf die Seite der Ausstellung.`;
  }
  if (!check) return null;

  const result = await checkLink(link);
  if (result.state === 'tot') {
    return `Die Seite ${link} antwortet mit ${result.code} – unter dieser Adresse gibt es sie nicht.`;
  }
  return null;
}
