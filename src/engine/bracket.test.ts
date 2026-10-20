import { describe, expect, it } from 'vitest';
import { bracketSize, buildKnockout, placeQualifiers, roundName, seedOrder } from './bracket';
import type { Qualifier } from './qualify';
import { DEFAULT_LEGS } from './settings';

const q = (playerId: string, poolId: string, poolPosition: number, withdrawn = false): Qualifier => ({
  playerId,
  poolId,
  poolPosition,
  withdrawn,
});

describe('KO-schema', () => {
  it('kent de standaard seedvolgorde', () => {
    expect(seedOrder(2)).toEqual([1, 2]);
    expect(seedOrder(4)).toEqual([1, 4, 2, 3]);
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    expect(bracketSize(6)).toBe(8);
    expect(bracketSize(16)).toBe(16);
  });

  it('geeft byes aan de hoogste seeds', () => {
    const qs = [q('w1', 'P1', 1), q('w2', 'P2', 1), q('w3', 'P3', 1), q('r1', 'P1', 2), q('r2', 'P2', 2), q('r3', 'P3', 2)];
    const b = buildKnockout('A', qs, DEFAULT_LEGS.A, 0);
    const r1 = b.matches.filter((m) => m.round === 1);
    expect(r1).toHaveLength(2);
    const inR1 = r1.flatMap((m) => [m.player1, m.player2]);
    expect(inR1).not.toContain('w1');
    expect(inR1).not.toContain('w2');
    // De bye-spelers staan al in ronde 2.
    const r2 = b.matches.filter((m) => m.round === 2).flatMap((m) => [m.player1, m.player2]);
    expect(r2).toEqual(expect.arrayContaining(['w1', 'w2']));
  });

  it('zet poulegenoten niet tegen elkaar in ronde 1 en in verschillende helften', () => {
    const qs = [
      q('w1', 'P1', 1), q('w2', 'P2', 1), q('w3', 'P3', 1), q('w4', 'P4', 1),
      q('r1', 'P1', 2), q('r2', 'P2', 2), q('r3', 'P3', 2), q('r4', 'P4', 2),
    ];
    const { slots, level } = placeQualifiers(qs);
    expect(level).toBe(3);
    for (let i = 0; i < 8; i += 2) expect(slots[i]?.poolId).not.toBe(slots[i + 1]?.poolId);
    for (const pool of ['P1', 'P2', 'P3', 'P4']) {
      const pos = slots.map((s, i) => (s?.poolId === pool ? i : -1)).filter((i) => i >= 0);
      expect(pos.filter((i) => i < 4)).toHaveLength(1);
    }
    // Winnaars behouden hun plaats.
    expect(slots[0]?.playerId).toBe('w1');
  });

  it('vermijdt poulegenoten in ronde 1 van een klein B-schema', () => {
    // 7 spelers (4+3), top 2 naar A: B = 3e en 4e van poule 1 en 3e van poule 2.
    const qs = [q('x3', 'P1', 3), q('y3', 'P2', 3), q('x4', 'P1', 4)];
    const b = buildKnockout('B', qs, DEFAULT_LEGS.B, 0);
    const r1 = b.matches.filter((m) => m.round === 1);
    expect(r1).toHaveLength(1);
    expect(r1[0].player1 === 'x4' || r1[0].player2 === 'x4').toBe(true);
    expect([r1[0].player1, r1[0].player2]).toContain('y3');
  });

  it('valt terug op de seedvolgorde als scheiding onmogelijk is', () => {
    const qs = [q('a', 'P1', 1), q('b', 'P1', 2), q('c', 'P1', 3), q('d', 'P1', 4)];
    const b = buildKnockout('A', qs, DEFAULT_LEGS.A, 0);
    expect(b.level).toBe(0);
    expect(b.matches).toHaveLength(3);
  });

  it('kent de juiste best-of per ronde', () => {
    const qs = Array.from({ length: 16 }, (_, i) => q(`p${i}`, `P${i}`, 1));
    const a = buildKnockout('A', qs, DEFAULT_LEGS.A, 0);
    const byRound = (r: number) => a.matches.filter((m) => m.round === r).map((m) => m.bestOf);
    expect(byRound(1)).toEqual(Array(8).fill(3));
    expect(byRound(2)).toEqual(Array(4).fill(3));
    expect(byRound(3)).toEqual([5, 5]);
    expect(byRound(4)).toEqual([5]);
    const bb = buildKnockout('B', qs, DEFAULT_LEGS.B, 0);
    expect(bb.matches.filter((m) => m.round === 3).map((m) => m.bestOf)).toEqual([3, 3]);
    expect(bb.matches.find((m) => m.round === 4)?.bestOf).toBe(5);
  });

  it('verwijst elke match naar de volgende', () => {
    const qs = Array.from({ length: 11 }, (_, i) => q(`p${i}`, `P${i % 4}`, Math.floor(i / 4) + 1));
    const b = buildKnockout('A', qs, DEFAULT_LEGS.A, 0);
    const ids = new Set(b.matches.map((m) => m.id));
    const final = b.matches.filter((m) => m.next === null);
    expect(final).toHaveLength(1);
    for (const m of b.matches) if (m.next) expect(ids.has(m.next.matchId)).toBe(true);
    expect(b.matches).toHaveLength(10);
  });

  it('heeft geen matchen met één of geen speler', () => {
    expect(buildKnockout('B', [q('a', 'P1', 3)], DEFAULT_LEGS.B, 0).matches).toEqual([]);
    expect(buildKnockout('B', [], DEFAULT_LEGS.B, 0).matches).toEqual([]);
  });

  it('benoemt de rondes', () => {
    expect(roundName(4, 4)).toBe('Finale');
    expect(roundName(3, 4)).toBe('Halve finale');
    expect(roundName(2, 4)).toBe('Kwartfinale');
    expect(roundName(1, 4)).toBe('1/8 finale');
  });
});
