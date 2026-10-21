import { describe, expect, it } from 'vitest';
import { toCalendarEvents } from '../data/calendar';
import { buildCalendar, foldLine, icsDateTime, icsText, type CalendarEvent } from './ics';

const event: CalendarEvent = {
  id: 'e1',
  date: '2026-11-21',
  start: '19:00:00',
  end: '23:15',
  title: 'Sanapolis Darts',
  description: 'Start 19u00, inschrijven tot 18u30.\nTestavond',
  url: 'https://darts.example/avond/e1',
};
const opts = { name: 'Sanapolis Darts', location: 'Brasserie ’t Oud Sanatorium, Sijsele', now: Date.UTC(2026, 9, 21, 10, 0) };

describe('ics', () => {
  it('UTC-tijden, ook rond de overgang naar wintertijd', () => {
    const lines = buildCalendar([event], opts).split('\r\n');
    // 21/11 is wintertijd (UTC+1): 19u00 → 18:00Z, 23u15 → 22:15Z.
    expect(lines).toContain('DTSTART:20261121T180000Z');
    expect(lines).toContain('DTEND:20261121T221500Z');
    expect(lines).toContain('DTSTAMP:20261021T100000Z');
    const summer = buildCalendar([{ ...event, date: '2026-06-20' }], opts).split('\r\n');
    expect(summer).toContain('DTSTART:20260620T170000Z');
  });

  it('een einde na middernacht valt de volgende dag', () => {
    const lines = buildCalendar([{ ...event, end: '00:30' }], opts).split('\r\n');
    expect(lines).toContain('DTEND:20261121T233000Z');
    const late = buildCalendar([{ ...event, start: '20:00', end: '01:00' }], opts).split('\r\n');
    expect(late).toContain('DTEND:20261122T000000Z');
  });

  it('structuur: CRLF, één VEVENT per avond, unieke UID', () => {
    const ics = buildCalendar([event, { ...event, id: 'e2', date: '2026-12-19' }], opts);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain('UID:e1@sanapolis-darts');
    expect(ics).toContain('UID:e2@sanapolis-darts');
    expect(ics.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('tekst escapen en lange regels vouwen zonder tekens te splitsen', () => {
    expect(icsText('a, b; c\\d\ne')).toBe('a\\, b\\; c\\\\d\\ne');
    const long = `DESCRIPTION:${'é'.repeat(60)}`;
    const folded = foldLine(long);
    const parts = folded.split('\r\n');
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(75);
    expect(parts.slice(1).every((p) => p.startsWith(' '))).toBe(true);
    expect(parts.map((p, i) => (i === 0 ? p : p.slice(1))).join('')).toBe(long);
    expect(foldLine('KORT')).toBe('KORT');
  });

  it('icsDateTime', () => {
    expect(icsDateTime(Date.UTC(2027, 0, 16, 18, 5, 9))).toBe('20270116T180509Z');
  });

  it('avonden uit de database: einde volgens het seizoen, link en notitie', () => {
    const events = toCalendarEvents(
      [
        { id: 'b', season_id: 's', event_date: '2027-02-20', start_time: '19:30:00', registration_closes: '19:00:00', notes: null },
        { id: 'a', season_id: 's', event_date: '2027-01-16', start_time: '19:00:00', registration_closes: '18:30:00', notes: 'Kerstspecial' },
      ],
      [{ id: 's', settings: { endLimit: '23:30', entryFee: 6 } }],
      'https://darts.example',
    );
    expect(events.map((e) => e.id)).toEqual(['a', 'b']);
    expect(events[0]).toMatchObject({ end: '23:30', url: 'https://darts.example/avond/a' });
    expect(events[0].description).toContain('inschrijven tot 18u30');
    expect(events[0].description).toContain('Inleg €6');
    expect(events[0].description).toContain('Kerstspecial');
    // Onbekend seizoen: standaardinstellingen.
    const orphan = { id: 'c', season_id: 'x', event_date: '2027-03-20', start_time: '19:00:00', registration_closes: '18:30:00', notes: null };
    expect(toCalendarEvents([orphan], [], '')[0].end).toBe('23:15');
  });
});
