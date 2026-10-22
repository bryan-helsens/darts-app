import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { Match } from '../../engine';
import { checkScorerPin, isNetworkError } from '../../data/api';
import { useAuth } from '../../data/auth';
import { buildEventView } from '../../data/eventView';
import { outbox, usePendingScores } from '../../data/outbox';
import { useEventBundle, usePlayerDirectory } from '../../data/queries';
import { formatDate } from '../../lib/time';
import { MatchLine, matchTitle, shortTitle, TileGrid } from '../components/darts';
import { ScoreEntry } from '../components/ScoreEntry';
import { SyncBadge } from '../components/SyncBadge';
import { Badge, Button, Empty, ErrorBox, InfoBox, Modal, SectionTitle, Spinner } from '../components/ui';
import { useNow, useUpcoming } from '../hooks';
import { InstallCard } from '../pwa/InstallCard';

const pinKey = (eventId: string) => `sanapolis-darts-pin-${eventId}`;

function storedPin(eventId: string): string | null {
  try {
    return localStorage.getItem(pinKey(eventId));
  } catch {
    return null;
  }
}

/** Score-invoer voor de schrijver aan het bord, met een pincode per avond. */
export function ScorePage() {
  const { eventId: param } = useParams();
  const { live, isLoading } = useUpcoming();
  const eventId = param ?? live?.id;
  if (isLoading && !param) return <Spinner />;
  if (!eventId) return <Empty>Er is op dit moment geen speelavond bezig.</Empty>;
  return <ScoreForEvent eventId={eventId} />;
}

function ScoreForEvent({ eventId }: { eventId: string }) {
  const { isStaff } = useAuth();
  const [pin, setPin] = useState<string | null>(() => storedPin(eventId));
  if (!isStaff && !pin) return <PinPad eventId={eventId} onOk={setPin} />;
  return <ScoreBoard eventId={eventId} pin={isStaff ? null : pin} onForget={() => setPin(null)} />;
}

function PinPad({ eventId, onOk }: { eventId: string; onOk: (pin: string) => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const check = async () => {
    setBusy(true);
    setError(null);
    try {
      const ok = await checkScorerPin(eventId, value);
      if (!ok) {
        setError('Foute pincode. Vraag de juiste code aan de wedstrijdleider.');
        setValue('');
        return;
      }
      try {
        localStorage.setItem(pinKey(eventId), value);
      } catch {
        // geen opslag: pin enkel voor deze sessie
      }
      onOk(value);
    } catch (e) {
      setError(isNetworkError(e) ? 'Geen verbinding. Probeer opnieuw zodra de wifi werkt.' : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mx-auto max-w-xs pt-2 text-center">
      <h1 className="text-lg font-semibold tracking-tight text-zinc-950">Scores invoeren</h1>
      <p className="mb-3 text-xs text-zinc-500">Geef de pincode van vanavond (te krijgen bij de wedstrijdleider).</p>
      <div className="mb-2 flex h-11 items-center justify-center rounded-lg bg-ink font-mono text-2xl tracking-[0.5em] text-white">
        {value ? value.replace(/./g, '•') : <span className="text-[13px] tracking-normal text-zinc-500">pincode</span>}
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'].map((k) => (
          <Button
            key={k}
            size="xl"
            variant={k === 'OK' ? 'primary' : 'secondary'}
            className="text-lg"
            disabled={busy || (k === 'OK' && value.length < 4)}
            onClick={() => {
              if (k === '⌫') setValue((v) => v.slice(0, -1));
              else if (k === 'OK') void check();
              else if (value.length < 8) setValue((v) => v + k);
            }}
          >
            {k}
          </Button>
        ))}
      </div>
      {error && <div className="mt-3"><ErrorBox>{error}</ErrorBox></div>}
      <InstallCard className="mt-4 text-left" />
    </div>
  );
}

function ScoreBoard({ eventId, pin, onForget }: { eventId: string; pin: string | null; onForget: () => void }) {
  const bundle = useEventBundle(eventId, { live: true });
  const directory = usePlayerDirectory();
  const now = useNow(15_000);
  const pending = usePendingScores(eventId);
  const view = useMemo(() => (bundle.data ? buildEventView(bundle.data, now) : null), [bundle.data, now]);
  const [selected, setSelected] = useState<{ match: Match; board?: number } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const name = directory.name;

  if (bundle.isLoading) return <Spinner />;
  if (!view) return <ErrorBox error={bundle.error ?? 'Speelavond niet gevonden.'} />;
  if (view.event.status !== 'bezig') {
    return <InfoBox>{view.event.status === 'gepland' ? 'Het toernooi is nog niet gestart.' : 'Deze speelavond is afgelopen. Bedankt!'}</InfoBox>;
  }

  const onBoards = (view.replay?.boards ?? []).filter((b) => b.matchId).map((b) => ({ board: b.board, match: view.byCode.get(b.matchId as string) as Match }));
  const open = view.matches.filter((m) => !m.winner && m.player1 && m.player2 && !onBoards.some((b) => b.match.id === m.id));

  const submit = (match: Match, board: number | undefined, legs1: number, legs2: number, stats: Parameters<typeof outbox.addScore>[0]['stats']) => {
    void outbox.addScore(
      { eventId, code: match.id, pin, legs1, legs2, stats, clientId: crypto.randomUUID(), board: board ?? null },
      `${name(match.player1)} – ${name(match.player2)} ${legs1}–${legs2}`,
    );
    setSelected(null);
  };

  const card = (m: Match, board?: number) => {
    const p = pending.get(m.id);
    return (
      <button
        key={m.id}
        type="button"
        disabled={Boolean(p)}
        onClick={() => setSelected({ match: m, board })}
        className="flex min-w-0 flex-col rounded-lg border border-zinc-200/80 bg-white p-2 text-left shadow-xs transition-colors hover:border-brand-500 active:bg-zinc-50 disabled:opacity-70"
      >
        <span className="mb-1 flex min-w-0 items-center gap-1.5">
          {board !== undefined && <span className="shrink-0 rounded bg-ink px-1.5 py-px text-2xs font-semibold text-white">Bord {board}</span>}
          <span className="truncate text-2xs text-zinc-500">
            {shortTitle(m, view)} · bo{m.bestOf}
          </span>
        </span>
        <MatchLine m={m} name={name} compact pending={p?.data} />
        {board !== undefined && view.scorers.get(board) && (
          <span className="mt-1 truncate border-t border-zinc-100 pt-1 text-2xs text-zinc-500">
            <span className="font-medium text-zinc-700">Schrijver</span> {name(view.scorers.get(board))}
          </span>
        )}
        {p && (
          <span className="mt-1">
            <Badge tone="amber">wordt verstuurd</Badge>
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="mx-auto max-w-xl space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="truncate text-lg leading-tight font-semibold tracking-tight text-zinc-950">Scores · {formatDate(view.event.event_date)}</h1>
          <p className="text-xs text-zinc-500">Tik op jouw bord om de uitslag in te voeren.</p>
        </div>
        <SyncBadge onLight />
      </div>

      <SectionTitle>Nu aan het spelen</SectionTitle>
      {onBoards.length === 0 ? <Empty>Er wordt nu op geen enkel bord gespeeld.</Empty> : <TileGrid>{onBoards.map((b) => card(b.match, b.board))}</TileGrid>}

      <div className="pt-1">
        <Button variant="secondary" size="sm" block onClick={() => setShowAll((s) => !s)}>
          {showAll ? 'Andere matchen verbergen' : `Andere match invoeren (${open.length})`}
        </Button>
        {showAll && (
          <div className="mt-2 space-y-2">
            <p className="text-2xs text-zinc-500">Werd een match gespeeld die niet op een bord stond? Kies ze hier en voer de uitslag in.</p>
            <TileGrid>{open.map((m) => card(m))}</TileGrid>
          </div>
        )}
      </div>

      <InstallCard />

      {pin && (
        <button type="button" className="text-2xs text-zinc-500 underline" onClick={() => {
          try {
            localStorage.removeItem(pinKey(eventId));
          } catch {
            // niets
          }
          onForget();
        }}>
          Pincode vergeten op dit toestel
        </button>
      )}

      {selected && (
        <Modal open onClose={() => setSelected(null)} title={selected.board !== undefined ? `Bord ${selected.board}` : 'Uitslag'}>
          <ScoreEntry
            match={selected.match}
            name={name}
            title={matchTitle(selected.match, view)}
            onSubmit={(input) => submit(selected.match, selected.board, input.legs1, input.legs2, input.stats)}
            onCancel={() => setSelected(null)}
          />
        </Modal>
      )}
    </div>
  );
}
