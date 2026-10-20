/**
 * Volledige matrix: elke combinatie van spelers (6–40) en borden (4–8),
 * telkens een gewone avond en een avond met verstoringen (opgaves, borden
 * erbij en eraf, barrages spelen of loten). Na elke avond worden alle
 * invarianten gecontroleerd.
 */

import { describe, expect, it } from 'vitest';
import {
  createRng,
  defaultAdvance,
  layoutOptions,
  simulateEvening,
  standardSizes,
  type SimulationOptions,
} from '../../src/engine';
import { checkAll } from './invariants';

export const START = Date.UTC(2026, 10, 21, 18, 0); // 21/11/2026 19u00 in Brussel

export function buildOptions(n: number, boards: number, variant: 'plain' | 'disrupt', seed: string, sizes?: number[]) {
  const rng = createRng(`${n}-${boards}-${seed}`);
  const players = Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, seedRank: rng.next() < 0.7 ? i + 1 : null }));
  const poolSizes = sizes ?? standardSizes(n);
  const advance = defaultAdvance(poolSizes);
  const opts: SimulationOptions = { players, boards, start: START, seed: `${n}-${boards}-${variant}-${seed}`, sizes: poolSizes, advance };
  if (variant === 'disrupt') {
    // Bord 2 valt weg (desnoods komt bord 9 erbij), later komen er borden bij.
    const fewer = Array.from({ length: Math.max(4, boards - 1) }, (_, i) => i + 1)
      .filter((b) => b !== 2)
      .concat(boards > 4 ? [] : [9]);
    opts.disruptions = [
      { type: 'withdraw', atMinutes: 35, playerId: rng.pick(players).id },
      { type: 'boards', atMinutes: 50, boards: fewer },
      { type: 'boards', atMinutes: 120, boards: Array.from({ length: Math.min(8, boards + 1) }, (_, i) => i + 1) },
      { type: 'withdraw', atMinutes: 170, playerId: rng.pick(players).id },
    ];
    opts.barragePolicy = seed === 's1' ? 'play' : 'lot';
  }
  return { opts, sizes: poolSizes, advance };
}

export function runMatrix(fromPlayers: number, toPlayers: number) {
  for (let n = fromPlayers; n <= toPlayers; n++) {
    describe(`${n} spelers`, () => {
      for (let boards = 4; boards <= 8; boards++) {
        for (const variant of ['plain', 'disrupt'] as const) {
          it(`${boards} borden, ${variant === 'plain' ? 'gewone avond' : 'met verstoringen'}`, () => {
            for (const seed of ['s1', 's2']) {
              const ctx = buildOptions(n, boards, variant, seed);
              const result = simulateEvening(ctx.opts);
              expect(checkAll({ ...ctx, result }), `seed ${seed}`).toEqual([]);
            }
          });
        }
      }
      it('alle alternatieve poule-indelingen (6 borden)', () => {
        for (const layout of layoutOptions(n)) {
          const ctx = buildOptions(n, 6, 'plain', 'layout', layout.sizes);
          const result = simulateEvening(ctx.opts);
          expect(checkAll({ ...ctx, result }), layout.label).toEqual([]);
        }
      });
    });
  }
}
