/**
 * Rankingpunten per speelavond: plaatsingspunten uit de puntentabel plus
 * deelnamepunten. Bij een gedeelde plaats (bv. 5–8) tellen de punten van de
 * hoogste plaats in dat bereik.
 */

import type { Placement } from './placements';
import type { PointsRule, PointsSettings } from './settings';
import type { PlayerId } from './types';

export function placementPoints(place: number, table: readonly PointsRule[]): number {
  for (const rule of table) {
    if (place >= rule.from && (rule.to === null || place <= rule.to)) return rule.points;
  }
  return 0;
}

export interface EventPoints {
  playerId: PlayerId;
  placeFrom: number;
  placeTo: number;
  placementPoints: number;
  participationPoints: number;
  total: number;
}

export function eventPoints(placements: readonly Placement[], settings: PointsSettings): EventPoints[] {
  return placements.map((p) => {
    const placement = placementPoints(p.from, settings.table);
    return {
      playerId: p.playerId,
      placeFrom: p.from,
      placeTo: p.to,
      placementPoints: placement,
      participationPoints: settings.participation,
      total: placement + settings.participation,
    };
  });
}

/** Controleert of een puntentabel sluitend is (aansluitende reeksen vanaf 1). */
export function validatePointsTable(table: readonly PointsRule[]): string | null {
  if (table.length === 0) return 'De puntentabel is leeg.';
  let expected = 1;
  for (const [i, rule] of table.entries()) {
    if (rule.from !== expected) return `Plaats ${expected} ontbreekt in de puntentabel.`;
    if (rule.to !== null && rule.to < rule.from) return `Ongeldige reeks ${rule.from}–${rule.to}.`;
    if (rule.points < 0) return 'Punten kunnen niet negatief zijn.';
    if (rule.to === null) {
      if (i !== table.length - 1) return 'Enkel de laatste regel mag "en verder" zijn.';
      return null;
    }
    expected = rule.to + 1;
  }
  return 'De laatste regel moet "en verder" zijn.';
}
