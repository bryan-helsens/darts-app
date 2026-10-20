import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  createBarrageMatches,
  eventPoints,
  generateKnockouts,
  isFinished,
  splitQualifiers,
  type Match,
  type SeasonSettings,
} from '../../../engine';
import { addBarrages, addLogEntry, finalizeEvent, generateKnockout, resetTournament, undoKnockout, updateEvent, withdrawPlayer } from '../../../data/api';
import type { EventView } from '../../../data/eventView';
import { matchToInsert } from '../../../data/mappers';
import { usePendingScores } from '../../../data/outbox';
import { keys } from '../../../data/queries';
import { formatTime } from '../../../lib/time';
import { BoardsOverview, Bracket, MatchLine, matchTitle, PlacementsTable, PoolTable } from '../../components/darts';
import { Badge, Button, Card, ConfirmModal, cx, Empty, ErrorBox, InfoBox, Modal, SectionTitle, Select, TextInput } from '../../components/ui';
import { MatchModal } from './MatchModal';

type NameFn = (id: string | null | undefined) => string;

function useRefresh(eventId: string) {
  const qc = useQueryClient();
  return async () => {
    await qc.invalidateQueries({ queryKey: keys.event(eventId) });
    await qc.invalidateQueries({ queryKey: keys.events });
    await qc.invalidateQueries({ queryKey: keys.registrations(eventId) });
    // Ranking en spelersprofielen hangen af van de afgesloten avonden.
    await qc.invalidateQueries({ queryKey: ['season-data'] });
    await qc.invalidateQueries({ queryKey: ['player'] });
  };
}

function useMatchModal(view: EventView, name: NameFn) {
  const [open, setOpen] = useState<{ code: string; board?: number } | null>(null);
  const match = open ? view.byCode.get(open.code) : undefined;
  return {
    open: (m: Match, board?: number) => setOpen({ code: m.id, board }),
    modal: match ? <MatchModal view={view} match={match} board={open?.board} name={name} onClose={() => setOpen(null)} /> : null,
  };
}

// ---------------------------------------------------------------------------
// Borden
// ---------------------------------------------------------------------------

export function BoardsPanel({ view, name, onGoTo }: { view: EventView; name: NameFn; onGoTo: (tab: 'poules' | 'schema' | 'afsluiten') => void }) {
  const refresh = useRefresh(view.event.id);
  const { open, modal } = useMatchModal(view, name);
  const pending = usePendingScores(view.event.id);
  const [boardsModal, setBoardsModal] = useState(false);
  const [withdrawModal, setWithdrawModal] = useState(false);
  const replay = view.replay;
  const end = view.live?.forecast.end;
  const poolMatches = view.matches.filter((m) => m.stage === 'pool');
  const done = poolMatches.filter(isFinished).length;
  const queue = (replay?.queue ?? []).map((c) => view.byCode.get(c)).filter((m): m is Match => Boolean(m));
  const held = (replay?.held ?? []).map((c) => view.byCode.get(c)).filter((m): m is Match => Boolean(m));
  const tired = new Set(
    (replay?.assignments ?? []).filter((a) => a.end === null && !a.rested).map((a) => a.matchId),
  );
  const recent = view.matches
    .filter((m) => m.finishedAt !== null && !m.walkover)
    .sort((a, b) => (b.finishedAt as number) - (a.finishedAt as number))
    .slice(0, 5);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Card className="p-3">
          <div className="text-sm text-stone-500">Verwachte eindtijd</div>
          <div className="text-3xl font-bold tabular-nums">{end ? formatTime(end) : '–'}</div>
          {view.live && <div className="text-xs text-stone-500">{view.live.minutesPerLeg.toFixed(1)} min per leg</div>}
        </Card>
        <Card className="p-3">
          <div className="text-sm text-stone-500">Poulematchen</div>
          <div className="text-3xl font-bold tabular-nums">
            {done}/{poolMatches.length}
          </div>
        </Card>
      </div>

      {(view.phase === 'barrages' || view.phase === 'ko-klaar') && (
        <InfoBox tone="amber">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{view.phase === 'barrages' ? 'De poules zijn gespeeld, maar er moet een gelijke stand beslist worden.' : 'De poules zijn gespeeld!'}</span>
            <Button size="sm" onClick={() => onGoTo('poules')}>
              {view.phase === 'barrages' ? 'Naar barrages' : 'A- en B-schema maken'}
            </Button>
          </div>
        </InfoBox>
      )}
      {view.phase === 'klaar' && (
        <InfoBox tone="green">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>Alle matchen zijn gespeeld.</span>
            <Button size="sm" onClick={() => onGoTo('afsluiten')}>
              Avond afsluiten
            </Button>
          </div>
        </InfoBox>
      )}

      <BoardsOverview view={view} name={name} onMatch={(m, b) => open(m, b)} />
      {tired.size > 0 && <p className="text-sm text-amber-800">Let op: op {tired.size} bord(en) speelt iemand zonder pauze, omdat er geen andere match klaarstond.</p>}

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setBoardsModal(true)}>
          Borden: {view.activeBoards.length} · wijzigen
        </Button>
        <Button variant="secondary" onClick={() => setWithdrawModal(true)}>
          Speler geeft op
        </Button>
      </div>

      <SectionTitle>Wachtrij</SectionTitle>
      {queue.length === 0 ? (
        <Empty>Geen matchen die klaarstaan.</Empty>
      ) : (
        <div className="space-y-2">
          {queue.slice(0, 12).map((m, i) => (
            <button key={m.id} type="button" onClick={() => open(m)} className="block w-full rounded-xl border border-stone-200 bg-white p-3 text-left hover:border-brand-700">
              <div className="mb-1 flex justify-between text-sm text-stone-500">
                <span>
                  {i + 1}. {matchTitle(m, view)}
                </span>
                {pending.has(m.id) && <Badge tone="amber">wacht op sync</Badge>}
              </div>
              <MatchLine m={m} name={name} pending={pending.get(m.id)?.data} />
            </button>
          ))}
        </div>
      )}

      {held.length > 0 && (
        <>
          <SectionTitle>Uitgesteld</SectionTitle>
          <div className="space-y-2">
            {held.map((m) => (
              <button key={m.id} type="button" onClick={() => open(m)} className="block w-full rounded-xl border border-dashed border-stone-300 bg-white p-3 text-left">
                <MatchLine m={m} name={name} />
              </button>
            ))}
          </div>
        </>
      )}

      {recent.length > 0 && (
        <>
          <SectionTitle>Laatste uitslagen</SectionTitle>
          <div className="space-y-2">
            {recent.map((m) => (
              <button key={m.id} type="button" onClick={() => open(m)} className="block w-full rounded-xl bg-white p-2 text-left text-sm hover:bg-stone-100">
                <MatchLine m={m} name={name} compact />
              </button>
            ))}
          </div>
        </>
      )}

      {modal}
      {boardsModal && <BoardsModal view={view} onClose={() => setBoardsModal(false)} onDone={refresh} />}
      {withdrawModal && <WithdrawModal view={view} name={name} onClose={() => setWithdrawModal(false)} onDone={refresh} />}
    </div>
  );
}

function BoardsModal({ view, onClose, onDone }: { view: EventView; onClose: () => void; onDone: () => Promise<void> }) {
  const [boards, setBoards] = useState<number[]>(view.activeBoards);
  const save = useMutation({
    mutationFn: async () => {
      const sorted = [...boards].sort((a, b) => a - b);
      await addLogEntry(view.event.id, 'boards', { boards: sorted });
      await updateEvent(view.event.id, { boards: sorted.length });
    },
    onSuccess: async () => {
      await onDone();
      onClose();
    },
  });
  const all = Array.from({ length: Math.max(8, ...boards, ...view.activeBoards) }, (_, i) => i + 1);
  return (
    <Modal open onClose={onClose} title="Borden in gebruik">
      <p className="mb-3 text-stone-600">Tik op een bord om het aan of uit te zetten. Een lopende match op een weggenomen bord mag gewoon uitgespeeld worden.</p>
      <div className="grid grid-cols-4 gap-2">
        {all.map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => setBoards((x) => (x.includes(b) ? x.filter((y) => y !== b) : [...x, b]))}
            className={cx('h-16 rounded-2xl border-2 text-xl font-bold', boards.includes(b) ? 'border-brand-800 bg-brand-800 text-white' : 'border-stone-300 bg-white text-stone-500')}
          >
            {b}
          </button>
        ))}
      </div>
      {save.error && <ErrorBox error={save.error} />}
      <Button size="lg" block className="mt-4" disabled={boards.length === 0 || save.isPending} onClick={() => save.mutate()}>
        {boards.length} borden gebruiken
      </Button>
    </Modal>
  );
}

function WithdrawModal({ view, name, onClose, onDone }: { view: EventView; name: NameFn; onClose: () => void; onDone: () => Promise<void> }) {
  const [player, setPlayer] = useState('');
  const [confirm, setConfirm] = useState(false);
  const players = view.pools.flatMap((p) => p.playerIds).filter((id) => !view.withdrawn.has(id));
  const go = useMutation({
    mutationFn: () => withdrawPlayer(view.event.id, player),
    onSuccess: async () => {
      await onDone();
      onClose();
    },
  });
  return (
    <Modal open onClose={onClose} title="Speler geeft op">
      <p className="mb-3 text-stone-600">Alle resterende matchen van deze speler worden reglementair verloren (walk-over). Een opgegeven speler staat onderaan zijn poule.</p>
      <Select value={player} onChange={(e) => setPlayer(e.target.value)}>
        <option value="">Kies een speler…</option>
        {players
          .slice()
          .sort((a, b) => name(a).localeCompare(name(b), 'nl'))
          .map((id) => (
            <option key={id} value={id}>
              {name(id)}
            </option>
          ))}
      </Select>
      {go.error && <ErrorBox error={go.error} />}
      <Button variant="danger" size="lg" block className="mt-4" disabled={!player} onClick={() => setConfirm(true)}>
        Opgave bevestigen
      </Button>
      <ConfirmModal open={confirm} title="Zeker?" danger confirmLabel="Ja, speler geeft op" busy={go.isPending} onClose={() => setConfirm(false)} onConfirm={() => go.mutate()}>
        {name(player)} geeft op. Dit kan niet ongedaan gemaakt worden zonder het toernooi terug te zetten.
      </ConfirmModal>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Poules, barrages en KO-schema's aanmaken
// ---------------------------------------------------------------------------

export function PoolsPanel({ view, name, seedRanks }: { view: EventView; name: NameFn; seedRanks: Map<string, number> }) {
  const refresh = useRefresh(view.event.id);
  const { open, modal } = useMatchModal(view, name);
  const [confirmKo, setConfirmKo] = useState(false);
  const status = view.poolStatus;
  const config = view.config;

  const barrage = useMutation({
    mutationFn: async ({ key, play }: { key: string; play: boolean }) => {
      const need = status?.barrageNeeds.find((n) => n.key === key);
      if (!need || !config) return;
      if (play) {
        const matches = createBarrageMatches(need, config.legs.barrage, 0, view.matches);
        await addBarrages(view.event.id, matches.map(matchToInsert));
      } else {
        await addLogEntry(view.event.id, 'lot', { key });
      }
    },
    onSuccess: refresh,
  });
  const ko = useMutation({
    mutationFn: async () => {
      if (!status || !config) return;
      const gen = generateKnockouts({
        standings: status.standings,
        advance: config.advance,
        legs: config.legs,
        lotSeed: view.event.rng_seed,
        seedRanks,
        createdAt: 0,
      });
      await generateKnockout(view.event.id, gen.matches.map(matchToInsert), gen.participants);
    },
    onSuccess: async () => {
      setConfirmKo(false);
      await refresh();
    },
  });
  const undo = useMutation({ mutationFn: () => undoKnockout(view.event.id), onSuccess: refresh });

  if (!status || !config) return <Empty>De poules zijn nog niet geloot.</Empty>;
  const preview = status.readyForKnockout ? splitQualifiers(status.standings, { advance: config.advance, lotSeed: view.event.rng_seed, seedRanks }) : null;
  const barrages = view.matches.filter((m) => m.stage === 'barrage');
  const koPlayed = view.matches.some((m) => (m.stage === 'A' || m.stage === 'B') && m.winner && !m.walkover);

  return (
    <div className="space-y-4">
      {status.barrageNeeds.map((need) => (
        <InfoBox key={need.key} tone="amber">
          <p className="font-semibold">
            Gelijke stand in {view.pools.find((p) => p.id === need.poolId)?.label} voor plaats {need.positions[0]}–{need.positions[need.positions.length - 1]}
          </p>
          <p className="mb-2">{need.playerIds.map(name).join(', ')} staan volledig gelijk. Wie gaat naar het A-schema?</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => barrage.mutate({ key: need.key, play: true })} disabled={barrage.isPending}>
              Barrage spelen ({need.playerIds.length === 2 ? '1 match' : 'ieder tegen ieder'}, bo{config.legs.barrage})
            </Button>
            <Button variant="secondary" onClick={() => barrage.mutate({ key: need.key, play: false })} disabled={barrage.isPending}>
              Loting
            </Button>
          </div>
        </InfoBox>
      ))}
      {barrage.error && <ErrorBox error={barrage.error} />}

      {barrages.length > 0 && (
        <Card>
          <h3 className="mb-2 font-semibold">Barrages</h3>
          <div className="space-y-2">
            {barrages.map((m) => (
              <button key={m.id} type="button" onClick={() => open(m)} className="block w-full rounded-xl border border-stone-200 p-2 text-left hover:border-brand-700">
                <MatchLine m={m} name={name} />
              </button>
            ))}
          </div>
        </Card>
      )}

      {preview && !view.event.knockout && (
        <Card className="border-emerald-300 bg-emerald-50">
          <h3 className="text-lg font-semibold">Klaar voor het A- en B-schema</h3>
          <p className="text-sm text-stone-700">
            A-schema: {preview.A.length} spelers · B-schema: {preview.B.length} spelers. Byes gaan naar de beste poulewinnaars; poulegenoten komen elkaar niet in de eerste ronde tegen.
          </p>
          <Button size="xl" block className="mt-3" onClick={() => setConfirmKo(true)}>
            A- en B-schema maken
          </Button>
          {ko.error && <ErrorBox error={ko.error} />}
        </Card>
      )}

      {view.event.knockout && !koPlayed && (
        <p className="text-sm text-stone-600">
          Een pouleuitslag fout ingevoerd?{' '}
          <button type="button" className="underline" onClick={() => undo.mutate()}>
            KO-schema’s weer verwijderen
          </button>
          , corrigeer de uitslag en maak ze opnieuw.
        </p>
      )}
      {undo.error && <ErrorBox error={undo.error} />}

      <div className="grid gap-4 md:grid-cols-2">
        {status.standings.map((s) => {
          const pool = view.pools.find((p) => p.id === s.poolId);
          const ms = view.matches.filter((m) => m.stage === 'pool' && m.poolId === s.poolId).sort((a, b) => a.round - b.round || a.position - b.position);
          return (
            <div key={s.poolId} className="space-y-2">
              <PoolTable standing={s} label={pool?.label ?? s.poolId} advance={config.advance} name={name} />
              <details className="rounded-xl bg-white p-2">
                <summary className="cursor-pointer text-sm text-stone-600">Matchen ({ms.filter(isFinished).length}/{ms.length})</summary>
                <div className="mt-2 space-y-1">
                  {ms.map((m) => (
                    <button key={m.id} type="button" onClick={() => open(m)} className="block w-full rounded-lg p-1.5 text-left hover:bg-stone-100">
                      <MatchLine m={m} name={name} compact />
                    </button>
                  ))}
                </div>
              </details>
            </div>
          );
        })}
      </div>
      {modal}
      <ConfirmModal open={confirmKo} title="A- en B-schema maken?" confirmLabel="Schema's maken" busy={ko.isPending} onClose={() => setConfirmKo(false)} onConfirm={() => ko.mutate()}>
        De poulestanden worden vastgelegd. Corrigeer eerst eventuele foute pouleuitslagen.
      </ConfirmModal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Schema's
// ---------------------------------------------------------------------------

export function BracketPanel({ view, name, readOnly }: { view: EventView; name: NameFn; readOnly?: boolean }) {
  const { open, modal } = useMatchModal(view, name);
  const live = new Set((view.replay?.boards ?? []).map((b) => b.matchId).filter((x): x is string => Boolean(x)));
  if (!view.event.knockout) return <Empty>De A- en B-schema’s worden gemaakt zodra de poules gespeeld zijn.</Empty>;
  return (
    <div className="space-y-6">
      <div>
        <SectionTitle>A-schema</SectionTitle>
        <Bracket stage="A" matches={view.matches} name={name} onMatch={readOnly ? undefined : (m) => open(m)} highlight={live} />
      </div>
      <div>
        <SectionTitle>B-schema</SectionTitle>
        <Bracket stage="B" matches={view.matches} name={name} onMatch={readOnly ? undefined : (m) => open(m)} highlight={live} />
      </div>
      {modal}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Afsluiten
// ---------------------------------------------------------------------------

export function FinishPanel({ view, name, settings }: { view: EventView; name: NameFn; settings: SeasonSettings }) {
  const refresh = useRefresh(view.event.id);
  const [confirm, setConfirm] = useState(false);
  const [reset, setReset] = useState(false);
  const [resetText, setResetText] = useState('');
  const placements = view.placements;
  const points = placements ? eventPoints(placements.placements, settings.points) : [];
  const finalize = useMutation({
    mutationFn: () =>
      finalizeEvent(
        view.event.id,
        points.map((p) => ({
          player_id: p.playerId,
          place_from: p.placeFrom,
          place_to: p.placeTo,
          placement_points: p.placementPoints,
          participation_points: p.participationPoints,
          points: p.total,
        })),
      ),
    onSuccess: async () => {
      setConfirm(false);
      await refresh();
    },
  });
  const doReset = useMutation({
    mutationFn: () => resetTournament(view.event.id),
    onSuccess: async () => {
      setReset(false);
      await refresh();
    },
  });

  return (
    <div className="space-y-4">
      {!placements?.complete ? (
        <InfoBox>De eindplaatsen zijn pas gekend als alle matchen gespeeld zijn.</InfoBox>
      ) : (
        <>
          {view.event.status === 'afgelopen' ? (
            <InfoBox tone="green">
              Deze avond is afgesloten op {view.event.finalized_at ? formatTime(Date.parse(view.event.finalized_at)) : ''}. Na een correctie kan je de punten opnieuw berekenen.
            </InfoBox>
          ) : (
            <InfoBox tone="green">Alle matchen zijn gespeeld. Controleer de eindplaatsen en sluit de avond af om de ranking bij te werken.</InfoBox>
          )}
          <PlacementsTable placements={placements.placements} name={name} points={new Map(points.map((p) => [p.playerId, p.total]))} />
          <Button size="xl" block variant="success" onClick={() => setConfirm(true)}>
            {view.event.status === 'afgelopen' ? 'Punten opnieuw berekenen' : 'Avond afsluiten'}
          </Button>
          {finalize.error && <ErrorBox error={finalize.error} />}
        </>
      )}

      <details className="mt-8 rounded-xl border border-red-200 bg-white p-3">
        <summary className="cursor-pointer font-semibold text-red-800">Gevarenzone</summary>
        <p className="mt-2 text-sm text-stone-600">
          Toernooi volledig terugzetten: alle poules, matchen en uitslagen van deze avond worden gewist. De check-in blijft bewaard.
        </p>
        <Button variant="danger" className="mt-2" onClick={() => setReset(true)}>
          Toernooi terugzetten
        </Button>
      </details>

      <ConfirmModal open={confirm} title="Avond afsluiten?" confirmLabel="Afsluiten" busy={finalize.isPending} onClose={() => setConfirm(false)} onConfirm={() => finalize.mutate()}>
        De eindplaatsen en punten worden opgeslagen en de seizoensranking wordt bijgewerkt.
      </ConfirmModal>
      <ConfirmModal
        open={reset}
        title="Toernooi terugzetten"
        danger
        confirmLabel="Alles wissen"
        busy={doReset.isPending}
        disabled={resetText.trim().toUpperCase() !== 'WISSEN'}
        onClose={() => setReset(false)}
        onConfirm={() => doReset.mutate()}
      >
        <p className="mb-2">Typ WISSEN om te bevestigen.</p>
        <TextInput value={resetText} onChange={(e) => setResetText(e.target.value)} />
        {doReset.error && <ErrorBox error={doReset.error} />}
      </ConfirmModal>
    </div>
  );
}
