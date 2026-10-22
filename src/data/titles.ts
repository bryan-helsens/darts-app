/** Titels van matchen ("Poule 2", "A · Halve finale", "Verliezers ronde 3"); puur, ook bruikbaar buiten de app. */

import { roundName, STAGE_NAMES, stageRoundName, type Match, type Pool } from '../engine';

type TitleView = { pools: readonly Pick<Pool, 'id' | 'label'>[]; matches: readonly Match[] };

export function stageLabel(m: Match, view?: Pick<TitleView, 'pools'>): string {
  if (m.stage === 'pool') return view?.pools.find((p) => p.id === m.poolId)?.label ?? 'Poule';
  if (m.stage === 'barrage') return 'Barrage';
  return STAGE_NAMES[m.stage];
}

const roundsOf = (m: Match, matches: readonly Match[]) => Math.max(...matches.filter((x) => x.stage === m.stage).map((x) => x.round));

export function matchTitle(m: Match, view: TitleView): string {
  if (m.stage === 'A' || m.stage === 'B' || m.stage === 'M') return `${STAGE_NAMES[m.stage]} · ${roundName(m.round, roundsOf(m, view.matches))}`;
  if (m.stage === 'pool' || m.stage === 'barrage') return stageLabel(m, view);
  // "Winnaars ronde 2", "Verliezersfinale", "Plate halve finale", "Grote finale"
  return stageRoundName(m.stage, m.round, roundsOf(m, view.matches));
}

/** Korte titel voor kleine kaarten: "Poule 2", "A · Halve finale", "Verliezers ronde 3". */
export function shortTitle(m: Match, view: TitleView): string {
  if (m.stage === 'A' || m.stage === 'B') return `${m.stage} · ${roundName(m.round, roundsOf(m, view.matches))}`;
  if (m.stage === 'pool' || m.stage === 'barrage') return stageLabel(m, view);
  return stageRoundName(m.stage, m.round, roundsOf(m, view.matches));
}

