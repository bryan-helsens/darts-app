import { describe, expect, it } from 'vitest';
import { formatPlace } from './placements';
import { eventPoints, placementPoints, validatePointsTable } from './points';
import { DEFAULT_POINTS } from './settings';
import { simulateEvening } from './simulate';

describe('eindplaatsen en punten', () => {
  it('volgt de standaard puntentabel', () => {
    const t = DEFAULT_POINTS.table;
    expect([1, 2, 3, 4, 5, 8, 9, 16, 17, 40].map((p) => placementPoints(p, t))).toEqual([25, 20, 15, 15, 10, 10, 6, 6, 3, 3]);
  });

  it('geeft bij een gedeelde plaats de punten van de hoogste plaats', () => {
    const [p] = eventPoints([{ playerId: 'x', from: 15, to: 18, stage: 'B' }], DEFAULT_POINTS);
    expect(p).toMatchObject({ placementPoints: 6, participationPoints: 2, total: 8 });
  });

  it('maakt het B-schema de moeite waard (voorbeeld met 12 spelers)', () => {
    const players = Array.from({ length: 12 }, (_, i) => ({ id: `p${i + 1}` }));
    const r = simulateEvening({ players, boards: 6, start: 0, seed: 'twaalf' });
    expect(r.participants.A).toHaveLength(6);
    expect(r.participants.B).toHaveLength(6);
    const bFinal = r.matches.find((m) => m.stage === 'B' && m.next === null);
    const bWinner = r.placements.find((p) => p.playerId === bFinal?.winner);
    expect(bWinner).toMatchObject({ from: 7, to: 7 });
    const pts = eventPoints(r.placements, DEFAULT_POINTS).find((p) => p.playerId === bFinal?.winner);
    expect(pts?.total).toBe(12);
    // A: 1, 2, 3–4, 5–6; B: 7, 8, 9–10, 11–12.
    expect([...new Set(r.placements.map((p) => formatPlace(p.from, p.to)))]).toEqual(['1', '2', '3–4', '5–6', '7', '8', '9–10', '11–12']);
  });

  it('controleert de puntentabel', () => {
    expect(validatePointsTable(DEFAULT_POINTS.table)).toBeNull();
    expect(validatePointsTable([{ from: 1, to: 1, points: 10 }])).not.toBeNull();
    expect(validatePointsTable([{ from: 2, to: null, points: 10 }])).not.toBeNull();
    expect(validatePointsTable([{ from: 1, to: null, points: -1 }])).not.toBeNull();
  });
});
