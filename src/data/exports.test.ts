import { describe, expect, it } from 'vitest';
import { DEFAULT_SEASON_SETTINGS, type RankingRow } from '../engine';
import { buildSeasonBackup, matchesCsv, rankingCsv, resultsCsv, type SeasonTables } from './exports';
import type { EventResultRow, EventRow, MatchRow, PlayerRow, SeasonRow } from './rows';

const names: Record<string, string> = { a: 'Arne', b: 'Bram', c: 'Cindy' };
const name = (id: string | null | undefined) => (id ? (names[id] ?? '?') : '–');
const lines = (csv: string) => csv.replace('﻿', '').trimEnd().split('\r\n');

const event = (id: string, date: string) => ({ id, event_date: date }) as EventRow;
const result = (event_id: string, player_id: string, from: number, to = from) =>
  ({ event_id, player_id, place_from: from, place_to: to, placement_points: 0, participation_points: 0, points: 0 }) as EventResultRow;

describe('exports', () => {
  it('ranking-CSV', () => {
    const rows: RankingRow[] = [{ position: 1, playerId: 'a', counted: 52, total: 54, events: 3, wins: 2, bestPlace: 1, legsWon: 31, countedEventIds: [], byLot: false }];
    expect(lines(rankingCsv(rows, name))).toEqual([
      'Positie;Speler;Punten;Totaal (alle avonden);Avonden;Avondzeges;Beste plaats;Gewonnen legs;Gelijk na loting',
      '1;Arne;52;54;3;2;1;31;nee',
    ]);
  });

  it('uitslagen per avond: chronologisch, punten volgens de huidige tabel', () => {
    const csv = resultsCsv({
      events: [event('e2', '2027-02-20'), event('e1', '2027-01-16')],
      results: [result('e2', 'a', 1), result('e1', 'c', 3, 4), result('e1', 'b', 3, 4), result('e1', 'a', 1), result('x', 'a', 1)],
      settings: DEFAULT_SEASON_SETTINGS,
      name,
    });
    const first = DEFAULT_SEASON_SETTINGS.points.table[0].points;
    const part = DEFAULT_SEASON_SETTINGS.points.participation;
    expect(lines(csv)).toEqual([
      'Datum;Plaats;Speler;Plaatsingspunten;Deelnamepunten;Punten',
      `16/01/2027;1;Arne;${first};${part};${first + part}`,
      expect.stringMatching(/^16\/01\/2027;3–4;Bram;/),
      expect.stringMatching(/^16\/01\/2027;3–4;Cindy;/),
      `20/02/2027;1;Arne;${first};${part};${first + part}`,
    ]);
  });

  it('matchen-CSV met statistieken per speler', () => {
    const m = {
      id: 'm1',
      event_id: 'e1',
      code: 'P1-R1-1',
      stage: 'pool',
      round: 1,
      board: 3,
      player1_id: 'a',
      player2_id: 'b',
      legs1: 2,
      legs2: 1,
      winner_id: 'a',
      walkover: false,
      finished_at: '2027-01-16T19:42:00Z',
    } as MatchRow;
    const open = { ...m, id: 'm2', code: 'P1-R1-2', winner_id: null } as MatchRow;
    const csv = matchesCsv({
      events: [event('e1', '2027-01-16')],
      matches: [open, m],
      stats: [{ match_id: 'm1', event_id: 'e1', player_id: 'b', count_180: 2, highest_finish: 121, highest_score: 180 }],
      name,
    });
    expect(lines(csv)).toEqual([
      "Datum;Code;Fase;Ronde;Bord;Speler 1;Speler 2;Legs 1;Legs 2;Winnaar;Walk-over;180's speler 1;180's speler 2;Hoogste uitgooi speler 1;Hoogste uitgooi speler 2;Einde",
      '16/01/2027;P1-R1-1;Poule;1;3;Arne;Bram;2;1;Arne;nee;;2;;121;16/01/2027 20u42',
    ]);
  });

  it('back-up: enkel spelers van dit seizoen, contacten enkel als ze meegegeven zijn', () => {
    const empty: SeasonTables = { events: [], registrations: [], pools: [], pool_members: [], matches: [], match_stats: [], match_legs: [], event_log: [], event_results: [] };
    const tables: SeasonTables = { ...empty, event_results: [result('e1', 'b', 1)], registrations: [{ event_id: 'e1', player_id: 'a' } as SeasonTables['registrations'][number]] };
    const players = ['a', 'b', 'c'].map((id) => ({ id, name: names[id] }) as PlayerRow);
    const contacts = ['a', 'c'].map((player_id) => ({ player_id, email: `${player_id}@x.be`, phone: null, updated_at: '' }));
    const season = { id: 's', name: '2027' } as SeasonRow;

    const full = buildSeasonBackup({ season, tables, players, contacts, exportedAt: '2027-12-31T12:00:00Z' });
    expect(full.format).toBe('sanapolis-darts-backup');
    expect(full.version).toBe(1);
    expect(full.players.map((p) => p.id)).toEqual(['a', 'b']);
    expect(full.player_contacts?.map((c) => c.player_id)).toEqual(['a']);
    expect(full.event_results).toHaveLength(1);

    const staff = buildSeasonBackup({ season, tables, players, contacts: null, exportedAt: '' });
    expect('player_contacts' in staff).toBe(false);
  });
});
