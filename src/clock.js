// Alle Datumsangaben laufen über die lokale Zeitzone, nicht über UTC.
// Sonst ist "ich war heute dort" zwischen Mitternacht und 2 Uhr gestern.
const TIMEZONE = process.env.TIMEZONE || 'Europe/Berlin';

const isoDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Heutiges Datum als YYYY-MM-DD in der konfigurierten Zeitzone. */
export function today(date = new Date()) {
  return isoDate.format(date);
}

export { TIMEZONE };
