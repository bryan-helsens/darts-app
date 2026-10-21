import { describe, expect, it } from 'vitest';
import { buildElimination, buildKnockout, DEFAULT_LEGS } from '../../engine';
import { bracketLayout } from './bracketLayout';

const seeds = (n: number) => Array.from({ length: n }, (_, i) => `s${i + 1}`);

describe('schema-indeling', () => {
  it('A-schema: plaatsen per ronde met byes, rondenamen', () => {
    const qualifiers = seeds(6).map((playerId, i) => ({ playerId, poolId: `P${i}`, poolPosition: 1, withdrawn: false }));
    const { matches } = buildKnockout('A', qualifiers, DEFAULT_LEGS.A, 0);
    const cols = bracketLayout('A', matches);
    expect(cols.map((c) => [c.name, c.slots.length, c.slots.filter(Boolean).length])).toEqual([
      ['Kwartfinale', 4, 2],
      ['Halve finale', 2, 2],
      ['Finale', 1, 1],
    ]);
  });

  it('verliezersschema: twee rondes per niveau, lege kolommen vallen weg', () => {
    const { matches } = buildElimination('double_elim', seeds(16), DEFAULT_LEGS, 0);
    expect(bracketLayout('L', matches).map((c) => [c.round, c.slots.length])).toEqual([
      [1, 4],
      [2, 4],
      [3, 2],
      [4, 2],
      [5, 1],
      [6, 1],
    ]);
    expect(bracketLayout('L', matches).at(-1)?.name).toBe('Verliezersfinale');
    expect(bracketLayout('GF', matches).map((c) => c.name)).toEqual(['Grote finale']);
    // 5 spelers: W1 heeft één echte match, L1 enkel lege plaatsen → kolom valt weg.
    const five = buildElimination('double_elim', seeds(5), DEFAULT_LEGS, 0).matches;
    expect(bracketLayout('L', five).map((c) => c.round)).not.toContain(1);
    expect(bracketLayout('W', five)[0].slots.filter(Boolean)).toHaveLength(1);
  });

  it('plate: eigen rondenamen', () => {
    const { matches } = buildElimination('single_elim_plate', seeds(12), DEFAULT_LEGS, 0);
    expect(bracketLayout('P', matches).map((c) => c.name)).toEqual(['Plate ronde 1', 'Plate halve finale', 'Plate-finale']);
    expect(bracketLayout('M', matches).at(-1)?.name).toBe('Finale');
  });
});
