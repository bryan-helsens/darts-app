/**
 * Datums en uren in Europe/Brussels. In de database staan tijdstippen in UTC;
 * datums van speelavonden ("jjjj-mm-dd") en uren ("uu:mm") zijn lokale tijd.
 */

export const TIME_ZONE = 'Europe/Brussels';

const offsetFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, timeZoneName: 'shortOffset' });

/** Verschil tussen Brusselse tijd en UTC in minuten (60 in de winter, 120 in de zomer). */
export function brusselsOffsetMinutes(utcMs: number): number {
  const name = offsetFormatter.formatToParts(new Date(utcMs)).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+1';
  const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
  if (!match) return 0;
  const sign = match[1] === '-' ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3] ?? 0));
}

/** Lokale datum + uur in Brussel → UTC-milliseconden. */
export function brusselsToUtc(date: string, time = '00:00'): number {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const naive = Date.UTC(y, m - 1, d, hh, mm);
  let utc = naive - brusselsOffsetMinutes(naive) * 60_000;
  // Opnieuw controleren rond de omschakeling naar zomer-/wintertijd.
  utc = naive - brusselsOffsetMinutes(utc) * 60_000;
  return utc;
}

const partsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function parts(ms: number) {
  const p = Object.fromEntries(partsFormatter.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { y: p.year, m: p.month, d: p.day, hh: p.hour, mm: p.minute };
}

/** "jjjj-mm-dd" van een tijdstip, in Brussel. */
export function isoDateInBrussels(ms: number): string {
  const p = parts(ms);
  return `${p.y}-${p.m}-${p.d}`;
}

export function todayInBrussels(now = Date.now()): string {
  return isoDateInBrussels(now);
}

/** dd/mm/jjjj */
export function formatDate(value: string | number): string {
  if (typeof value === 'string') {
    const [y, m, d] = value.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
  const p = parts(value);
  return `${p.d}/${p.m}/${p.y}`;
}

/** 19u00 */
export function formatTime(value: number | string): string {
  if (typeof value === 'string') {
    const [hh, mm] = value.split(':');
    return `${hh}u${mm}`;
  }
  const p = parts(value);
  return `${p.hh}u${p.mm}`;
}

const weekday = new Intl.DateTimeFormat('nl-BE', { timeZone: 'UTC', weekday: 'long' });
const monthName = new Intl.DateTimeFormat('nl-BE', { timeZone: 'UTC', month: 'long' });

/** "zaterdag 21 november 2026" */
export function formatLongDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${weekday.format(dt)} ${d} ${monthName.format(dt)} ${y}`;
}

const MONTHS_SHORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const WEEKDAYS_SHORT = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];

/** Onderdelen voor een datumtegeltje: { day: 21, month: "nov", weekday: "za" } */
export function dateParts(date: string): { day: number; month: string; weekday: string } {
  const [y, m, d] = date.split('-').map(Number);
  return { day: d, month: MONTHS_SHORT[m - 1], weekday: WEEKDAYS_SHORT[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] };
}

/** Derde zaterdag van een maand (maand 1–12) als "jjjj-mm-dd". */
export function thirdSaturday(year: number, month: number): string {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const day = 1 + ((6 - first + 7) % 7) + 14;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** "uu:mm:ss" uit Postgres → "uu:mm" */
export function shortTime(time: string): string {
  return time.slice(0, 5);
}
