import { describe, expect, it } from 'vitest';
import { bundleFor, SIM_START } from '../../tests/data/bundle';
import { simulateEvening, type Match } from '../engine';
import { buildEventView } from './eventView';
import { eventMessages, reminderMessage, START_WINDOW_MS } from './push';
import type { EventRow } from './rows';

const players = Array.from({ length: 12 }, (_, i) => ({ id: `p${i + 1}` }));
const sim = simulateEvening({ players, boards: 4, start: SIM_START, seed: 'push', sizes: [4, 4, 4], advance: 2, barragePolicy: 'lot' });
const name = (id: string | null | undefined) => (id ? id.toUpperCase() : '?');

/** De avond op tijdstip `at`: alles wat daarvoor gespeeld werd, met uitslag. */
function viewAt(at: number, extra: Partial<EventRow> = {}) {
  const pool = sim.matches
    .filter((m) => m.stage === 'pool')
    .map((m): Match => (m.finishedAt !== null && m.finishedAt <= at ? m : { ...m, legs1: null, legs2: null, winner: null, finishedAt: null }));
  const bundle = bundleFor(pool, { settings: { tournament: { sizes: [4, 4, 4], advance: 2, boards: [1, 2, 3, 4], mainBoard: 1, holdFinal: true } }, ...extra }, sim);
  return buildEventView(bundle, at);
}

describe('pushmeldingen tijdens de avond', () => {
  it('bij de start: per bord beide spelers, de schrijver en wie straks speelt', () => {
    const view = viewAt(SIM_START + 60_000);
    const messages = eventMessages(view, name);
    const starts = messages.filter((m) => m.kind === 'start');
    const onBoards = (view.replay?.boards ?? []).filter((b) => b.matchId);
    expect(starts).toHaveLength(onBoards.length * 2);
    const first = view.byCode.get(onBoards[0].matchId as string) as Match;
    const mine = starts.find((m) => m.playerId === first.player1);
    expect(mine).toMatchObject({ title: `Bord ${onBoards[0].board}: jouw match begint`, url: '/avond/e1' });
    expect(mine?.body).toContain(`Tegen ${name(first.player2)}`);
    // Elke sleutel maar één keer.
    expect(new Set(messages.map((m) => m.key)).size).toBe(messages.length);
    // Schrijvers spelen zelf niet op dat moment.
    const playing = new Set(onBoards.flatMap((b) => [view.byCode.get(b.matchId as string)?.player1, view.byCode.get(b.matchId as string)?.player2]));
    for (const s of messages.filter((m) => m.kind === 'scorer')) expect(playing.has(s.playerId as string)).toBe(false);
    // Straks: na de lopende match op een bezet bord, niet wie nu al speelt in die match.
    const next = messages.filter((m) => m.kind === 'next');
    expect(next.length).toBeGreaterThan(0);
    expect(next[0].body).toMatch(/^Jij tegen P\d+, na de lopende match\. Rond \d\du\d\d\.$/);
  });

  it('een match die al lang bezig is, wordt niet meer als "begint" gemeld', () => {
    const later = SIM_START + START_WINDOW_MS + 5 * 60_000;
    const view = viewAt(later);
    for (const b of view.replay?.boards ?? []) {
      if (!b.matchId || b.since === null) continue;
      const started = eventMessages(view, name).some((m) => m.kind === 'start' && m.key.startsWith(`start:${b.matchId}:`));
      expect(started).toBe(later - b.since <= START_WINDOW_MS);
    }
  });

  it('niets voor een avond die niet bezig is', () => {
    expect(eventMessages(viewAt(SIM_START + 60_000, { status: 'afgelopen' }), name)).toEqual([]);
  });
});

describe('herinnering op de dag zelf', () => {
  const event = { id: 'e9', status: 'gepland', kind: 'regulier', event_date: '2026-11-21', start_time: '19:00:00', registration_closes: '18:30:00' } as EventRow;
  const at = (hhmm: string, date = '2026-11-21') => Date.parse(`${date}T${hhmm}:00+01:00`);

  it('vanaf 12u00 tot het sluitingsuur, enkel voor een geplande gewone avond van vandaag', () => {
    expect(reminderMessage(event, at('12:30'))).toMatchObject({
      key: 'reminder:e9',
      playerId: null,
      title: 'Vanavond darts',
      body: 'Start om 19u00 in Brasserie ’t Oud Sanatorium. Inschrijven kan tot 18u30.',
      url: '/inschrijven/e9',
    });
    expect(reminderMessage(event, at('11:59'))).toBeNull();
    expect(reminderMessage(event, at('18:30'))).toBeNull();
    expect(reminderMessage(event, at('12:30', '2026-11-20'))).toBeNull();
    expect(reminderMessage({ ...event, kind: 'masters' }, at('12:30'))).toBeNull();
    expect(reminderMessage({ ...event, status: 'bezig' }, at('12:30'))).toBeNull();
  });
});
