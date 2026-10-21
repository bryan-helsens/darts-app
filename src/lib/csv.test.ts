import { describe, expect, it } from 'vitest';
import { fileSlug, toCsv } from './csv';

describe('csv', () => {
  const rows = [
    { name: 'Jan Peeters', points: 27, avg: 2.5, paid: true },
    { name: 'Dirk "De Pijl" Claes', points: 0, avg: null, paid: false },
    { name: 'Ann; Marie', points: -3, avg: 1, paid: false },
  ];
  const csv = toCsv(rows, [
    { header: 'Speler', value: (r) => r.name },
    { header: 'Punten', value: (r) => r.points },
    { header: 'Gemiddelde', value: (r) => r.avg },
    { header: 'Betaald', value: (r) => r.paid },
  ]);

  it('begint met een BOM en gebruikt ; en CRLF', () => {
    expect(csv.startsWith('﻿Speler;Punten;Gemiddelde;Betaald\r\n')).toBe(true);
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(csv.split('\r\n')).toHaveLength(5);
  });

  it('komma als decimaalteken, ja/nee, lege waarden', () => {
    expect(csv).toContain('\r\nJan Peeters;27;2,5;ja\r\n');
    expect(csv).toContain(';0;;nee\r\n');
    expect(csv).toContain('"Ann; Marie";-3;1;nee');
  });

  it('aanhalingstekens verdubbelen', () => {
    expect(csv).toContain('"Dirk ""De Pijl"" Claes"');
  });

  it('tekst die op een formule lijkt wordt onschadelijk', () => {
    const out = toCsv([{ v: '=HYPERLINK("x")' }, { v: '+32 470 12 34 56' }, { v: '@sum' }], [{ header: 'v', value: (r) => r.v }]);
    expect(out).toContain(`"'=HYPERLINK(""x"")"`);
    expect(out).toContain("'+32 470 12 34 56");
    expect(out).toContain("'@sum");
  });

  it('bestandsnamen', () => {
    expect(fileSlug('Seizoen 2027')).toBe('seizoen-2027');
    expect(fileSlug('Café ’t Oud')).toBe('cafe-t-oud');
    expect(fileSlug('***')).toBe('export');
  });
});
