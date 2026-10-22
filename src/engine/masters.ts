/**
 * Masters (eindejaarsfinale): de top N van de seizoensranking speelt. Wie er
 * niet is, wordt vervangen door de volgende aanwezige in de ranking. Puur.
 */

import type { PlayerId } from './types';

export interface MastersField {
  /** Wie speelt, in volgorde van de ranking (hoogstens `size`). */
  field: PlayerId[];
  /** De top N volgens de ranking (aanwezig of niet). */
  qualified: PlayerId[];
  /** Geplaatst (top N) maar niet aanwezig. */
  absent: PlayerId[];
  /** In het veld als vervanger (buiten de top N). */
  replacements: PlayerId[];
  /** Aanwezig, maar (nog) niet in het veld. */
  reserves: PlayerId[];
}

export function mastersField(
  ranking: ReadonlyArray<{ playerId: PlayerId; position: number }>,
  present: ReadonlySet<PlayerId>,
  size: number,
): MastersField {
  const ordered = [...ranking].sort((a, b) => a.position - b.position).map((r) => r.playerId);
  const qualified = ordered.slice(0, size);
  const field = ordered.filter((p) => present.has(p)).slice(0, size);
  const inField = new Set(field);
  const top = new Set(qualified);
  return {
    field,
    qualified,
    absent: qualified.filter((p) => !present.has(p)),
    replacements: field.filter((p) => !top.has(p)),
    reserves: ordered.filter((p) => present.has(p) && !inField.has(p)),
  };
}
