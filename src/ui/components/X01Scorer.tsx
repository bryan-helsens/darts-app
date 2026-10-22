/**
 * 501 per beurt: de schrijver tikt per beurt de gegooide punten in. De gsm
 * houdt de lopende leg zelf bij (ook zonder wifi, ook na herladen); na elke
 * leg gaat de stand via de outbox naar de server, bij de laatste leg ook de
 * uitslag. Eén duim: alles wat je tijdens een leg nodig hebt, staat onderaan.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  applyVisit,
  checkoutOptions,
  checkoutSuggestion,
  formatCheckout,
  legStarter,
  legState,
  matchScore,
  matchStats,
  newLeg,
  threeDartAverage,
  undoVisit,
  visitSlot,
  type CheckoutDarts,
  type Leg,
  type Match,
  type Slot,
  type VisitInput,
} from '../../engine';
import { legsToPayload } from '../../data/mappers';
import { outbox, useOutbox } from '../../data/outbox';
import { deleteSession, loadSession, saveSession, startSession, type X01Session } from '../../data/x01Sessions';
import { formatDecimal } from '../../lib/format';
import { legRounds, RoundCells } from './LegsDetail';
import { Button, ConfirmModal, cx, ErrorBox, Icon, Spinner } from './ui';

type NameFn = (id: string | null | undefined) => string;

const QUICK = [26, 41, 45, 60, 81, 85, 100, 140, 180];

const BUST_TEXT = {
  over: 'Bust: meer dan de rest.',
  'one-left': 'Bust: 1 over kan niet.',
  'no-checkout': 'Bust: zo kan je niet uitgooien.',
  manual: 'Bust.',
} as const;

/** Bull-off: wie begint de eerste leg? Maakt de sessie aan op dit toestel. */
export function X01Start({
  eventId,
  match,
  board,
  name,
  onStarted,
}: {
  eventId: string;
  match: Match;
  board: number | null;
  name: NameFn;
  onStarted: (session: X01Session) => void;
}) {
  const [busy, setBusy] = useState(false);
  const start = async (first: Slot) => {
    setBusy(true);
    onStarted(await startSession(eventId, match, first, board));
  };
  return (
    <div className="space-y-2" data-x01-start>
      <p className="text-xs text-zinc-500">
        Wie begint? Gooi om de bull. Daarna begint om beurten de andere speler. Best of {match.bestOf}.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {([1, 2] as const).map((slot) => (
          <Button key={slot} size="xl" variant="secondary" className="truncate" disabled={busy} onClick={() => void start(slot)}>
            {name(slot === 1 ? match.player1 : match.player2)}
          </Button>
        ))}
      </div>
    </div>
  );
}

/** Het scorebord zelf (volledig scherm). */
export function X01Scorer({
  eventId,
  match,
  title,
  pin,
  name,
  onExit,
  onQuick,
}: {
  eventId: string;
  match: Match;
  /** Bv. "Bord 3 · Poule 2". */
  title: string;
  pin: string | null;
  name: NameFn;
  /** Terug naar de lijst (de match blijft op dit toestel bewaard). */
  onExit: () => void;
  /** Toch snel invoeren (de beurten worden gewist). */
  onQuick: () => void;
}) {
  const [session, setSession] = useState<X01Session | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void loadSession(eventId, match.id).then((s) => {
      if (cancelled) return;
      // Spelers intussen veranderd (bv. een correctie): opnieuw beginnen.
      if (s && (s.player1 !== match.player1 || s.player2 !== match.player2)) {
        void deleteSession(eventId, match.id);
        setSession(null);
      } else setSession(s);
    });
    return () => {
      cancelled = true;
    };
  }, [eventId, match.id, match.player1, match.player2]);

  if (session === undefined) return <Overlay><Spinner /></Overlay>;
  if (session === null) {
    return (
      <Overlay>
        <div className="mx-auto w-full max-w-md p-4">
          <h2 className="mb-2 text-base font-semibold">501 per beurt</h2>
          <X01Start eventId={eventId} match={match} board={null} name={name} onStarted={setSession} />
          <Button variant="ghost" size="sm" block className="mt-3" onClick={onExit}>
            Terug
          </Button>
        </div>
      </Overlay>
    );
  }
  return <Board session={session} setSession={setSession} title={title} pin={pin} name={name} onExit={onExit} onQuick={onQuick} />;
}

function Overlay({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-canvas" role="dialog" aria-modal="true" aria-label="501 per beurt">
      {children}
    </div>
  );
}

function Board({
  session,
  setSession,
  title,
  pin,
  name,
  onExit,
  onQuick,
}: {
  session: X01Session;
  setSession: (s: X01Session) => void;
  title: string;
  pin: string | null;
  name: NameFn;
  onExit: () => void;
  onQuick: () => void;
}) {
  const [input, setInput] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [askDarts, setAskDarts] = useState<{ score: number; options: CheckoutDarts[] } | null>(null);
  const [confirmQuick, setConfirmQuick] = useState(false);
  const { failed } = useOutbox();
  const failures = failed.filter((i) => i.kind === 'legs' && i.data.eventId === session.eventId && i.data.code === session.code);

  const players = [session.player1, session.player2] as const;
  const current = session.current;
  const state = legState(current);
  const legWon = state.winner !== null;
  const all = legWon ? [...session.legs, current] : session.legs;
  const score = matchScore(all, session.bestOf);
  const stats = matchStats([...session.legs, current]);
  const active = legWon ? null : state.toThrow;
  const rest = active ? state.remaining[active - 1] : 0;
  const route = active && rest <= 170 ? checkoutSuggestion(rest) : null;

  const update = (patch: Partial<X01Session>) => {
    const next = { ...session, ...patch, updatedAt: Date.now() };
    setSession(next);
    void saveSession(next);
  };

  const enter = (visit: VisitInput) => {
    const outcome = applyVisit(current, visit);
    if (outcome.kind === 'invalid') {
      setMessage(outcome.message);
      return;
    }
    if (outcome.kind === 'needs-darts') {
      setAskDarts({ score: 'score' in visit ? visit.score : 0, options: outcome.options });
      return;
    }
    setAskDarts(null);
    setInput('');
    setMessage(outcome.kind === 'bust' ? BUST_TEXT[outcome.reason] : null);
    update({ current: outcome.leg });
  };

  const send = (legs: Leg[], final: boolean) => {
    const s = matchScore(legs, session.bestOf);
    const label = `${name(session.player1)} – ${name(session.player2)} ${s.legs[0]}–${s.legs[1]}`;
    void outbox.addLegs(
      {
        eventId: session.eventId,
        code: session.code,
        pin,
        player1: session.player1,
        player2: session.player2,
        legs: legsToPayload(legs),
        legs1: s.legs[0],
        legs2: s.legs[1],
        final,
        session: session.id,
        clientId: crypto.randomUUID(),
        board: session.board,
      },
      final ? label : `${label} (leg ${legs.length})`,
    );
  };

  const nextLeg = () => {
    const legs = [...session.legs, current];
    send(legs, false);
    setMessage(null);
    update({ legs, current: newLeg(legStarter(session.first, legs.length)) });
  };

  const finish = async () => {
    send([...session.legs, current], true);
    await deleteSession(session.eventId, session.code);
    onExit();
  };

  const undo = () => {
    setMessage(null);
    setAskDarts(null);
    update({ current: undoVisit(current) });
  };

  const typed = input === '' ? null : Number(input);
  const press = (key: string) => {
    setMessage(null);
    if (key === '⌫') setInput((v) => v.slice(0, -1));
    else if (input.length < 3) setInput((v) => (v === '0' ? key : v + key));
  };

  return (
    <Overlay>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        {/* Kop */}
        <div className="flex h-12 shrink-0 items-center gap-1 bg-ink px-2 text-white">
          <button type="button" onClick={onExit} className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-white/10" aria-label="Terug">
            <Icon name="back" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold">{title}</div>
            <div className="truncate text-2xs text-zinc-400">
              501 · best of {session.bestOf} · leg {Math.min(all.length + (legWon ? 0 : 1), session.bestOf)}
            </div>
          </div>
          <button type="button" onClick={() => setConfirmQuick(true)} className="h-8 rounded-md px-2 text-2xs font-medium text-zinc-300 ring-1 ring-white/15 hover:bg-white/10">
            Snel invoeren
          </button>
        </div>

        {/* Spelers */}
        <div className="grid grid-cols-2 gap-2 p-2">
          {players.map((p, i) => {
            const slot = (i + 1) as Slot;
            const on = active === slot;
            const last = lastVisit(current, slot);
            return (
              <div
                key={slot}
                data-x01-player={slot}
                className={cx('min-w-0 rounded-lg px-2.5 py-2', on ? 'bg-ink text-white shadow-sm' : 'bg-white text-zinc-900 ring-1 ring-zinc-200')}
              >
                <div className="flex items-center gap-1.5">
                  {current.starter === slot && <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', on ? 'bg-accent-500' : 'bg-accent-600')} title="Begon deze leg" />}
                  <span className="truncate text-[13px] font-semibold">{name(p)}</span>
                  <span className={cx('ml-auto text-sm font-semibold tabular-nums', on ? 'text-white' : 'text-zinc-500')} aria-label="legs">
                    {score.legs[i]}
                  </span>
                </div>
                <div className="text-4xl leading-tight font-semibold tabular-nums" data-x01-rest>
                  {state.remaining[i]}
                </div>
                <div className={cx('flex justify-between gap-1 text-2xs tabular-nums', on ? 'text-zinc-400' : 'text-zinc-500')}>
                  <span>gem. {formatDecimal(threeDartAverage(stats[i]))}</span>
                  <span>{last === null ? '' : last === 'bust' ? 'bust' : `vorige ${last}`}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Uitgooi-suggestie of melding */}
        <div className="flex min-h-7 items-center justify-center px-3 text-center text-[13px]" aria-live="polite">
          {message ? (
            <span className="font-medium text-accent-700">{message}</span>
          ) : active && rest <= 170 ? (
            route ? (
              <span data-x01-route>
                <span className="text-zinc-500">Uitgooi </span>
                <span className="font-semibold text-zinc-950">{formatCheckout(route)}</span>
              </span>
            ) : (
              <span className="text-zinc-500">Geen uitgooi mogelijk met drie darts</span>
            )
          ) : null}
        </div>

        {/* Beurten van deze leg (de laatste onderaan, zichtbaar boven het klavier). */}
        <div className="flex min-h-0 flex-1 flex-col justify-end px-2">
          {current.visits.length > 0 && <Visits leg={current} />}
        </div>

        {failures.map((f) => (
          <div key={f.id} className="px-2 pb-1">
            <ErrorBox>{f.message}</ErrorBox>
          </div>
        ))}

        <div className="space-y-1.5 p-2 safe-bottom">
          {legWon ? (
            <LegEnd
              session={session}
              current={current}
              decided={score.winner !== null}
              name={name}
              onUndo={undo}
              onNext={nextLeg}
              onFinish={() => void finish()}
            />
          ) : askDarts ? (
            <div className="space-y-2 rounded-lg bg-white p-3 ring-1 ring-zinc-200" data-x01-darts>
              <p className="text-center text-sm font-semibold">{askDarts.score} uitgegooid: in hoeveel darts?</p>
              <div className="grid grid-cols-3 gap-1.5">
                {([1, 2, 3] as const).map((d) => (
                  <Button key={d} size="xl" disabled={!askDarts.options.includes(d)} onClick={() => enter({ score: askDarts.score, checkoutDarts: d })}>
                    {d}
                  </Button>
                ))}
              </div>
              <Button variant="ghost" size="sm" block onClick={() => setAskDarts(null)}>
                Annuleren
              </Button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-[1fr_1.4fr_1fr] gap-1.5">
                <Button size="xl" variant="secondary" disabled={current.visits.length === 0} onClick={undo} aria-label="Ongedaan maken">
                  <Icon name="undo" />
                </Button>
                <div
                  className={cx('flex h-11 items-center justify-center rounded-lg text-2xl font-semibold tabular-nums ring-1 ring-inset', typed !== null && typed > 180 ? 'text-accent-700 ring-accent-300' : 'ring-zinc-200 bg-white')}
                  data-x01-input
                >
                  {input || <span className="text-sm font-normal text-zinc-400">score</span>}
                </div>
                <Button size="xl" variant="secondary" disabled={rest > 181} onClick={() => enter({ bust: true })}>
                  Bust
                </Button>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {QUICK.map((q) => (
                  <Button key={q} size="xl" variant="secondary" className="px-0 tabular-nums" onClick={() => enter({ score: q })}>
                    {q}
                  </Button>
                ))}
                <Button
                  size="xl"
                  variant="secondary"
                  className="px-0 text-accent-700"
                  disabled={checkoutOptions(rest).length === 0}
                  onClick={() => enter({ score: rest })}
                  aria-label={`Uitgooien (${rest})`}
                >
                  Uit
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0'].map((k) => (
                  <Button key={k} size="xl" variant="secondary" className="text-lg tabular-nums" onClick={() => press(k)} aria-label={k === '⌫' ? 'Wissen' : undefined}>
                    {k}
                  </Button>
                ))}
                <Button size="xl" disabled={typed === null || typed > 180} onClick={() => typed !== null && enter({ score: typed })}>
                  OK
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      <ConfirmModal
        open={confirmQuick}
        title="Snel invoeren?"
        confirmLabel="Ja, snel invoeren"
        onConfirm={async () => {
          await deleteSession(session.eventId, session.code);
          onQuick();
        }}
        onClose={() => setConfirmQuick(false)}
      >
        De beurten van deze match worden niet bewaard. Je voert enkel de legs in.
      </ConfirmModal>
    </Overlay>
  );
}

/** Beurten van de lopende leg; scrolt mee naar de laatste. */
function Visits({ leg }: { leg: Leg }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [leg.visits.length]);
  return (
    <div ref={ref} className="min-h-0 overflow-y-auto rounded-lg bg-white ring-1 ring-zinc-200" data-x01-visits>
      <table className="w-full text-xs tabular-nums">
        <tbody>
          {legRounds(leg).map((r, i) => (
            <tr key={i} className="border-t border-zinc-100 first:border-t-0">
              <td className="w-7 py-0.5 text-center text-zinc-400">{i + 1}</td>
              <RoundCells round={r} slot={1} />
              <RoundCells round={r} slot={2} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Wat de speler in de lopende leg het laatst gooide (null = nog niet). */
function lastVisit(leg: Leg, slot: Slot): number | 'bust' | null {
  for (let i = leg.visits.length - 1; i >= 0; i--) {
    if (visitSlot(leg.starter, i) !== slot) continue;
    return leg.visits[i].bust ? 'bust' : leg.visits[i].score;
  }
  return null;
}

/** Einde van een leg: nog ongedaan te maken; bij de laatste leg het bevestigingsscherm. */
function LegEnd({
  session,
  current,
  decided,
  name,
  onUndo,
  onNext,
  onFinish,
}: {
  session: X01Session;
  current: Leg;
  decided: boolean;
  name: NameFn;
  onUndo: () => void;
  onNext: () => void;
  onFinish: () => void;
}) {
  const state = legState(current);
  const w = state.winner as Slot;
  const winnerId = w === 1 ? session.player1 : session.player2;
  const legAvg = threeDartAverage({ darts: state.darts[w - 1], points: state.points[w - 1] });

  if (!decided) {
    return (
      <div className="space-y-2 rounded-lg bg-white p-3 ring-1 ring-zinc-200" data-x01-leg-end>
        <p className="text-center text-base font-semibold">Leg voor {name(winnerId)}</p>
        <p className="text-center text-xs text-zinc-500">
          {state.darts[w - 1]} darts · gem. {formatDecimal(legAvg)} · uitgooi {current.visits[current.visits.length - 1].score}
        </p>
        <div className="grid grid-cols-[1fr_2fr] gap-2 pt-1">
          <Button size="xl" variant="secondary" onClick={onUndo}>
            Ongedaan
          </Button>
          <Button size="xl" onClick={onNext}>
            Volgende leg
          </Button>
        </div>
      </div>
    );
  }

  const legs = [...session.legs, current];
  const score = matchScore(legs, session.bestOf);
  const stats = matchStats(legs);
  const players = [session.player1, session.player2];
  const rows: Array<[string, (i: 0 | 1) => string]> = [
    ['Gemiddelde', (i) => formatDecimal(threeDartAverage(stats[i]))],
    ['180’s', (i) => String(stats[i].count180)],
    ['Hoogste score', (i) => String(stats[i].highestScore ?? '–')],
    ['Hoogste uitgooi', (i) => String(stats[i].highestFinish ?? '–')],
  ];
  return (
    <div className="space-y-3" data-x01-confirm>
      <p className="text-center text-xs text-zinc-500">Klopt deze uitslag?</p>
      <div className="rounded-lg bg-ink px-3 py-3 text-white">
        {players.map((p, i) => (
          <div key={p} className="flex items-center justify-between gap-3 py-0.5">
            <span className={cx('truncate text-[15px]', winnerId === p ? 'font-semibold' : 'text-zinc-400')}>{name(p)}</span>
            <span className={cx('text-2xl font-semibold tabular-nums', winnerId === p ? 'text-white' : 'text-zinc-500')}>{score.legs[i]}</span>
          </div>
        ))}
        <table className="mt-2 w-full border-t border-white/10 text-xs tabular-nums">
          <thead className="text-2xs text-zinc-500">
            <tr>
              <th />
              {players.map((p) => (
                <th key={p} className="max-w-0 truncate pt-1 text-right font-medium">
                  {name(p).split(' ')[0]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label}>
                <td className="py-0.5 text-zinc-400">{label}</td>
                <td className="py-0.5 text-right">{value(0)}</td>
                <td className="py-0.5 text-right">{value(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-[1fr_2fr] gap-2">
        <Button size="xl" variant="secondary" onClick={onUndo}>
          Nee, terug
        </Button>
        <Button size="xl" onClick={onFinish}>
          Ja, opslaan
        </Button>
      </div>
    </div>
  );
}
