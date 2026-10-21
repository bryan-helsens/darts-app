/**
 * Exports van een seizoen: CSV's voor Excel (ranking, uitslagen per avond,
 * matchen) en een volledige JSON-back-up. Puur: de gegevens komen van buitenaf.
 */

import { formatPlace, placementPoints, type RankingRow, type SeasonSettings } from '../engine';
import { toCsv } from '../lib/csv';
import { formatDate, formatTime } from '../lib/time';
import type {
  EventLogRow,
  EventResultRow,
  EventRow,
  MatchRow,
  MatchStatRow,
  PlayerContactRow,
  PlayerRow,
  PoolMemberRow,
  PoolRow,
  RegistrationRow,
  SeasonRow,
} from './rows';

type NameFn = (id: string | null | undefined) => string;

export function rankingCsv(rows: readonly RankingRow[], name: NameFn): string {
  return toCsv(rows, [
    { header: 'Positie', value: (r) => r.position },
    { header: 'Speler', value: (r) => name(r.playerId) },
    { header: 'Punten', value: (r) => r.counted },
    { header: 'Totaal (alle avonden)', value: (r) => r.total },
    { header: 'Avonden', value: (r) => r.events },
    { header: 'Avondzeges', value: (r) => r.wins },
    { header: 'Beste plaats', value: (r) => r.bestPlace },
    { header: 'Gewonnen legs', value: (r) => r.legsWon },
    { header: 'Gelijk na loting', value: (r) => r.byLot },
  ]);
}

/** Uitslag per avond, met de punten volgens de huidige puntentabel (zoals de ranking). */
export function resultsCsv(input: { events: readonly EventRow[]; results: readonly EventResultRow[]; settings: SeasonSettings; name: NameFn }): string {
  const date = new Map(input.events.map((e) => [e.id, e.event_date]));
  const rows = [...input.results]
    .filter((r) => date.has(r.event_id))
    .sort((a, b) => (date.get(a.event_id) as string).localeCompare(date.get(b.event_id) as string) || a.place_from - b.place_from || input.name(a.player_id).localeCompare(input.name(b.player_id), 'nl'));
  const placing = (r: EventResultRow) => placementPoints(r.place_from, input.settings.points.table);
  return toCsv(rows, [
    { header: 'Datum', value: (r) => formatDate(date.get(r.event_id) as string) },
    { header: 'Plaats', value: (r) => formatPlace(r.place_from, r.place_to) },
    { header: 'Speler', value: (r) => input.name(r.player_id) },
    { header: 'Plaatsingspunten', value: placing },
    { header: 'Deelnamepunten', value: () => input.settings.points.participation },
    { header: 'Punten', value: (r) => placing(r) + input.settings.points.participation },
  ]);
}

const STAGE_LABEL: Record<MatchRow['stage'], string> = {
  pool: 'Poule',
  barrage: 'Barrage',
  A: 'A-schema',
  B: 'B-schema',
  W: 'Winnaarsschema',
  L: 'Verliezersschema',
  GF: 'Grote finale',
  M: 'Hoofdschema',
  P: 'Plate',
};
const STAGE_ORDER: Record<MatchRow['stage'], number> = { pool: 0, barrage: 1, A: 2, B: 3, W: 4, L: 5, GF: 6, M: 7, P: 8 };

/** Alle gespeelde matchen, met 180's en hoogste uitgooi per speler. */
export function matchesCsv(input: { events: readonly EventRow[]; matches: readonly MatchRow[]; stats: readonly MatchStatRow[]; name: NameFn }): string {
  const date = new Map(input.events.map((e) => [e.id, e.event_date]));
  const stat = new Map(input.stats.map((s) => [`${s.match_id}:${s.player_id}`, s]));
  const of = (m: MatchRow, player: string | null) => (player ? stat.get(`${m.id}:${player}`) : undefined);
  const rows = input.matches
    .filter((m) => m.winner_id !== null && date.has(m.event_id))
    .sort(
      (a, b) =>
        (date.get(a.event_id) as string).localeCompare(date.get(b.event_id) as string) ||
        STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage] ||
        a.code.localeCompare(b.code, 'nl', { numeric: true }),
    );
  return toCsv(rows, [
    { header: 'Datum', value: (m) => formatDate(date.get(m.event_id) as string) },
    { header: 'Code', value: (m) => m.code },
    { header: 'Fase', value: (m) => STAGE_LABEL[m.stage] },
    { header: 'Ronde', value: (m) => m.round },
    { header: 'Bord', value: (m) => m.board },
    { header: 'Speler 1', value: (m) => input.name(m.player1_id) },
    { header: 'Speler 2', value: (m) => input.name(m.player2_id) },
    { header: 'Legs 1', value: (m) => m.legs1 },
    { header: 'Legs 2', value: (m) => m.legs2 },
    { header: 'Winnaar', value: (m) => input.name(m.winner_id) },
    { header: 'Walk-over', value: (m) => m.walkover },
    { header: "180's speler 1", value: (m) => of(m, m.player1_id)?.count_180 },
    { header: "180's speler 2", value: (m) => of(m, m.player2_id)?.count_180 },
    { header: 'Hoogste uitgooi speler 1', value: (m) => of(m, m.player1_id)?.highest_finish },
    { header: 'Hoogste uitgooi speler 2', value: (m) => of(m, m.player2_id)?.highest_finish },
    { header: 'Einde', value: (m) => (m.finished_at ? `${formatDate(Date.parse(m.finished_at))} ${formatTime(Date.parse(m.finished_at))}` : null) },
  ]);
}

// ---------------------------------------------------------------------------
// JSON-back-up
// ---------------------------------------------------------------------------

export interface SeasonTables {
  events: EventRow[];
  registrations: RegistrationRow[];
  pools: PoolRow[];
  pool_members: PoolMemberRow[];
  matches: MatchRow[];
  match_stats: MatchStatRow[];
  event_log: EventLogRow[];
  event_results: EventResultRow[];
}

export interface SeasonBackup extends SeasonTables {
  format: 'sanapolis-darts-backup';
  version: 1;
  exported_at: string;
  season: SeasonRow;
  /** Alle spelers die in dit seizoen voorkomen. */
  players: PlayerRow[];
  /** Enkel in een back-up van een admin. */
  player_contacts?: PlayerContactRow[];
}

export function buildSeasonBackup(input: {
  season: SeasonRow;
  tables: SeasonTables;
  players: readonly PlayerRow[];
  /** null = zonder contactgegevens. */
  contacts: readonly PlayerContactRow[] | null;
  exportedAt: string;
}): SeasonBackup {
  const t = input.tables;
  const used = new Set<string>();
  const add = (id: string | null | undefined) => id && used.add(id);
  t.registrations.forEach((r) => add(r.player_id));
  t.pool_members.forEach((m) => add(m.player_id));
  t.event_results.forEach((r) => add(r.player_id));
  t.match_stats.forEach((s) => add(s.player_id));
  t.matches.forEach((m) => [m.player1_id, m.player2_id, m.winner_id, m.scorer_id].forEach(add));

  const players = input.players.filter((p) => used.has(p.id)).sort((a, b) => a.id.localeCompare(b.id));
  return {
    format: 'sanapolis-darts-backup',
    version: 1,
    exported_at: input.exportedAt,
    season: input.season,
    ...t,
    players,
    ...(input.contacts ? { player_contacts: input.contacts.filter((c) => used.has(c.player_id)).sort((a, b) => a.player_id.localeCompare(b.player_id)) } : {}),
  };
}
