/**
 * Gedeelde types van de toernooi-engine.
 *
 * Tijdstippen zijn altijd milliseconden sinds epoch (UTC). Omzetten naar
 * Europe/Brussels gebeurt pas in de UI.
 */

export type PlayerId = string;
export type MatchId = string;

/**
 * pool = poulematch, barrage = beslissingsmatch bij gelijke stand, A/B = KO-schema's
 * na de poules. Schema-formats zonder poules: W/L/GF = winnaars-, verliezersschema
 * en grote finale (double elimination); M/P = hoofdschema en plate (troostschema).
 */
export type Stage = 'pool' | 'barrage' | 'A' | 'B' | 'W' | 'L' | 'GF' | 'M' | 'P';
export type KnockoutStage = 'A' | 'B';
export type EliminationStage = 'W' | 'L' | 'GF' | 'M' | 'P';
/** Elk schema dat eindplaatsen oplevert. */
export type BracketStage = KnockoutStage | EliminationStage;

/** poules_ab = poules + A/B-schema (standaard); double_elim; single_elim_plate = enkelvoudig met troostschema. */
export type TournamentFormat = 'poules_ab' | 'double_elim' | 'single_elim_plate';
export type EliminationFormat = Exclude<TournamentFormat, 'poules_ab'>;

export const FORMAT_STAGES: Record<TournamentFormat, readonly Stage[]> = {
  poules_ab: ['pool', 'barrage', 'A', 'B'],
  double_elim: ['W', 'L', 'GF'],
  single_elim_plate: ['M', 'P'],
};

export interface SlotRef {
  matchId: MatchId;
  slot: 1 | 2;
}

export interface Match {
  id: MatchId;
  stage: Stage;
  /** Poule: speelronde (1-based). KO: ronde (1 = eerste ronde). */
  round: number;
  /** Volgorde binnen de ronde (0-based); bepaalt de plaats in het schema. */
  position: number;
  poolId: string | null;
  player1: PlayerId | null;
  player2: PlayerId | null;
  bestOf: number;
  legs1: number | null;
  legs2: number | null;
  winner: PlayerId | null;
  walkover: boolean;
  /** Waar de winnaar naartoe gaat. */
  next: SlotRef | null;
  /** Waar de verliezer naartoe gaat (enkel bij double elimination). */
  loserNext: SlotRef | null;
  /** Vanaf wanneer de match bestaat en dus gespeeld kan worden. */
  createdAt: number;
  /** Servertijd waarop de uitslag binnenkwam. */
  finishedAt: number | null;
  /** Bord waarop de match gespeeld werd (ingevuld bij afloop). */
  board: number | null;
}

export interface EventPlayer {
  id: PlayerId;
  /** Plaats op de ranking (1 = sterkste). Leeg = nog geen ranking (nieuwe speler). */
  seedRank?: number | null;
}

export interface Pool {
  id: string;
  /** Weergave, bv. "Poule 1". */
  label: string;
  /** Spelers in volgorde van seeding. */
  playerIds: PlayerId[];
}

/** Matchen in een schema (geen poule of barrage). */
export function isBracketMatch(m: Pick<Match, 'stage'>): boolean {
  return m.stage !== 'pool' && m.stage !== 'barrage';
}

/**
 * De finale van de avond: wacht (instelbaar) op alle andere matchen en gaat
 * naar het hoofdbord. A-finale, grote finale of finale van het hoofdschema.
 */
export function isEventFinal(m: Pick<Match, 'stage' | 'next' | 'loserNext'>): boolean {
  return (m.stage === 'A' || m.stage === 'GF' || m.stage === 'M') && m.next === null && m.loserNext === null;
}

export function isFinished(m: Match): boolean {
  return m.winner !== null;
}

export function opponentOf(m: Match, playerId: PlayerId): PlayerId | null {
  if (m.player1 === playerId) return m.player2;
  if (m.player2 === playerId) return m.player1;
  return null;
}

export function loserOf(m: Match): PlayerId | null {
  if (m.winner === null) return null;
  return m.winner === m.player1 ? m.player2 : m.player1;
}
