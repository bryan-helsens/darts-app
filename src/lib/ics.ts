/**
 * iCalendar (.ics) voor "In mijn agenda" en de abonneerbare kalender
 * (/kalender.ics). Puur: dezelfde code draait in de browser en in de
 * Netlify-functie. Tijden gaan in UTC naar buiten (de agenda zet ze zelf om).
 */

import { brusselsToUtc } from './time';

export interface CalendarEvent {
  id: string;
  /** "jjjj-mm-dd" */
  date: string;
  /** "uu:mm" of "uu:mm:ss", lokale tijd in Brussel. */
  start: string;
  end: string;
  title: string;
  description: string;
  url: string;
}

export interface CalendarOptions {
  name: string;
  location: string;
  /** Tijdstip van aanmaken (DTSTAMP), in ms. */
  now: number;
}

const CRLF = '\r\n';
const DAY = 24 * 60 * 60 * 1000;

/** 20261121T180000Z */
export function icsDateTime(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Tekstwaarde volgens RFC 5545: backslash, puntkomma, komma en regeleinden. */
export function icsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Regels van meer dan 75 bytes vouwen (vervolgregels beginnen met een spatie), zonder een UTF-8-teken te splitsen. */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    // De eerste regel mag 75 bytes, vervolgregels 74 (plus de spatie).
    const limit = parts.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      parts.push(current);
      current = '';
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  parts.push(current);
  return parts.join(`${CRLF} `);
}

export function buildCalendar(events: readonly CalendarEvent[], opts: CalendarOptions): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sanapolis Darts//Kalender//NL',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(opts.name)}`,
    'X-WR-TIMEZONE:Europe/Brussels',
    // Abonnementen: om de 6 uur opnieuw ophalen (niet elke agenda luistert hiernaar).
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
  ];
  for (const e of events) {
    const start = brusselsToUtc(e.date, e.start.slice(0, 5));
    let end = brusselsToUtc(e.date, e.end.slice(0, 5));
    // Een einde na middernacht valt de volgende dag.
    if (end <= start) end += DAY;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.id}@sanapolis-darts`,
      `DTSTAMP:${icsDateTime(opts.now)}`,
      `DTSTART:${icsDateTime(start)}`,
      `DTEND:${icsDateTime(end)}`,
      `SUMMARY:${icsText(e.title)}`,
      `LOCATION:${icsText(opts.location)}`,
      `DESCRIPTION:${icsText(e.description)}`,
      `URL:${e.url}`,
      'STATUS:CONFIRMED',
      'TRANSP:OPAQUE',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join(CRLF) + CRLF;
}
