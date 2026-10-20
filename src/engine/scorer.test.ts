import { describe, expect, it } from 'vitest';
import { open, played } from '../../tests/engine/helpers';
import type { Assignment, ScheduleResult } from './scheduler';
import { suggestScorers } from './scorer';

const MIN = 60_000;

function assignment(matchId: string, board: number, start: number, end: number | null, extra: Partial<Assignment> = {}): Assignment {
  return { matchId, board, start, end, predicted: false, interrupted: false, rested: true, restedAlternative: false, ...extra };
}

function replay(boards: Array<[number, string | null]>, assignments: Assignment[], at = 60 * MIN): ScheduleResult {
  return {
    at,
    boards: boards.map(([board, matchId]) => ({ board, active: true, matchId, since: matchId ? at - 5 * MIN : null })),
    queue: [],
    held: [],
    assignments,
    end: null,
  };
}

describe('schrijver-suggestie', () => {
  it('kiest de verliezer van de vorige match op hetzelfde bord', () => {
    const matches = [
      played('a', 'b', 2, 0, { id: 'm1', finishedAt: 30 * MIN }),
      played('c', 'd', 2, 1, { id: 'm2', finishedAt: 40 * MIN }),
      open('m3', 'a', 'c'),
      open('m4', 'e', 'f'),
    ];
    const r = replay(
      [
        [1, 'm3'],
        [2, 'm4'],
      ],
      [assignment('m1', 1, 10 * MIN, 30 * MIN), assignment('m2', 2, 15 * MIN, 40 * MIN), assignment('m3', 1, 55 * MIN, null), assignment('m4', 2, 55 * MIN, null)],
    );
    const s = suggestScorers({ matches, replay: r, withdrawn: new Set(), seed: 'x' });
    expect(s.get(1)).toBe('b');
    expect(s.get(2)).toBe('d');
  });

  it('valt terug op de speler die het langst niet speelde als de verliezer niet vrij is', () => {
    const matches = [
      played('a', 'b', 2, 0, { id: 'm1', finishedAt: 30 * MIN }),
      played('c', 'd', 2, 0, { id: 'm2', finishedAt: 20 * MIN }),
      played('e', 'f', 2, 0, { id: 'm3', finishedAt: 45 * MIN }),
      open('m4', 'b', 'c'),
    ];
    // Verliezer b speelt nu zelf op bord 1; d is het langst vrij.
    const r = replay([[1, 'm4']], [assignment('m1', 1, 10 * MIN, 30 * MIN), assignment('m4', 1, 55 * MIN, null)]);
    expect(suggestScorers({ matches, replay: r, withdrawn: new Set(), seed: 'x' }).get(1)).toBe('d');
  });

  it('stelt niemand voor die opgaf of al schrijver is, en gebruikt wie straks elders speelt enkel als laatste keuze', () => {
    const matches = [
      played('a', 'b', 2, 0, { id: 'm1', finishedAt: 30 * MIN }),
      played('c', 'd', 2, 0, { id: 'm2', finishedAt: 31 * MIN }),
      played('e', 'f', 2, 0, { id: 'm3', finishedAt: 32 * MIN }),
      open('m4', 'a', 'c'),
      open('m5', 'e', 'g'),
      open('m6', 'd', 'h'),
    ];
    const r = replay(
      [
        [1, 'm4'],
        [2, 'm5'],
      ],
      [assignment('m1', 1, 10 * MIN, 30 * MIN), assignment('m2', 2, 10 * MIN, 31 * MIN), assignment('m4', 1, 55 * MIN, null), assignment('m5', 2, 55 * MIN, null)],
    );
    const s = suggestScorers({
      matches,
      replay: r,
      upcoming: new Map([[1, { matchId: 'm6' }]]),
      withdrawn: new Set(['b']),
      seed: 'x',
    });
    // b gaf op; d en h spelen straks op bord 1. Bord 1 → f (de enige die helemaal vrij is).
    // Bord 2 → d: verliezer van de vorige match daar; speelt straks wel, maar op een ander bord.
    expect(s.get(1)).toBe('f');
    expect(s.get(2)).toBe('d');
  });

  it('stelt nooit iemand voor die de volgende match op hetzelfde bord speelt', () => {
    const matches = [played('a', 'b', 2, 0, { id: 'm1', finishedAt: 30 * MIN }), open('m2', 'c', 'd'), open('m3', 'b', 'e')];
    const r = replay([[1, 'm2']], [assignment('m1', 1, 10 * MIN, 30 * MIN), assignment('m2', 1, 55 * MIN, null)]);
    const s = suggestScorers({ matches, replay: r, upcoming: new Map([[1, { matchId: 'm3' }]]), withdrawn: new Set(), seed: 'x' });
    expect(s.get(1)).toBe('a');
  });

  it('negeert een walk-over en is deterministisch', () => {
    const matches = [played('a', 'b', 2, 0, { id: 'm1', finishedAt: 30 * MIN, walkover: true }), open('m2', 'c', 'd'), open('m3', 'e', 'f')];
    const r = replay([[1, 'm2']], [assignment('m1', 1, 10 * MIN, 30 * MIN), assignment('m2', 1, 55 * MIN, null)]);
    const first = suggestScorers({ matches, replay: r, withdrawn: new Set(), seed: 'avond' }).get(1);
    // Niemand van de vrije spelers speelde al echt: loting tussen a, b, e en f, altijd dezelfde.
    expect(['a', 'b', 'e', 'f']).toContain(first);
    expect(suggestScorers({ matches, replay: r, withdrawn: new Set(), seed: 'avond' }).get(1)).toBe(first);
  });
});
