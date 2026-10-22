/**
 * Realistische legs genereren (voor de demo-data en de tests). Alles loopt via
 * `applyVisit`, dus elke gegenereerde leg is geldig volgens dezelfde regels.
 */

import { checkoutOptions } from './checkout';
import type { Rng } from './rng';
import { applyVisit, isPossibleScore, legState, newLeg, type Leg, type Slot } from './x01';

const TYPICAL = [26, 41, 45, 45, 55, 60, 60, 60, 81, 85, 85, 95, 100, 100, 121, 140, 180];

/** Een leg die `winner` wint; de verliezer gooit nooit uit. */
export function simulateLeg(rng: Rng, starter: Slot, winner: Slot): Leg {
  let leg = newLeg(starter);
  for (let guard = 0; guard < 300; guard++) {
    const state = legState(leg);
    const slot = state.toThrow;
    const rest = state.remaining[slot - 1];
    const options = checkoutOptions(rest);

    if (slot === winner && options.length > 0 && (rng.next() < 0.45 || guard > 40)) {
      const outcome = applyVisit(leg, { score: rest, checkoutDarts: rng.pick(options) });
      if (outcome.kind !== 'won') throw new Error(`simulateLeg: uitgooi ${rest} mislukt`);
      return outcome.leg;
    }
    // Af en toe een bust onder de 60.
    if (rest <= 60 && rng.next() < 0.08) {
      const outcome = applyVisit(leg, { bust: true });
      if (outcome.kind === 'bust') {
        leg = outcome.leg;
        continue;
      }
    }
    let score = rest > 170 ? rng.pick(TYPICAL) : rng.int(Math.max(1, Math.min(rest - 2, 100)) + 1);
    // Nooit uitgooien of busten met een gewone beurt: altijd minstens 2 over.
    while (score > rest - 2 || !isPossibleScore(score)) score--;
    const outcome = applyVisit(leg, { score: Math.max(0, score) });
    if (outcome.kind !== 'scored') throw new Error(`simulateLeg: onverwachte uitkomst ${outcome.kind}`);
    leg = outcome.leg;
  }
  throw new Error('simulateLeg: leg niet uitgespeeld');
}
