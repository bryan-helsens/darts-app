import { describe, expect, it } from 'vitest';
import { describeAudit, type AuditContext } from './audit';
import type { AuditLogRow } from './rows';

const ctx: AuditContext = {
  player: (id) => ({ jan: 'Jan Peeters', piet: 'Piet Claes' })[id],
  profile: (id) => ({ u1: 'Sofie' })[id],
  eventDate: (id) => ({ e1: '2026-11-21' })[id],
};

let n = 0;
function row(partial: Partial<AuditLogRow>): AuditLogRow {
  n++;
  return {
    id: n,
    table_name: 'matches',
    row_key: 'x',
    action: 'update',
    old_data: null,
    new_data: null,
    changed_by: 'u1',
    changed_by_label: null,
    changed_at: '2026-11-21T20:42:00Z',
    ...partial,
  };
}

const match = { id: 'm1', event_id: 'e1', code: 'P1-R2-1', player1_id: 'jan', player2_id: 'piet', legs1: null, legs2: null, winner_id: null, walkover: false };

describe('audit-log in mensentaal', () => {
  it('uitslag ingevoerd door de schrijver met pincode', () => {
    const e = describeAudit(
      row({ old_data: match, new_data: { ...match, legs1: 2, legs2: 1, winner_id: 'jan' }, changed_by: null, changed_by_label: 'score-pin' }),
      ctx,
    );
    expect(e.text).toBe('Uitslag P1-R2-1 ingevoerd: Jan Peeters 2–1 Piet Claes');
    expect(e.who).toBe('schrijver (pincode)');
    expect(e.category).toBe('uitslagen');
    expect(e.eventId).toBe('e1');
    expect(e.at).toBe(Date.parse('2026-11-21T20:42:00Z'));
  });

  it('correctie met een nieuwe winnaar', () => {
    const e = describeAudit(row({ old_data: { ...match, legs1: 2, legs2: 1, winner_id: 'jan' }, new_data: { ...match, legs1: 1, legs2: 2, winner_id: 'piet' } }), ctx);
    expect(e.text).toBe('Uitslag P1-R2-1 gecorrigeerd: 2–1 → 1–2');
    expect(e.details).toEqual(['Jan Peeters – Piet Claes', 'Nieuwe winnaar: Piet Claes']);
    expect(e.who).toBe('Sofie');
  });

  it('walk-over en gewiste uitslag', () => {
    expect(describeAudit(row({ old_data: match, new_data: { ...match, winner_id: 'piet', walkover: true }, changed_by: null }), ctx).text).toBe(
      'Walk-over in P1-R2-1: Piet Claes wint van Jan Peeters',
    );
    const cleared = describeAudit(row({ old_data: { ...match, legs1: 2, legs2: 0, winner_id: 'jan' }, new_data: match }), ctx);
    expect(cleared.text).toBe('Uitslag P1-R2-1 gewist');
    expect(cleared.details).toEqual(['Was: Jan Peeters 2–0 Piet Claes']);
  });

  it('inschrijvingen: online, check-in en betaling', () => {
    const reg = { event_id: 'e1', player_id: 'jan', preregistered: true, present: false, paid: false, withdrawn_at: null };
    const online = describeAudit(row({ table_name: 'registrations', action: 'insert', new_data: reg, changed_by: null, changed_by_label: 'online-inschrijving' }), ctx);
    expect(online.text).toBe('Jan Peeters schreef zich online in');
    expect(online.who).toBe('online inschrijving');
    expect(online.category).toBe('inschrijvingen');
    expect(describeAudit(row({ table_name: 'registrations', old_data: reg, new_data: { ...reg, present: true, paid: true } }), ctx).text).toBe('Jan Peeters: aanwezig, betaald');
    expect(describeAudit(row({ table_name: 'registrations', action: 'delete', old_data: reg }), ctx).text).toBe('Jan Peeters uitgeschreven');
  });

  it('spelers: nieuw, hernoemd, bevestigd, samengevoegd', () => {
    expect(describeAudit(row({ table_name: 'players', row_key: 'nieuw', action: 'insert', new_data: { id: 'nieuw', name: 'Inge Joos', pending: true } }), ctx).text).toBe(
      'Nieuwe speler Inge Joos (online, nog te bevestigen)',
    );
    const renamed = describeAudit(row({ table_name: 'players', row_key: 'jan', old_data: { name: 'Jan Peters', active: true }, new_data: { name: 'Jan Peeters', active: true } }), ctx);
    expect(renamed.text).toBe('Speler Jan Peeters gewijzigd');
    expect(renamed.details).toEqual(['Naam: Jan Peters → Jan Peeters']);
    expect(describeAudit(row({ table_name: 'players', row_key: 'jan', old_data: { name: 'Jan Peeters', pending: true }, new_data: { name: 'Jan Peeters', pending: false } }), ctx).text).toBe(
      'Jan Peeters bevestigd bij de check-in',
    );
    expect(describeAudit(row({ table_name: 'players', row_key: 'weg', action: 'merge', new_data: { into: 'jan' } }), ctx).text).toBe('Dubbele speler samengevoegd met Jan Peeters');
  });

  it('seizoensinstellingen: welke onderdelen veranderden', () => {
    const settings = { points: { table: [25, 20] }, bestOf: { count: 8 }, entryFee: 5 };
    const e = describeAudit(
      row({ table_name: 'seasons', old_data: { name: '2027', settings }, new_data: { name: '2027', settings: { ...settings, points: { table: [30, 20] }, entryFee: 6 } } }),
      ctx,
    );
    expect(e.text).toBe('Seizoensinstellingen 2027 aangepast (puntentabel, inleg)');
    expect(e.category).toBe('seizoenen');
  });

  it('avonden: start, KO, afsluiten, wijzigen', () => {
    const ev = { id: 'e1', event_date: '2026-11-21', status: 'gepland', knockout: null, boards: 6, start_time: '19:00:00', finalized_at: null };
    const d = (o: Record<string, unknown>, n: Record<string, unknown>, action = 'update') => describeAudit(row({ table_name: 'events', row_key: 'e1', action, old_data: o, new_data: n }), ctx);
    expect(d(ev, { ...ev, status: 'bezig' }).text).toBe('Avond 21/11/2026 gestart');
    expect(d({ ...ev, status: 'bezig' }, { ...ev, status: 'bezig', knockout: { A: [], B: [] } }).text).toBe('Avond 21/11/2026: A- en B-schema gemaakt');
    const changed = d(ev, { ...ev, boards: 8, start_time: '19:30:00' });
    expect(changed.text).toBe('Avond 21/11/2026 gewijzigd');
    expect(changed.details).toEqual(['Start: 19u00 → 19u30', 'Borden: 6 → 8']);
    expect(changed.eventId).toBe('e1');
    const finalize = describeAudit(row({ table_name: 'event_results', row_key: 'e1', action: 'finalize', new_data: [{}, {}, {}] as unknown as Record<string, unknown> }), ctx);
    expect(finalize.text).toBe('Avond 21/11/2026: eindstand en punten vastgelegd (3 spelers)');
    expect(finalize.category).toBe('avonden');
  });

  it('overige: rollen, demo-data en onbekende gebruikers', () => {
    expect(describeAudit(row({ table_name: 'profiles', row_key: 'u1', action: 'role', new_data: { role: 'leider' } }), ctx).text).toBe('Rol van Sofie gewijzigd naar leider');
    const demo = describeAudit(row({ table_name: 'demo', action: 'load', changed_by: 'ander' }), ctx);
    expect(demo.text).toBe('Demo-data geladen');
    expect(demo.category).toBe('overig');
    expect(demo.who).toBe('onbekende gebruiker');
    expect(describeAudit(row({ changed_by: null, old_data: match, new_data: { ...match, winner_id: 'jan', walkover: true } }), ctx).who).toBe('systeem');
  });
});
