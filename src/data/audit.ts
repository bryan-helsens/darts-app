/**
 * Audit-log leesbaar maken: elke rij uit `audit_log` wordt een korte Vlaamse
 * zin ("Uitslag P1-R2-1 gecorrigeerd: 2–1 → 1–2"), met wie en wanneer.
 * Puur: namen en datums komen via `AuditContext` binnen.
 */

import type { AuditLogRow } from './rows';

export type AuditCategory = 'uitslagen' | 'inschrijvingen' | 'spelers' | 'seizoenen' | 'avonden' | 'overig';

/** Tabellen per filter in het logboek (zo filtert de database mee). */
export const AUDIT_TABLES: Record<Exclude<AuditCategory, 'overig'>, string[]> = {
  uitslagen: ['matches'],
  inschrijvingen: ['registrations'],
  spelers: ['players'],
  seizoenen: ['seasons'],
  avonden: ['events', 'event_results'],
};

export interface AuditContext {
  /** Naam van een speler (ook verwijderde spelers geven undefined). */
  player: (id: string) => string | undefined;
  /** Weergavenaam van een gebruiker. */
  profile: (id: string) => string | undefined;
  /** Datum van een avond, "jjjj-mm-dd". */
  eventDate: (id: string) => string | undefined;
}

export interface AuditEntry {
  id: number;
  /** Tijdstip in ms. */
  at: number;
  category: AuditCategory;
  text: string;
  /** Extra regels, bv. "oud → nieuw". */
  details: string[];
  /** Wie: gebruiker, "schrijver (pincode)", "online inschrijving" of "systeem". */
  who: string;
  /** Avond waarop de wijziging slaat. */
  eventId: string | null;
}

type Data = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** "jjjj-mm-dd" → "dd/mm/jjjj" (zonder src/lib/time, zodat dit puur blijft). */
const dmy = (date: string) => date.slice(0, 10).split('-').reverse().join('/');
/** "19:00:00" → "19u00" */
const hm = (time: unknown) => (typeof time === 'string' ? time.slice(0, 5).replace(':', 'u') : '?');

function categoryOf(table: string): AuditCategory {
  for (const [category, tables] of Object.entries(AUDIT_TABLES)) if (tables.includes(table)) return category as AuditCategory;
  return 'overig';
}

function actor(row: AuditLogRow, ctx: AuditContext): string {
  if (row.changed_by_label === 'score-pin') return 'schrijver (pincode)';
  if (row.changed_by_label === 'online-inschrijving') return 'online inschrijving';
  if (row.changed_by) return ctx.profile(row.changed_by) ?? 'onbekende gebruiker';
  if (row.changed_by_label === 'sql-editor') return 'SQL Editor';
  return row.changed_by_label ?? 'systeem';
}

export function describeAudit(row: AuditLogRow, ctx: AuditContext): AuditEntry {
  const before = (row.old_data ?? {}) as Data;
  const after = (row.new_data ?? {}) as Data;
  const data = row.action === 'delete' ? before : { ...before, ...after };
  const playerName = (id: unknown, fallback?: unknown) => (typeof id === 'string' && ctx.player(id)) || str(fallback) || 'een onbekende speler';
  const eventLabel = (id: unknown) => {
    const date = typeof id === 'string' ? ctx.eventDate(id) : undefined;
    return date ? `Avond ${dmy(date)}` : 'Avond';
  };

  let text: string;
  let details: string[] = [];
  let eventId: string | null = str(data.event_id);

  switch (row.table_name) {
    case 'matches':
      ({ text, details } = describeMatch(row.action, before, after, playerName));
      break;
    case 'registrations':
      ({ text, details } = describeRegistration(row, before, after, playerName(data.player_id)));
      break;
    case 'players':
      ({ text, details } = describePlayer(row, before, after, playerName));
      break;
    case 'seasons':
      ({ text, details } = describeSeason(row.action, before, after));
      break;
    case 'events':
      eventId = row.row_key;
      ({ text, details } = describeEvent(row.action, before, after, eventLabel(row.row_key)));
      break;
    case 'event_results': {
      eventId = row.row_key;
      const count = Array.isArray(row.new_data) ? row.new_data.length : null;
      text = `${eventLabel(row.row_key)}: eindstand en punten vastgelegd${count !== null ? ` (${count} spelers)` : ''}`;
      break;
    }
    case 'profiles':
      text = `Rol van ${ctx.profile(row.row_key) ?? 'een gebruiker'} gewijzigd naar ${str(after.role) ?? '?'}`;
      break;
    case 'demo':
      text = row.action === 'load' ? 'Demo-data geladen' : 'Demo-data verwijderd';
      break;
    default:
      text = `${row.table_name}: ${row.action}`;
  }

  return { id: row.id, at: Date.parse(row.changed_at), category: categoryOf(row.table_name), text, details, who: actor(row, ctx), eventId };
}

type Described = { text: string; details: string[] };

function describeMatch(action: string, before: Data, after: Data, name: (id: unknown) => string): Described {
  const d = action === 'delete' ? before : after;
  const code = str(d.code) ?? '?';
  const p1 = name(d.player1_id);
  const p2 = name(d.player2_id);
  const score = (x: Data) => `${num(x.legs1) ?? '–'}–${num(x.legs2) ?? '–'}`;
  const played = (x: Data) => x.winner_id !== null && x.winner_id !== undefined;

  if (action === 'delete') return { text: `Match ${code} verwijderd`, details: played(before) ? [`${p1} ${score(before)} ${p2}`] : [] };

  if (!played(before) && played(after)) {
    if (after.walkover) {
      const loser = after.winner_id === after.player1_id ? p2 : p1;
      return { text: `Walk-over in ${code}: ${name(after.winner_id)} wint van ${loser}`, details: [] };
    }
    return { text: `Uitslag ${code} ingevoerd: ${p1} ${score(after)} ${p2}`, details: [] };
  }
  if (played(before) && !played(after)) return { text: `Uitslag ${code} gewist`, details: [`Was: ${p1} ${score(before)} ${p2}`] };

  const old = before.walkover ? 'walk-over' : score(before);
  const details = [`${p1} – ${p2}`];
  if (before.winner_id !== after.winner_id) details.push(`Nieuwe winnaar: ${name(after.winner_id)}`);
  return { text: `Uitslag ${code} gecorrigeerd: ${old} → ${after.walkover ? 'walk-over' : score(after)}`, details };
}

function describeRegistration(row: AuditLogRow, before: Data, after: Data, player: string): Described {
  if (row.action === 'delete') return { text: `${player} uitgeschreven`, details: [] };
  if (row.action === 'insert') {
    if (row.changed_by_label === 'online-inschrijving') return { text: `${player} schreef zich online in`, details: [] };
    const parts = [after.preregistered ? 'vooraf ingeschreven' : 'toegevoegd aan de avond'];
    if (after.present) parts.push('aanwezig');
    if (after.paid) parts.push('betaald');
    return { text: `${player}: ${parts.join(', ')}`, details: [] };
  }
  const changes: string[] = [];
  const flag = (key: string, on: string, off: string) => {
    if (!same(before[key], after[key])) changes.push(after[key] ? on : off);
  };
  flag('preregistered', 'vooraf ingeschreven', 'voorinschrijving geschrapt');
  flag('present', 'aanwezig', 'niet meer aanwezig');
  flag('paid', 'betaald', 'betaling geschrapt');
  flag('withdrawn_at', 'gaf op', 'opgave ongedaan gemaakt');
  if (changes.length === 0 && row.changed_by_label === 'online-inschrijving') changes.push('schreef zich online in');
  return { text: `${player}: ${changes.length > 0 ? changes.join(', ') : 'inschrijving bijgewerkt'}`, details: [] };
}

function describePlayer(row: AuditLogRow, before: Data, after: Data, name: (id: unknown, fallback?: unknown) => string): Described {
  const player = name(row.row_key, after.name ?? before.name);
  switch (row.action) {
    case 'insert':
      return { text: after.pending ? `Nieuwe speler ${str(after.name) ?? player} (online, nog te bevestigen)` : `Speler ${str(after.name) ?? player} toegevoegd`, details: [] };
    case 'delete':
      return { text: `Speler ${str(before.name) ?? player} verwijderd`, details: [] };
    case 'merge':
      return { text: `Dubbele speler samengevoegd met ${name(after.into)}`, details: [] };
    case 'anonymize':
      return { text: 'Persoonsgegevens van een speler gewist (anoniem gemaakt)', details: [] };
  }
  const changes: string[] = [];
  if (!same(before.name, after.name)) changes.push(`Naam: ${str(before.name) ?? '–'} → ${str(after.name) ?? '–'}`);
  if (!same(before.nickname, after.nickname)) changes.push(`Bijnaam: ${str(before.nickname) ?? '–'} → ${str(after.nickname) ?? '–'}`);
  if (!same(before.active, after.active)) changes.push(after.active ? 'Weer actief' : 'Op inactief gezet');
  if (!same(before.pending, after.pending) && !after.pending) return { text: `${player} bevestigd bij de check-in`, details: changes };
  return { text: `Speler ${player} gewijzigd`, details: changes };
}

const SETTING_LABELS: Record<string, string> = {
  points: 'puntentabel',
  bestOf: 'beste X van Y',
  legs: 'legs',
  timing: 'tijdsinschatting',
  entryFee: 'inleg',
  advancePerPool: 'doorstromers per poule',
  holdFinal: 'finale op het hoofdbord',
  startTime: 'startuur',
  registrationCloses: 'einde inschrijving',
  endLimit: 'gewenst einde',
  elo: 'Elo',
  seeding: 'seeding',
};

function describeSeason(action: string, before: Data, after: Data): Described {
  const name = str(after.name) ?? str(before.name) ?? '?';
  if (action === 'insert') return { text: `Seizoen ${name} aangemaakt`, details: [] };
  if (action === 'delete') return { text: `Seizoen ${name} verwijderd`, details: [] };
  if (action === 'restore') return { text: `Seizoen teruggezet uit een back-up (${num(after.events) ?? 0} avonden)`, details: [] };
  const details: string[] = [];
  if (!same(before.name, after.name)) details.push(`Naam: ${str(before.name)} → ${name}`);
  if (!same(before.starts_on, after.starts_on) || !same(before.ends_on, after.ends_on)) {
    details.push(`Periode: ${dmy(String(after.starts_on))} – ${dmy(String(after.ends_on))}`);
  }
  const oldSettings = (before.settings ?? {}) as Data;
  const newSettings = (after.settings ?? {}) as Data;
  const changed = [...new Set([...Object.keys(oldSettings), ...Object.keys(newSettings)])].filter((k) => !same(oldSettings[k], newSettings[k]));
  if (changed.length > 0) {
    return { text: `Seizoensinstellingen ${name} aangepast (${changed.map((k) => SETTING_LABELS[k] ?? k).join(', ')})`, details };
  }
  return { text: `Seizoen ${name} gewijzigd`, details };
}

function describeEvent(action: string, before: Data, after: Data, label: string): Described {
  if (action === 'delete') return { text: `${label} verwijderd`, details: [] };
  if (action === 'reset') return { text: `${label}: toernooi teruggezet (poules, matchen en uitslagen gewist)`, details: [] };

  if (before.status !== after.status) {
    if (after.status === 'bezig') return { text: `${label} gestart`, details: [] };
    if (after.status === 'afgelopen') return { text: `${label} afgesloten`, details: [] };
    return { text: `${label}: status ${str(before.status)} → ${str(after.status)}`, details: [] };
  }
  if (before.knockout === null && after.knockout) return { text: `${label}: A- en B-schema gemaakt`, details: [] };
  if (before.knockout && after.knockout === null) return { text: `${label}: A- en B-schema ongedaan gemaakt`, details: [] };
  if (!same(before.finalized_at, after.finalized_at) && after.finalized_at) return { text: `${label} opnieuw afgesloten`, details: [] };

  const details: string[] = [];
  if (!same(before.event_date, after.event_date)) details.push(`Datum: ${dmy(String(before.event_date))} → ${dmy(String(after.event_date))}`);
  if (!same(before.start_time, after.start_time)) details.push(`Start: ${hm(before.start_time)} → ${hm(after.start_time)}`);
  if (!same(before.registration_closes, after.registration_closes)) details.push(`Inschrijven tot: ${hm(before.registration_closes)} → ${hm(after.registration_closes)}`);
  if (!same(before.boards, after.boards)) details.push(`Borden: ${num(before.boards)} → ${num(after.boards)}`);
  if (!same(before.main_board, after.main_board)) details.push(`Hoofdbord: ${num(before.main_board)} → ${num(after.main_board)}`);
  if (!same(before.registration_reopened, after.registration_reopened)) details.push(after.registration_reopened ? 'Inschrijving heropend' : 'Inschrijving weer gesloten');
  if (!same(before.notes, after.notes)) details.push(`Notitie: ${str(after.notes) ?? '(leeg)'}`);
  if (!same(before.settings, after.settings)) details.push('Instellingen van de avond aangepast');
  return { text: `${label} gewijzigd`, details };
}
