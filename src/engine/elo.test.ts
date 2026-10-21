import { describe, expect, it } from 'vitest';
import { computeElo, eloChangeForEvent, eloSeedRanks, expectedScore, type EloMatch } from './elo';
import { DEFAULT_ELO } from './settings';

let n = 0;
function match(p1: string, p2: string, winner: string, extra: Partial<EloMatch> = {}): EloMatch {
  n++;
  return { id: `m${String(n).padStart(3, '0')}`, eventId: 'e1', date: '2027-01-16', finishedAt: n, player1: p1, player2: p2, winner, walkover: false, ...extra };
}
const settings = () => DEFAULT_ELO;

describe('elo', () => {
  it('verwachte score: gelijk niveau 50%, 400 punten verschil ±91%', () => {
    expect(expectedScore(1500, 1500)).toBeCloseTo(0.5);
    expect(expectedScore(1900, 1500)).toBeCloseTo(0.909, 3);
    expect(expectedScore(1500, 1900) + expectedScore(1900, 1500)).toBeCloseTo(1);
  });

  it('start op 1500 en gebruikt de nieuwkomers-K', () => {
    const elo = computeElo([match('a', 'b', 'a')], settings);
    // Beide nieuw: K = 48, verwachting 0,5 → ±24.
    expect(elo.ratings.get('a')).toBeCloseTo(1524);
    expect(elo.ratings.get('b')).toBeCloseTo(1476);
    expect(elo.matches.get('a')).toBe(1);
  });

  it('schakelt na de nieuwkomersmatchen over op de gewone K', () => {
    const s = () => ({ ...DEFAULT_ELO, newcomerMatches: 1 });
    const elo = computeElo([match('a', 'b', 'a'), match('a', 'b', 'b')], s);
    const h = elo.history.get('b') as NonNullable<ReturnType<typeof elo.history.get>>;
    // Tweede match: K = 32 voor beide.
    expect(h[1].after - h[1].before).toBeCloseTo(32 * (1 - expectedScore(1476, 1524)));
  });

  it('negeert walk-overs en telt in chronologische volgorde', () => {
    const late = match('a', 'b', 'b', { date: '2027-02-20' });
    const early = match('a', 'b', 'a', { date: '2027-01-16' });
    const wo = match('a', 'c', 'a', { walkover: true });
    const elo = computeElo([late, wo, early], settings);
    expect(elo.matches.get('c')).toBeUndefined();
    expect(elo.history.get('a')?.map((h) => h.matchId)).toEqual([early.id, late.id]);
  });

  it('gebruikt de instellingen van het seizoen van de match', () => {
    const m = match('a', 'b', 'a', { eventId: 'oud' });
    const elo = computeElo([m], (x) => (x.eventId === 'oud' ? { ...DEFAULT_ELO, start: 1000, newcomerK: 10 } : DEFAULT_ELO));
    expect(elo.ratings.get('a')).toBeCloseTo(1005);
  });

  it('een sterkere speler wint minder bij winst dan hij verliest bij verlies', () => {
    const ms = [match('a', 'b', 'a'), match('a', 'b', 'a'), match('a', 'b', 'a')];
    const before = computeElo(ms, settings);
    const win = computeElo([...ms, match('a', 'b', 'a')], settings);
    const loss = computeElo([...ms, match('a', 'b', 'b')], settings);
    const ra = before.ratings.get('a') as number;
    expect((win.ratings.get('a') as number) - ra).toBeLessThan(ra - (loss.ratings.get('a') as number));
  });

  it('geeft seedingrangen enkel aan spelers met een rating', () => {
    const elo = computeElo([match('a', 'b', 'a'), match('c', 'a', 'c')], settings);
    const ranks = eloSeedRanks(elo, ['a', 'b', 'c', 'nieuw']);
    expect([...ranks.entries()].sort((x, y) => x[1] - y[1]).map(([p]) => p)).toEqual(['c', 'a', 'b']);
    expect(ranks.has('nieuw')).toBe(false);
  });

  it('berekent het verschil over één avond', () => {
    const elo = computeElo([match('a', 'b', 'a', { eventId: 'x' }), match('a', 'c', 'a', { eventId: 'x' }), match('a', 'b', 'b', { eventId: 'y', date: '2027-02-20' })], settings);
    const h = elo.history.get('a');
    expect(eloChangeForEvent(h, 'x')).toBeCloseTo((h?.[1].after ?? 0) - 1500);
    expect(eloChangeForEvent(h, 'z')).toBeNull();
  });
});
