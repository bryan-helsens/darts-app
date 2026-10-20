import { describe, expect, it } from 'vitest';
import { brusselsToUtc, dateParts, formatDate, formatLongDate, formatTime, isoDateInBrussels, thirdSaturday } from './time';

describe('tijd in Brussel', () => {
  it('rekent winter- en zomertijd om', () => {
    expect(new Date(brusselsToUtc('2026-11-21', '19:00')).toISOString()).toBe('2026-11-21T18:00:00.000Z');
    expect(new Date(brusselsToUtc('2026-06-20', '19:00')).toISOString()).toBe('2026-06-20T17:00:00.000Z');
  });

  it('formatteert datums als dd/mm/jjjj en uren als 19u00', () => {
    expect(formatDate('2026-11-21')).toBe('21/11/2026');
    expect(formatDate(brusselsToUtc('2026-01-01', '00:30'))).toBe('01/01/2026');
    expect(formatTime(brusselsToUtc('2026-11-21', '23:15'))).toBe('23u15');
    expect(formatTime('18:30:00')).toBe('18u30');
    expect(isoDateInBrussels(Date.UTC(2026, 11, 31, 23, 30))).toBe('2027-01-01');
    expect(formatLongDate('2026-11-21')).toBe('zaterdag 21 november 2026');
    expect(dateParts('2026-11-21')).toEqual({ day: 21, month: 'nov', weekday: 'za' });
    expect(dateParts('2027-03-20')).toEqual({ day: 20, month: 'mrt', weekday: 'za' });
  });

  it('vindt de derde zaterdag van de maand', () => {
    expect(thirdSaturday(2026, 11)).toBe('2026-11-21');
    expect(thirdSaturday(2026, 12)).toBe('2026-12-19');
    expect(thirdSaturday(2027, 1)).toBe('2027-01-16');
    expect(thirdSaturday(2026, 8)).toBe('2026-08-15');
  });
});
