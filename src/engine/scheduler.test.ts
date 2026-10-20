import { describe, expect, it } from 'vitest';
import { MIN, open } from '../../tests/engine/helpers';
import { forecastSchedule, replaySchedule, upcomingByBoard, type ScheduleConfig, type ScheduleLogEntry } from './scheduler';
import type { Match } from './types';

const config = (boards: number[], extra: Partial<ScheduleConfig> = {}): ScheduleConfig => ({
  start: 0,
  boards,
  mainBoard: 1,
  holdFinal: true,
  minRestMs: 5 * MIN,
  ...extra,
});
const done = (m: Match, at: number): Match => ({ ...m, legs1: 2, legs2: 0, winner: m.player1, finishedAt: at });
const onBoard = (r: ReturnType<typeof replaySchedule>) => Object.fromEntries(r.boards.map((b) => [b.board, b.matchId]));

describe('bordplanning (replay)', () => {
  const m1 = open('m1', 'a', 'b', { position: 0 });
  const m2 = open('m2', 'c', 'd', { position: 1 });
  const m3 = open('m3', 'e', 'f', { position: 2 });

  it('vult alle borden en houdt een wachtrij bij', () => {
    const r = replaySchedule([m1, m2, m3], [], config([1, 2]), 0);
    expect(onBoard(r)).toEqual({ 1: 'm1', 2: 'm2' });
    expect(r.queue).toEqual(['m3']);
  });

  it('geeft een vrijgekomen bord aan de volgende match', () => {
    const r = replaySchedule([done(m1, 10 * MIN), m2, m3], [], config([1, 2]), 12 * MIN);
    expect(onBoard(r)).toEqual({ 1: 'm3', 2: 'm2' });
    expect(r.assignments.find((a) => a.matchId === 'm1')).toMatchObject({ board: 1, start: 0, end: 10 * MIN });
  });

  it('laat spelers liefst niet twee matchen na elkaar spelen', () => {
    const a1 = open('a1', 'a', 'b', { position: 0 });
    const a2 = open('a2', 'a', 'c', { position: 1 });
    const a3 = open('a3', 'd', 'e', { position: 2 });
    const r = replaySchedule([done(a1, 10 * MIN), a2, a3], [], config([1]), 11 * MIN);
    expect(onBoard(r)).toEqual({ 1: 'a3' });
    // Zonder alternatief speelt a wel meteen opnieuw (en dat wordt gemarkeerd).
    const r2 = replaySchedule([done(a1, 10 * MIN), a2], [], config([1]), 11 * MIN);
    expect(onBoard(r2)).toEqual({ 1: 'a2' });
    expect(r2.assignments.at(-1)).toMatchObject({ rested: false, restedAlternative: false });
  });

  it('zet nooit een speler op twee borden tegelijk', () => {
    const x1 = open('x1', 'a', 'b', { position: 0 });
    const x2 = open('x2', 'a', 'c', { position: 1 });
    const r = replaySchedule([x1, x2], [], config([1, 2]), 0);
    expect(onBoard(r)).toEqual({ 1: 'x1', 2: null });
  });

  it('gebruikt een weggenomen bord niet meer, maar laat de lopende match uitspelen', () => {
    const log: ScheduleLogEntry[] = [{ type: 'boards', at: 5 * MIN, boards: [1] }];
    const during = replaySchedule([m1, m2, m3], log, config([1, 2]), 6 * MIN);
    expect(onBoard(during)).toEqual({ 1: 'm1', 2: 'm2' });
    expect(during.boards.find((b) => b.board === 2)?.active).toBe(false);
    const after = replaySchedule([m1, done(m2, 10 * MIN), m3], log, config([1, 2]), 11 * MIN);
    expect(onBoard(after)).toEqual({ 1: 'm1' });
    expect(after.queue).toEqual(['m3']);
  });

  it('neemt een extra bord meteen in gebruik', () => {
    const log: ScheduleLogEntry[] = [{ type: 'boards', at: 5 * MIN, boards: [1, 2, 3] }];
    const r = replaySchedule([m1, m2, m3], log, config([1, 2]), 6 * MIN);
    expect(onBoard(r)).toEqual({ 1: 'm1', 2: 'm2', 3: 'm3' });
    expect(r.assignments.find((a) => a.matchId === 'm3')?.start).toBe(5 * MIN);
  });

  it('volgt manuele toewijzingen en uitstel', () => {
    const log: ScheduleLogEntry[] = [
      { type: 'hold', at: 1 * MIN, matchId: 'm1' },
      { type: 'assign', at: 2 * MIN, matchId: 'm1', board: 2 },
    ];
    const r = replaySchedule([m1, m2, m3], log, config([1, 2]), 3 * MIN);
    // m1 uitgesteld → bord 1 krijgt m3; daarna m1 manueel op bord 2 → m2 terug in de wachtrij.
    expect(onBoard(r)).toEqual({ 1: 'm3', 2: 'm1' });
    expect(r.queue).toEqual(['m2']);
    const held = replaySchedule([m1, m2, m3], [log[0]], config([1, 2]), 3 * MIN);
    expect(held.held).toEqual(['m1']);
    const released = replaySchedule([m1, m2, m3], [log[0], { type: 'release', at: 2 * MIN, matchId: 'm1' }], config([1, 2]), 3 * MIN);
    expect(released.queue).toEqual(['m1']);
  });

  it('speelt de A-finale als laatste op het hoofdbord', () => {
    const final = open('A-F', 'a', 'b', { stage: 'A', round: 1, poolId: null });
    const bFinal = open('B-F', 'c', 'd', { stage: 'B', round: 1, poolId: null });
    const cfg = config([1, 2, 3], { mainBoard: 3 });
    const r = replaySchedule([final, bFinal], [], cfg, 0);
    expect(onBoard(r)).toEqual({ 1: 'B-F', 2: null, 3: null });
    const later = replaySchedule([final, done(bFinal, 20 * MIN)], [], cfg, 21 * MIN);
    expect(onBoard(later)).toEqual({ 1: null, 2: null, 3: 'A-F' });
    // Zonder wachten start de A-finale meteen, maar enkel op het hoofdbord.
    const direct = replaySchedule([final, bFinal], [], { ...cfg, holdFinal: false }, 0);
    expect(onBoard(direct)).toEqual({ 1: 'B-F', 2: null, 3: 'A-F' });
  });

  it('wacht op de vorige ronde in een KO-schema', () => {
    const sf1 = open('SF1', 'a', 'b', { stage: 'A', round: 1, poolId: null, next: { matchId: 'F', slot: 1 } });
    const sf2 = open('SF2', 'c', 'd', { stage: 'A', round: 1, poolId: null, next: { matchId: 'F', slot: 2 } });
    const f = open('F', 'a', null, { stage: 'A', round: 2, poolId: null });
    const r = replaySchedule([done(sf1, 10 * MIN), sf2, f], [], config([1, 2], { holdFinal: false }), 11 * MIN);
    expect(r.queue).toEqual([]);
    expect(onBoard(r)).toEqual({ 1: null, 2: 'SF2' });
  });

  it('geeft op elk toestel dezelfde planning, ongeacht de volgorde van de gegevens', () => {
    const ms = [m3, done(m1, 10 * MIN), m2];
    const a = replaySchedule(ms, [], config([1, 2]), 15 * MIN);
    const b = replaySchedule([...ms].reverse(), [], config([1, 2]), 15 * MIN);
    expect(b).toEqual(a);
  });
});

describe('prognose', () => {
  it('voorspelt de eindtijd en wat er straks op elk bord komt', () => {
    const ms = ['a', 'b', 'c', 'd'].map((p, i) => open(`m${i}`, p, `${p}2`, { position: i }));
    const f = forecastSchedule(ms, [], config([1, 2]), 0, () => 10 * MIN);
    expect(f.end).toBe(20 * MIN);
    const next = upcomingByBoard(f, 0);
    expect(next.get(1)?.start).toBe(10 * MIN);
    expect(next.get(2)?.start).toBe(10 * MIN);
    // De toestand "nu" blijft die van de start.
    expect(f.boards.map((b) => b.matchId)).toEqual(['m0', 'm1']);
  });

  it('vertrekt van de werkelijke toestand', () => {
    const ms = [done(open('m0', 'a', 'b'), 4 * MIN), open('m1', 'c', 'd', { position: 1 }), open('m2', 'e', 'f', { position: 2 })];
    const f = forecastSchedule(ms, [], config([1, 2]), 6 * MIN, () => 10 * MIN);
    // m2 startte om 4 min op bord 1 en duurt 10 min; m1 liep sinds 0 → klaar om 10 min.
    expect(f.end).toBe(14 * MIN);
  });

  it('laat een uitgelopen match niet in het verleden eindigen', () => {
    const f = forecastSchedule([open('m0', 'a', 'b')], [], config([1]), 30 * MIN, () => 10 * MIN);
    expect(f.end).toBe(30 * MIN);
  });
});
