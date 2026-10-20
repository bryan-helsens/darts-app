/**
 * Uitslagen verwerken: validatie, doorschuiven naar de volgende match,
 * correcties en walk-overs bij opgave.
 */

import type { Match, MatchId, PlayerId } from './types';
import { isFinished, loserOf } from './types';

export class ResultError extends Error {}

export function legsToWin(bestOf: number): number {
  return Math.floor(bestOf / 2) + 1;
}

/** Geeft een foutmelding terug, of null als de score geldig is. */
export function validateScore(bestOf: number, legs1: number, legs2: number): string | null {
  if (!Number.isInteger(legs1) || !Number.isInteger(legs2) || legs1 < 0 || legs2 < 0) {
    return 'Vul voor beide spelers een geldig aantal legs in.';
  }
  const need = legsToWin(bestOf);
  if ((legs1 === need && legs2 < need) || (legs2 === need && legs1 < need)) return null;
  return `Bij best of ${bestOf} moet één speler precies ${need} ${need === 1 ? 'leg' : 'legs'} winnen.`;
}

export interface ResultInput {
  legs1: number;
  legs2: number;
  walkover?: boolean;
  finishedAt: number;
  board?: number | null;
}

/**
 * Zet een uitslag (of correctie) en schuift winnaar/verliezer door.
 * Een correctie die de winnaar wijzigt, wordt geweigerd als de volgende match
 * al gespeeld is.
 */
export function applyResult(matches: readonly Match[], matchId: MatchId, input: ResultInput): Match[] {
  const byId = new Map(matches.map((m) => [m.id, m]));
  const match = byId.get(matchId);
  if (!match) throw new ResultError(`Onbekende match ${matchId}`);
  if (!match.player1 || !match.player2) throw new ResultError('De spelers van deze match zijn nog niet gekend.');
  if (!input.walkover) {
    const err = validateScore(match.bestOf, input.legs1, input.legs2);
    if (err) throw new ResultError(err);
  } else if (input.legs1 === input.legs2) {
    throw new ResultError('Een walk-over heeft een winnaar nodig.');
  }

  const winner = input.legs1 > input.legs2 ? match.player1 : match.player2;
  const loser = winner === match.player1 ? match.player2 : match.player1;
  const oldWinner = match.winner;
  const oldLoser = loserOf(match);

  const updates = new Map<MatchId, Match>();
  const get = (id: MatchId) => updates.get(id) ?? (byId.get(id) as Match);

  const place = (player: PlayerId, ref: Match['next'], previous: PlayerId | null) => {
    if (!ref) return;
    const target = get(ref.matchId);
    const current = ref.slot === 1 ? target.player1 : target.player2;
    if (current === player) return;
    if (isFinished(target)) {
      throw new ResultError('De volgende match is al gespeeld. Corrigeer eerst die match.');
    }
    if (current !== null && current !== previous) {
      throw new ResultError('Het schema is niet consistent: de volgende plaats is al bezet.');
    }
    updates.set(target.id, ref.slot === 1 ? { ...target, player1: player } : { ...target, player2: player });
  };

  place(winner, match.next, oldWinner);
  place(loser, match.loserNext, oldLoser);

  updates.set(match.id, {
    ...get(match.id),
    legs1: input.legs1,
    legs2: input.legs2,
    winner,
    walkover: Boolean(input.walkover),
    finishedAt: match.finishedAt ?? input.finishedAt,
    board: input.board ?? match.board,
  });

  return matches.map((m) => updates.get(m.id) ?? m);
}

export function walkoverLegs(bestOf: number, player1Wins: boolean): { legs1: number; legs2: number } {
  const need = legsToWin(bestOf);
  return player1Wins ? { legs1: need, legs2: 0 } : { legs1: 0, legs2: need };
}

/**
 * Verwerkt walk-overs voor alle open matchen waarin een opgegeven speler zit
 * (en waarvan beide spelers gekend zijn). Herhaalt tot er niets meer verandert,
 * omdat een walk-over een volgende match kan vullen.
 */
export function autoWalkovers(matches: readonly Match[], withdrawn: ReadonlySet<PlayerId>, at: number): Match[] {
  let current = [...matches];
  for (;;) {
    const target = current.find(
      (m) =>
        !isFinished(m) &&
        m.player1 !== null &&
        m.player2 !== null &&
        (withdrawn.has(m.player1) || withdrawn.has(m.player2)),
    );
    if (!target) return current;
    // De speler die niet opgaf wint; gaven beiden op, dan wint speler 1.
    const player1Wins = !withdrawn.has(target.player1 as PlayerId) || withdrawn.has(target.player2 as PlayerId);
    current = applyResult(current, target.id, {
      ...walkoverLegs(target.bestOf, player1Wins),
      walkover: true,
      finishedAt: at,
    });
  }
}
