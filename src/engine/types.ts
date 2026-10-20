/**
 * Gedeelde types van de toernooi-engine.
 *
 * Tijdstippen zijn altijd milliseconden sinds epoch (UTC). Omzetten naar
 * Europe/Brussels gebeurt pas in de UI.
 */

export type PlayerId = string;
export type MatchId = string;

/** pool = poulematch, barrage = beslissingsmatch bij gelijke stand, A/B = KO-schema's. */
export type Stage = 'pool' | 'barrage' | 'A' | 'B';
export type KnockoutStage = 'A' | 'B';

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
