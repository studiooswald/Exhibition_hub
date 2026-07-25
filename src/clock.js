import { config } from './config.js';

// Datumsangaben laufen über die eingestellte Zeitzone, nicht über UTC. Sonst
// ist "ich war heute dort" zwischen Mitternacht und 2 Uhr schon gestern.
const isoDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: config.timezone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Heutiges Datum als YYYY-MM-DD in der eingestellten Zeitzone. */
export function today(date = new Date()) {
  return isoDate.format(date);
}

/** Zeitstempel für Dateinamen: YYYY-MM-DD-HHMMSS. */
export function stamp(date = new Date()) {
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: config.timezone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
    .format(date)
    .replace(/\D/g, '');
  return `${today(date)}-${time}`;
}
