import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { Match } from '../../engine';
import { checkScorerPin, isNetworkError } from '../../data/api';
import { useAuth } from '../../data/auth';
import { buildEventView } from '../../data/eventView';
import { outbox, usePendingScores } from '../../data/outbox';
import { useEventBundle, usePlayerDirectory } from '../../data/queries';
import { formatLongDate } from '../../lib/time';
import { MatchLine, matchTitle } from '../components/darts';
import { ScoreEntry } from '../components/ScoreEntry';
import { SyncBadge } from '../components/SyncBadge';
import { Badge, Button, Empty, ErrorBox, InfoBox, Modal, Spinner } from '../components/ui';
import { useNow, useUpcoming } from '../hooks';

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
    <div className="mx-auto max-w-sm text-center">
      <h1 className="mb-1 text-2xl font-bold text-brand-900">Scores invoeren</h1>
      <p className="mb-4 text-stone-600">Geef de pincode van vanavond (te krijgen bij de wedstrijdleider).</p>
      <div className="mb-4 h-16 rounded-2xl border-2 border-stone-300 bg-white font-mono text-4xl leading-[3.6rem] tracking-[0.5em]">{value.replace(/./g, '•')}</div>
      <div className="grid grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'OK'].map((k) => (
          <Button
            key={k}
            size="xl"
            variant={k === 'OK' ? 'primary' : 'secondary'}
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
      {error && <div className="mt-4"><ErrorBox>{error}</ErrorBox></div>}
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
        className="block w-full rounded-2xl border-2 border-stone-200 bg-white p-4 text-left shadow-sm hover:border-brand-700 disabled:opacity-70"
      >
        <div className="mb-1 flex items-center justify-between text-sm text-stone-500">
          <span>
            {board !== undefined && <span className="mr-2 text-lg font-bold text-brand-900">Bord {board}</span>}
            {matchTitle(m, view)} · bo{m.bestOf}
          </span>
          {p && <Badge tone="amber">⏳ wordt verstuurd</Badge>}
        </div>
        <div className="text-xl font-semibold">
          <MatchLine m={m} name={name} pending={p?.data} />
        </div>
      </button>
    );
  };

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-brand-900">Scores · {formatLongDate(view.event.event_date)}</h1>
          <p className="text-sm text-stone-500">Tik op jouw bord om de uitslag in te voeren.</p>
        </div>
        <SyncBadge />
      </div>

      {onBoards.length === 0 ? <Empty>Er wordt nu op geen enkel bord gespeeld.</Empty> : <div className="space-y-3">{onBoards.map((b) => card(b.match, b.board))}</div>}

      <div>
        <button type="button" className="text-brand-800 underline" onClick={() => setShowAll((s) => !s)}>
          {showAll ? 'Andere matchen verbergen' : `Andere match (${open.length})`}
        </button>
        {showAll && <div className="mt-3 space-y-2">{open.map((m) => card(m))}</div>}
      </div>

      {pin && (
        <button type="button" className="text-sm text-stone-500 underline" onClick={() => {
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
