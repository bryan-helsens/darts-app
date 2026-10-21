import { stageRoundName, type BracketStage, type Match } from '../../engine';

export interface BracketColumn {
  round: number;
  name: string;
  bestOf: number | null;
  /** Plaatsen van het volledige raster; null = bye of lege plaats. */
  slots: Array<Match | null>;
}

/** Aantal plaatsen in een ronde van het volledige raster. */
function slotsInRound(stage: BracketStage, round: number, rounds: number): number {
  if (stage === 'GF') return 1;
  // Verliezersschema: telkens twee rondes met evenveel matchen (instroom, dan onderling).
  if (stage === 'L') return 2 ** (rounds / 2 - Math.ceil(round / 2));
  return 2 ** (rounds - round);
}

/**
 * Kolommen van een schema (A, B, W, L, GF, M of P): per ronde de plaatsen,
 * zodat de matchen netjes tussen hun voorgangers staan. Volledig lege
 * kolommen (enkel byes) vallen weg.
 */
export function bracketLayout(stage: BracketStage, matches: readonly Match[]): BracketColumn[] {
  const own = matches.filter((m) => m.stage === stage);
  if (own.length === 0) return [];
  const rounds = Math.max(...own.map((m) => m.round));
  const columns: BracketColumn[] = [];
  for (let round = 1; round <= rounds; round++) {
    const inRound = own.filter((m) => m.round === round);
    if (inRound.length === 0) continue;
    const byPosition = new Map(inRound.map((m) => [m.position, m]));
    const size = Math.max(slotsInRound(stage, round, rounds), ...inRound.map((m) => m.position + 1));
    columns.push({
      round,
      name: stageRoundName(stage, round, rounds),
      bestOf: inRound[0]?.bestOf ?? null,
      slots: Array.from({ length: size }, (_, i) => byPosition.get(i) ?? null),
    });
  }
  return columns;
}
