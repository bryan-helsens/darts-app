import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { Match } from '../../../engine';
import { addLogEntry, correctScore } from '../../../data/api';
import type { EventView } from '../../../data/eventView';
import { outbox, usePendingScores } from '../../../data/outbox';
import { keys } from '../../../data/queries';
import { MatchLine, matchTitle, statsLine } from '../../components/darts';
import { ScoreEntry, type ScoreInput } from '../../components/ScoreEntry';
import { Button, ErrorBox, InfoBox, Modal, Select } from '../../components/ui';

type NameFn = (id: string | null | undefined) => string;

/**
 * Alles wat de wedstrijdleider met één match kan doen: score invoeren,
 * corrigeren, uitstellen of naar een ander bord verplaatsen.
 */
export function MatchModal({ view, match, board, name, onClose }: { view: EventView; match: Match; board?: number; name: NameFn; onClose: () => void }) {
  const qc = useQueryClient();
  const pending = usePendingScores(view.event.id).get(match.id);
  const [mode, setMode] = useState<'view' | 'score' | 'correct'>(match.winner || pending ? 'view' : 'score');
  const [targetBoard, setTargetBoard] = useState<number>(board ?? view.activeBoards[0] ?? 1);
  const refresh = () => qc.invalidateQueries({ queryKey: keys.event(view.event.id) });
  const live = view.replay?.boards.find((b) => b.matchId === match.id);
  const held = view.replay?.held.includes(match.id);
  const known = Boolean(match.player1 && match.player2);

  const correct = useMutation({
    mutationFn: (input: ScoreInput) => correctScore(view.event.id, match.id, input.legs1, input.legs2),
    onSuccess: async () => {
      await refresh();
      onClose();
    },
  });
  const log = useMutation({
    mutationFn: (entry: { type: 'hold' | 'release' | 'assign'; payload: Record<string, unknown> }) => addLogEntry(view.event.id, entry.type, entry.payload),
    onSuccess: async () => {
      await refresh();
      onClose();
    },
  });

  const submit = (input: ScoreInput) => {
    void outbox.addScore(
      {
        eventId: view.event.id,
        code: match.id,
        pin: null,
        legs1: input.legs1,
        legs2: input.legs2,
        stats: input.stats,
        clientId: crypto.randomUUID(),
        board: live?.board ?? board ?? null,
      },
      `${name(match.player1)} – ${name(match.player2)} ${input.legs1}–${input.legs2}`,
    );
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={matchTitle(match, view)}>
      {mode === 'score' && known && (
        <ScoreEntry match={match} name={name} title={live ? `Bord ${live.board}` : undefined} onSubmit={submit} onCancel={() => (match.winner ? setMode('view') : onClose())} />
      )}
      {mode === 'correct' && (
        <>
          <InfoBox tone="amber">
            Je corrigeert een uitslag. Dit wordt in de audit-log bijgehouden. Als de winnaar verandert, mag de volgende match nog niet gespeeld zijn.
          </InfoBox>
          <div className="mt-3">
            <ScoreEntry
              match={match}
              name={name}
              initial={match.legs1 !== null ? { legs1: match.legs1, legs2: match.legs2 as number } : null}
              onSubmit={(input) => correct.mutate(input)}
              onCancel={() => setMode('view')}
              busy={correct.isPending}
            />
          </div>
          {correct.error && <ErrorBox error={correct.error} />}
        </>
      )}
      {mode === 'view' && (
        <div className="space-y-3">
          <div className="rounded-lg bg-zinc-50 px-3 py-2.5">
            <MatchLine m={match} name={name} pending={pending ? { legs1: pending.data.legs1, legs2: pending.data.legs2 } : undefined} />
          </div>
          {pending && <InfoBox tone="amber">Deze uitslag wacht nog op verbinding en wordt automatisch verstuurd.</InfoBox>}
          {statsLine(view.statsByMatch.get(view.rowByCode.get(match.id)?.id ?? ''), name) && (
            <p className="text-xs text-zinc-600">{statsLine(view.statsByMatch.get(view.rowByCode.get(match.id)?.id ?? ''), name)}</p>
          )}
          {match.winner && !pending && (
            <Button variant="secondary" block onClick={() => setMode('correct')}>
              Uitslag corrigeren
            </Button>
          )}
        </div>
      )}
      {!known && <p className="text-[13px] text-zinc-600">De spelers van deze match zijn nog niet gekend.</p>}

      {!match.winner && !pending && known && view.event.status === 'bezig' && (
        <div className="mt-4 space-y-2 border-t border-zinc-100 pt-3">
          <h3 className="text-xs font-bold tracking-wider text-zinc-500 uppercase">Planning</h3>
          {live && (
            <p className="text-xs text-zinc-600">
              Speelt nu op bord {live.board}.
              {view.scorers.get(live.board) && (
                <>
                  {' '}
                  Voorgestelde schrijver: <b className="font-medium text-zinc-900">{name(view.scorers.get(live.board))}</b>.
                </>
              )}
            </p>
          )}
          <div className="flex items-end gap-2">
            <label className="flex-1">
              <span className="mb-1 block text-xs font-semibold text-zinc-600">Naar bord</span>
              <Select value={targetBoard} onChange={(e) => setTargetBoard(Number(e.target.value))}>
                {view.activeBoards.map((b) => (
                  <option key={b} value={b}>
                    Bord {b}
                  </option>
                ))}
              </Select>
            </label>
            <Button variant="secondary" onClick={() => log.mutate({ type: 'assign', payload: { match: match.id, board: targetBoard } })} disabled={log.isPending}>
              Nu op dit bord
            </Button>
          </div>
          {held ? (
            <Button variant="secondary" size="sm" block onClick={() => log.mutate({ type: 'release', payload: { match: match.id } })}>
              Uitstel opheffen
            </Button>
          ) : (
            <Button variant="ghost" size="sm" block onClick={() => log.mutate({ type: 'hold', payload: { match: match.id } })}>
              Uitstellen (bv. speler niet aanwezig)
            </Button>
          )}
          {log.error && <ErrorBox error={log.error} />}
        </div>
      )}
    </Modal>
  );
}
