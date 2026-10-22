/**
 * Statistieken uit 501 per beurt over meerdere matchen (bv. een seizoen):
 * gemiddelde, gemiddelde over de eerste 9 darts, 100+/140+/180, beste leg
 * (minste darts) en hoogste uitgooi. Puur.
 */

import { threeDartAverage, visitSlot, type Leg } from './x01';
import type { PlayerId } from './types';

export interface X01LegInput {
  leg: Leg;
  /** Speler 1 en speler 2 van de match. */
  players: readonly [PlayerId, PlayerId];
}

export interface X01PlayerTotals {
  legs: number;
  legsWon: number;
  darts: number;
  points: number;
  average: number | null;
  /** Eerste drie beurten per leg. */
  first9Darts: number;
  first9Points: number;
  first9Average: number | null;
  /** 100 t.e.m. 139. */
  count100: number;
  /** 140 t.e.m. 179. */
  count140: number;
  count180: number;
  /** Minste darts in een gewonnen leg. */
  bestLeg: number | null;
  highestFinish: number | null;
}

const empty = (): X01PlayerTotals => ({
  legs: 0,
  legsWon: 0,
  darts: 0,
  points: 0,
  average: null,
  first9Darts: 0,
  first9Points: 0,
  first9Average: null,
  count100: 0,
  count140: 0,
  count180: 0,
  bestLeg: null,
  highestFinish: null,
});

export function x01PlayerStats(legs: readonly X01LegInput[]): Map<PlayerId, X01PlayerTotals> {
  const out = new Map<PlayerId, X01PlayerTotals>();
  for (const { leg, players } of legs) {
    const perSlot: Array<{ darts: number; points: number; visits: number; first9Darts: number; first9Points: number }> = [
      { darts: 0, points: 0, visits: 0, first9Darts: 0, first9Points: 0 },
      { darts: 0, points: 0, visits: 0, first9Darts: 0, first9Points: 0 },
    ];
    const rest = [501, 501];
    let winner: 0 | 1 | null = null;
    leg.visits.forEach((v, i) => {
      const k = (visitSlot(leg.starter, i) - 1) as 0 | 1;
      const s = perSlot[k];
      const points = v.bust ? 0 : v.score;
      rest[k] -= points;
      const finished = !v.bust && rest[k] === 0;
      const darts = finished && leg.checkoutDarts ? leg.checkoutDarts : 3;
      s.darts += darts;
      s.points += points;
      if (s.visits < 3) {
        s.first9Darts += darts;
        s.first9Points += points;
      }
      s.visits++;
      const t = out.get(players[k]) ?? empty();
      if (!v.bust) {
        if (v.score === 180) t.count180++;
        else if (v.score >= 140) t.count140++;
        else if (v.score >= 100) t.count100++;
      }
      out.set(players[k], t);
      if (finished) winner = k;
    });
    perSlot.forEach((s, k) => {
      if (s.visits === 0) return;
      const t = out.get(players[k]) ?? empty();
      t.legs++;
      t.darts += s.darts;
      t.points += s.points;
      t.first9Darts += s.first9Darts;
      t.first9Points += s.first9Points;
      if (winner === k) {
        t.legsWon++;
        t.bestLeg = t.bestLeg === null ? s.darts : Math.min(t.bestLeg, s.darts);
        const finish = leg.visits[leg.visits.length - 1].score;
        t.highestFinish = Math.max(t.highestFinish ?? 0, finish);
      }
      out.set(players[k], t);
    });
  }
  for (const t of out.values()) {
    t.average = threeDartAverage({ darts: t.darts, points: t.points });
    t.first9Average = threeDartAverage({ darts: t.first9Darts, points: t.first9Points });
  }
  return out;
}
