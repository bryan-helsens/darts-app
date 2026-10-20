/**
 * Fictieve demo-data: een seizoen met 25 spelers, gespeelde avonden
 * (gesimuleerd met de echte engine) en één geplande oefenavond met
 * voorinschrijvingen. Gebruikt door de knop "Demo-data laden" (admin) en door
 * de seed-generator (supabase/seed.sql).
 *
 * Alle id's beginnen met "de000000-", zodat de demo-data in één keer te
 * verwijderen is zonder echte gegevens te raken.
 */

import {
  createRng,
  DEFAULT_BEST_OF,
  DEFAULT_LEGS,
  DEFAULT_POINTS,
  DEFAULT_TIMING,
  defaultAdvance,
  eventPoints,
  seasonRanking,
  simulateEvening,
  standardSizes,
  type EventResultRow,
  type Match,
  type SimDisruption,
} from '../engine';
import { brusselsToUtc, thirdSaturday } from '../lib/time';

export const DEMO_ID_PREFIX = 'de000000-';
export const DEMO_PIN = '1234';

const NAMES: Array<[string, string | null]> = [
  ['Jan Peeters', 'The Hammer'],
  ['Kris Vermeulen', null],
  ['Sofie Claes', 'Sniper'],
  ['Bart De Smet', null],
  ['Pieter Maes', 'Bullseye'],
  ['Nathalie Willems', null],
  ['Tom Jacobs', null],
  ['Wim Goossens', 'Wimpie'],
  ['Els Mertens', null],
  ['Dirk Wouters', 'Double Dirk'],
  ['Koen Hermans', null],
  ['Lien Dubois', null],
  ['Geert Lambrechts', null],
  ['Ruben Vandamme', 'Robin Hood'],
  ['Hilde Verstraete', null],
  ['Stijn Desmet', null],
  ['Marc Van Acker', 'Marky'],
  ['Joke Coppens', null],
  ['Filip Declercq', null],
  ['Ann Vermeersch', null],
  ['Luc De Clercq', 'Lucky Luc'],
  ['Jonas Verhaeghe', null],
  ['Ilse Pauwels', null],
  ['Sam Van Damme', null],
  ['Ward Lievens', null],
];

const BOGEY = new Set([159, 162, 163, 165, 166, 168, 169]);

export function demoUuid(kind: number, n: number): string {
  return `${DEMO_ID_PREFIX}0000-4000-8${kind.toString(16).padStart(3, '0')}-${n.toString(16).padStart(12, '0')}`;
}

/** Rijen per tabel, met exact de kolomnamen uit de database. */
export interface DemoDataset {
  players: Array<{ id: string; name: string; nickname: string | null; created_at: string }>;
  player_contacts: Array<{ player_id: string; email: string; phone: string }>;
  seasons: Array<{ id: string; name: string; starts_on: string; ends_on: string; settings: Record<string, unknown> }>;
  events: Array<{
    id: string;
    season_id: string;
    event_date: string;
    status: 'gepland' | 'afgelopen';
    boards: number;
    main_board: number;
    start_time: string;
    registration_closes: string;
    rng_seed: string;
    started_at: string | null;
    knockout: { A: string[]; B: string[] } | null;
    finalized_at: string | null;
    settings: Record<string, unknown>;
    notes: string | null;
  }>;
  event_secrets: Array<{ event_id: string; scorer_pin: string }>;
  registrations: Array<{ event_id: string; player_id: string; preregistered: boolean; present: boolean; paid: boolean; withdrawn_at: string | null }>;
  pools: Array<{ event_id: string; id: string; label: string; position: number }>;
  pool_members: Array<{ event_id: string; pool_id: string; player_id: string; seed: number }>;
  matches: Array<{
    id: string;
    event_id: string;
    code: string;
    stage: string;
    round: number;
    position: number;
    pool_id: string | null;
    player1_id: string | null;
    player2_id: string | null;
    best_of: number;
    legs1: number | null;
    legs2: number | null;
    walkover: boolean;
    next_code: string | null;
    next_slot: number | null;
    board: number | null;
    created_at: string;
    finished_at: string | null;
  }>;
  match_stats: Array<{ match_id: string; event_id: string; player_id: string; count_180: number; highest_finish: number | null; highest_score: number | null }>;
  event_log: Array<{ event_id: string; type: string; payload: Record<string, unknown>; created_at: string }>;
  event_results: Array<{
    event_id: string;
    player_id: string;
    place_from: number;
    place_to: number;
    placement_points: number;
    participation_points: number;
    points: number;
  }>;
}

export interface DemoOptions {
  seasonName: string;
  seasonStart: string;
  seasonEnd: string;
  /** Datums ("jjjj-mm-dd") van de gespeelde avonden, oudste eerst (max. 6). */
  playedDates: string[];
  /** Geplande oefenavond met voorinschrijvingen. */
  practice: { date: string; registrationCloses: string; notes: string };
  /** Tijdstip waarop de spelers "aangemaakt" werden. */
  createdAt: string;
}

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

export function buildDemoDataset(opts: DemoOptions): DemoDataset {
  const rng = createRng('sanapolis-demo');
  const players = NAMES.map(([name, nickname], i) => ({ id: demoUuid(1, i + 1), name, nickname, rating: 1250 + rng.int(550) }));
  const rating = new Map(players.map((p) => [p.id, p.rating]));
  const winProbability = (a: string, b: string) => 1 / (1 + 10 ** (((rating.get(b) ?? 1500) - (rating.get(a) ?? 1500)) / 400));
  const seasonId = demoUuid(2, 1);

  const data: DemoDataset = {
    players: players.map((p) => ({ id: p.id, name: p.name, nickname: p.nickname, created_at: opts.createdAt })),
    player_contacts: players
      .filter((_, i) => i % 3 === 0)
      .map((p, i) => ({
        player_id: p.id,
        email: `${p.name.split(' ')[0].toLowerCase()}@voorbeeld.be`,
        phone: `0470 ${String(10 + i).padStart(2, '0')} ${String(20 + i)} ${String(30 + i)}`,
      })),
    seasons: [
      { id: seasonId, name: opts.seasonName, starts_on: opts.seasonStart, ends_on: opts.seasonEnd, settings: { bestOf: { ...DEFAULT_BEST_OF, of: 11 } } },
    ],
    events: [],
    event_secrets: [],
    registrations: [],
    pools: [],
    pool_members: [],
    matches: [],
    match_stats: [],
    event_log: [],
    event_results: [],
  };

  const results: EventResultRow[] = [];
  const allMatches: Match[] = [];
  const boardsPerEvent = [5, 6, 6, 6, 6, 7];

  opts.playedDates.slice(0, 6).forEach((date, e) => {
    const eventId = demoUuid(3, e + 1);
    const start = brusselsToUtc(date, '19:00');
    const ranking = seasonRanking(results, allMatches, DEFAULT_BEST_OF, seasonId);
    const rankOf = new Map(ranking.map((r) => [r.playerId, r.position]));
    // Vaste kern plus wisselende spelers: 12 tot 22 aanwezigen.
    const count = 12 + rng.int(11);
    const attending = rng.shuffle(players).slice(0, count);
    const sizes = standardSizes(count);
    const advance = defaultAdvance(sizes);
    const boards = boardsPerEvent[e];
    const disruptions: SimDisruption[] = [];
    if (e === 2) disruptions.push({ type: 'withdraw', atMinutes: 70, playerId: attending[3].id });
    if (e === 4) disruptions.push({ type: 'boards', atMinutes: 90, boards: [1, 2, 3, 4, 5] });

    const sim = simulateEvening({
      players: attending.map((p) => ({ id: p.id, seedRank: rankOf.get(p.id) ?? null })),
      sizes,
      advance,
      boards,
      start,
      seed: eventId,
      disruptions,
      winProbability,
    });
    const codeToUuid = new Map(sim.matches.map((m, i) => [m.id, demoUuid(16 + e, i + 1)]));

    data.events.push({
      id: eventId,
      season_id: seasonId,
      event_date: date,
      status: 'afgelopen',
      boards: disruptions.some((d) => d.type === 'boards') ? 5 : boards,
      main_board: 1,
      start_time: '19:00',
      registration_closes: '18:30',
      rng_seed: eventId,
      started_at: iso(start),
      knockout: sim.participants,
      finalized_at: iso(sim.end + 10 * 60_000),
      settings: {
        tournament: {
          layoutId: sizes.join('-'),
          sizes,
          advance,
          legs: DEFAULT_LEGS,
          timing: DEFAULT_TIMING,
          boards: Array.from({ length: boards }, (_, i) => i + 1),
          mainBoard: 1,
          holdFinal: true,
        },
      },
      notes: e === 2 ? 'Eén speler gaf op tijdens de poules.' : e === 4 ? 'Bord 6 viel uit om 20u30.' : null,
    });
    data.event_secrets.push({ event_id: eventId, scorer_pin: DEMO_PIN });
    for (const p of attending) {
      const w = disruptions.find((d) => d.type === 'withdraw' && d.playerId === p.id);
      data.registrations.push({
        event_id: eventId,
        player_id: p.id,
        preregistered: rng.next() < 0.4,
        present: true,
        paid: true,
        withdrawn_at: w ? iso(start + w.atMinutes * 60_000) : null,
      });
    }
    sim.pools.forEach((p, i) => {
      data.pools.push({ event_id: eventId, id: p.id, label: p.label, position: i + 1 });
      p.playerIds.forEach((id, j) => data.pool_members.push({ event_id: eventId, pool_id: p.id, player_id: id, seed: j + 1 }));
    });
    for (const m of sim.matches) {
      data.matches.push({
        id: codeToUuid.get(m.id) as string,
        event_id: eventId,
        code: m.id,
        stage: m.stage,
        round: m.round,
        position: m.position,
        pool_id: m.poolId,
        player1_id: m.player1,
        player2_id: m.player2,
        best_of: m.bestOf,
        legs1: m.legs1,
        legs2: m.legs2,
        walkover: m.walkover,
        next_code: m.next?.matchId ?? null,
        next_slot: m.next?.slot ?? null,
        board: m.board,
        created_at: iso(m.createdAt) as string,
        finished_at: iso(m.finishedAt),
      });
    }
    for (const m of sim.matches) {
      if (m.walkover) continue;
      for (const p of [m.player1, m.player2] as string[]) {
        const n180 = rng.next() < 0.12 ? (rng.next() < 0.2 ? 2 : 1) : 0;
        let finish: number | null = null;
        if (m.winner === p && rng.next() < 0.12) {
          finish = 100 + rng.int(71);
          while (BOGEY.has(finish)) finish--;
        }
        if (n180 > 0 || finish !== null) {
          data.match_stats.push({
            match_id: codeToUuid.get(m.id) as string,
            event_id: eventId,
            player_id: p,
            count_180: n180,
            highest_finish: finish,
            highest_score: n180 > 0 ? 180 : 100 + rng.int(80),
          });
        }
      }
    }
    for (const d of disruptions) {
      const at = iso(start + d.atMinutes * 60_000) as string;
      if (d.type === 'boards') data.event_log.push({ event_id: eventId, type: 'boards', payload: { boards: d.boards }, created_at: at });
      else data.event_log.push({ event_id: eventId, type: 'withdraw', payload: { player_id: d.playerId }, created_at: at });
    }
    for (const key of sim.acceptedLots) {
      data.event_log.push({ event_id: eventId, type: 'lot', payload: { key }, created_at: iso(sim.knockoutGeneratedAt) as string });
    }
    for (const p of eventPoints(sim.placements, DEFAULT_POINTS)) {
      data.event_results.push({
        event_id: eventId,
        player_id: p.playerId,
        place_from: p.placeFrom,
        place_to: p.placeTo,
        placement_points: p.placementPoints,
        participation_points: p.participationPoints,
        points: p.total,
      });
      results.push({ eventId, playerId: p.playerId, placeFrom: p.placeFrom, placeTo: p.placeTo, points: p.total });
    }
    allMatches.push(...sim.matches);
  });

  // Geplande oefenavond met voorinschrijvingen, om de avondflow uit te proberen.
  const practice = demoUuid(3, 99);
  data.events.push({
    id: practice,
    season_id: seasonId,
    event_date: opts.practice.date,
    status: 'gepland',
    boards: 6,
    main_board: 1,
    start_time: '19:00',
    registration_closes: opts.practice.registrationCloses,
    rng_seed: practice,
    started_at: null,
    knockout: null,
    finalized_at: null,
    settings: {},
    notes: opts.practice.notes,
  });
  data.event_secrets.push({ event_id: practice, scorer_pin: DEMO_PIN });
  for (const p of rng.shuffle(players).slice(0, 16)) {
    data.registrations.push({ event_id: practice, player_id: p.id, preregistered: true, present: false, paid: false, withdrawn_at: null });
  }
  return data;
}

/** De laatste 6 derde zaterdagen vóór `today`, oudste eerst. */
export function previousThirdSaturdays(today: string, count = 6): string[] {
  const out: string[] = [];
  let year = Number(today.slice(0, 4));
  let month = Number(today.slice(5, 7));
  while (out.length < count) {
    const date = thirdSaturday(year, month);
    if (date < today) out.unshift(date);
    month--;
    if (month === 0) {
      month = 12;
      year--;
    }
  }
  return out;
}

/** Demo-data rond vandaag: de vorige 6 speelavonden en een oefenavond vandaag. */
export function demoOptionsForToday(today: string): DemoOptions {
  const played = previousThirdSaturdays(today);
  return {
    seasonName: 'Demoseizoen',
    seasonStart: played[0],
    seasonEnd: `${today.slice(0, 4)}-12-31`,
    playedDates: played,
    practice: { date: today, registrationCloses: '23:59', notes: 'Oefenavond met demo-data (pin 1234).' },
    createdAt: new Date(brusselsToUtc(played[0], '12:00') - 86_400_000).toISOString(),
  };
}
