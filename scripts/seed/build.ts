/**
 * Bouwt seed-data: een fictief seizoen met 25 spelers en 6 gespeelde
 * speelavonden (gesimuleerd met de echte engine), plus één geplande avond met
 * voorinschrijvingen. Alle id's beginnen met "de000000-", zodat de demo-data
 * later makkelijk te verwijderen is (zie supabase/demo-cleanup.sql).
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
} from '../../src/engine';
import { brusselsToUtc, thirdSaturday } from '../../src/lib/time';

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

const SEASON_YEAR = 2026;
const PIN = '1234';

export function demoUuid(kind: number, n: number): string {
  return `de000000-0000-4000-8${kind.toString(16).padStart(3, '0')}-${n.toString(16).padStart(12, '0')}`;
}

const q = (v: unknown): string => {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return `'${String(v).replaceAll("'", "''")}'`;
};
const ts = (ms: number | null) => (ms === null ? 'null' : q(new Date(ms).toISOString()));
const json = (v: unknown) => `${q(JSON.stringify(v))}::jsonb`;

function insert(table: string, columns: string[], rows: unknown[][]): string {
  if (rows.length === 0) return '';
  const values = rows.map((r) => `  (${r.join(', ')})`).join(',\n');
  return `insert into public.${table} (${columns.join(', ')}) values\n${values};\n`;
}

const BOGEY = new Set([159, 162, 163, 165, 166, 168, 169]);

export function buildSeedSql(): string {
  const rng = createRng('sanapolis-demo');
  const players = NAMES.map(([name, nickname], i) => ({ id: demoUuid(1, i + 1), name, nickname, rating: 1250 + rng.int(550) }));
  const rating = new Map(players.map((p) => [p.id, p.rating]));
  const winProbability = (a: string, b: string) => 1 / (1 + 10 ** (((rating.get(b) ?? 1500) - (rating.get(a) ?? 1500)) / 400));
  const seasonId = demoUuid(2, 1);
  const out: string[] = [];

  out.push(`-- Demo-data voor Sanapolis Darts (gegenereerd door scripts/generate-seed.ts, niet met de hand aanpassen).
-- Laden: Supabase > SQL Editor > dit bestand plakken > Run. Verwijderen: supabase/demo-cleanup.sql.
begin;
select set_config('app.skip_audit', 'on', true);
select set_config('app.skip_advance', 'on', true);
`);
  out.push(insert('players', ['id', 'name', 'nickname', 'created_at'], players.map((p) => [q(p.id), q(p.name), q(p.nickname), ts(Date.UTC(2025, 11, 31))])));
  out.push(
    insert(
      'player_contacts',
      ['player_id', 'email', 'phone'],
      players
        .filter((_, i) => i % 3 === 0)
        .map((p, i) => [q(p.id), q(`${p.name.split(' ')[0].toLowerCase()}@voorbeeld.be`), q(`0470 ${String(10 + i).padStart(2, '0')} ${String(20 + i)} ${String(30 + i)}`)]),
    ),
  );
  out.push(
    insert('seasons', ['id', 'name', 'starts_on', 'ends_on', 'settings'], [
      [q(seasonId), q(`Demoseizoen ${SEASON_YEAR}`), q(`${SEASON_YEAR}-01-01`), q(`${SEASON_YEAR}-12-31`), json({ bestOf: { ...DEFAULT_BEST_OF, of: 11 } })],
    ]),
  );

  const results: EventResultRow[] = [];
  const allMatches: Match[] = [];
  const boardsPerEvent = [5, 6, 6, 6, 6, 7];

  for (let e = 0; e < 6; e++) {
    const eventId = demoUuid(3, e + 1);
    const date = thirdSaturday(SEASON_YEAR, e + 1);
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
      seed: `${eventId}`,
      disruptions,
      winProbability,
    });
    const codeToUuid = new Map(sim.matches.map((m, i) => [m.id, demoUuid(16 + e, i + 1)]));
    const config = {
      layoutId: sizes.join('-'),
      sizes,
      advance,
      legs: DEFAULT_LEGS,
      timing: DEFAULT_TIMING,
      boards: Array.from({ length: boards }, (_, i) => i + 1),
      mainBoard: 1,
      holdFinal: true,
    };

    out.push(`\n-- Speelavond ${e + 1}: ${date}, ${count} spelers, ${boards} borden\n`);
    out.push(
      insert(
        'events',
        ['id', 'season_id', 'event_date', 'status', 'boards', 'main_board', 'rng_seed', 'started_at', 'knockout', 'finalized_at', 'settings', 'notes'],
        [[
          q(eventId), q(seasonId), q(date), q('afgelopen'), String(disruptions.some((d) => d.type === 'boards') ? 5 : boards), '1',
          q(eventId), ts(start), json(sim.participants), ts(sim.end + 10 * 60_000), json({ tournament: config }),
          q(e === 2 ? 'Eén speler gaf op tijdens de poules.' : e === 4 ? 'Bord 6 viel uit om 20u30.' : null),
        ]],
      ),
    );
    out.push(insert('event_secrets', ['event_id', 'scorer_pin'], [[q(eventId), q(PIN)]]));
    out.push(
      insert(
        'registrations',
        ['event_id', 'player_id', 'preregistered', 'present', 'paid', 'withdrawn_at'],
        attending.map((p) => {
          const w = disruptions.find((d) => d.type === 'withdraw' && d.playerId === p.id);
          return [q(eventId), q(p.id), String(rng.next() < 0.4), 'true', 'true', w ? ts(start + w.atMinutes * 60_000) : 'null'];
        }),
      ),
    );
    out.push(insert('pools', ['event_id', 'id', 'label', 'position'], sim.pools.map((p, i) => [q(eventId), q(p.id), q(p.label), String(i + 1)])));
    out.push(
      insert(
        'pool_members',
        ['event_id', 'pool_id', 'player_id', 'seed'],
        sim.pools.flatMap((p) => p.playerIds.map((id, i) => [q(eventId), q(p.id), q(id), String(i + 1)])),
      ),
    );
    out.push(
      insert(
        'matches',
        ['id', 'event_id', 'code', 'stage', 'round', 'position', 'pool_id', 'player1_id', 'player2_id', 'best_of', 'legs1', 'legs2', 'walkover', 'next_code', 'next_slot', 'board', 'created_at', 'finished_at'],
        sim.matches.map((m) => [
          q(codeToUuid.get(m.id)), q(eventId), q(m.id), q(m.stage), String(m.round), String(m.position), q(m.poolId), q(m.player1), q(m.player2),
          String(m.bestOf), String(m.legs1), String(m.legs2), String(m.walkover), q(m.next?.matchId ?? null), q(m.next?.slot ?? null), q(m.board),
          ts(m.createdAt), ts(m.finishedAt),
        ]),
      ),
    );
    const stats: unknown[][] = [];
    for (const m of sim.matches) {
      if (m.walkover) continue;
      for (const p of [m.player1, m.player2] as string[]) {
        const n180 = rng.next() < 0.12 ? (rng.next() < 0.2 ? 2 : 1) : 0;
        let finish: number | null = null;
        if (m.winner === p && rng.next() < 0.12) {
          finish = 100 + rng.int(71);
          while (BOGEY.has(finish)) finish--;
        }
        if (n180 > 0 || finish !== null) stats.push([q(codeToUuid.get(m.id)), q(p), String(n180), q(finish), q(n180 > 0 ? 180 : 100 + rng.int(80))]);
      }
    }
    out.push(insert('match_stats', ['match_id', 'player_id', 'count_180', 'highest_finish', 'highest_score'], stats));
    const log: unknown[][] = [];
    for (const d of disruptions) {
      const at = ts(start + d.atMinutes * 60_000);
      if (d.type === 'boards') log.push([q(eventId), q('boards'), json({ boards: d.boards }), at]);
      else log.push([q(eventId), q('withdraw'), json({ player_id: d.playerId }), at]);
    }
    for (const key of sim.acceptedLots) log.push([q(eventId), q('lot'), json({ key }), ts(sim.knockoutGeneratedAt)]);
    out.push(insert('event_log', ['event_id', 'type', 'payload', 'created_at'], log));

    const points = eventPoints(sim.placements, DEFAULT_POINTS);
    out.push(
      insert(
        'event_results',
        ['event_id', 'player_id', 'place_from', 'place_to', 'placement_points', 'participation_points', 'points'],
        points.map((p) => [q(eventId), q(p.playerId), String(p.placeFrom), String(p.placeTo), String(p.placementPoints), String(p.participationPoints), String(p.total)]),
      ),
    );
    for (const p of points) results.push({ eventId, playerId: p.playerId, placeFrom: p.placeFrom, placeTo: p.placeTo, points: p.total });
    allMatches.push(...sim.matches);
  }

  // Eén geplande avond met voorinschrijvingen, om de avondflow te testen.
  const upcoming = demoUuid(3, 99);
  const upcomingDate = thirdSaturday(SEASON_YEAR, 11);
  out.push(`\n-- Geplande speelavond ${upcomingDate} (om de avondflow uit te proberen)\n`);
  out.push(insert('events', ['id', 'season_id', 'event_date', 'status', 'boards', 'notes'], [[q(upcoming), q(seasonId), q(upcomingDate), q('gepland'), '6', q('Testavond met de nieuwe app.')]]));
  out.push(insert('event_secrets', ['event_id', 'scorer_pin'], [[q(upcoming), q(PIN)]]));
  out.push(
    insert(
      'registrations',
      ['event_id', 'player_id', 'preregistered'],
      rng.shuffle(players).slice(0, 16).map((p) => [q(upcoming), q(p.id), 'true']),
    ),
  );
  out.push(`\nselect set_config('app.skip_audit', '', true);\nselect set_config('app.skip_advance', '', true);\ncommit;\n`);
  return out.join('');
}
