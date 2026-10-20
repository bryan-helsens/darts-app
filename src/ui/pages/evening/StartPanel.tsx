import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  createRng,
  estimatePlan,
  layoutOptions,
  startPools,
  suggestAdjustments,
  type LegsSettings,
  type PlanInput,
  type SeasonSettings,
} from '../../../engine';
import { startTournament, updateEvent } from '../../../data/api';
import { matchToInsert, poolsToInsert, type TournamentConfig } from '../../../data/mappers';
import { keys } from '../../../data/queries';
import type { EventRow, RegistrationRow } from '../../../data/rows';
import { brusselsToUtc, formatTime, shortTime } from '../../../lib/time';
import { Button, Card, ConfirmModal, cx, ErrorBox, Field, InfoBox, Select, Stepper } from '../../components/ui';
import { useNow } from '../../hooks';

function LegsSelect({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <Field label={label}>
      <Select value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {[1, 3, 5, 7].map((n) => (
          <option key={n} value={n}>
            best of {n}
          </option>
        ))}
      </Select>
    </Field>
  );
}

/** Toernooi starten: indeling kiezen met geschatte eindtijd, dan poules loten. */
export function StartPanel({
  event,
  registrations,
  settings,
  seedRanks,
}: {
  event: EventRow;
  registrations: RegistrationRow[];
  settings: SeasonSettings;
  seedRanks: Map<string, number>;
}) {
  const qc = useQueryClient();
  const now = useNow(60_000);
  const present = registrations.filter((r) => r.present && !r.withdrawn_at);
  const n = present.length;
  const options = useMemo(() => layoutOptions(n), [n]);
  const [layoutId, setLayoutId] = useState<string | null>(null);
  const layout = options.find((o) => o.id === layoutId) ?? options[0];
  const [advanceOverride, setAdvance] = useState<number | null>(null);
  const [boards, setBoards] = useState(event.boards);
  const [mainBoard, setMainBoard] = useState(event.main_board);
  const [legs, setLegs] = useState<LegsSettings>(settings.legs);
  const [holdFinal, setHoldFinal] = useState(settings.holdFinal);
  const [showLegs, setShowLegs] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const plannedStart = Math.max(now, brusselsToUtc(event.event_date, shortTime(event.start_time)));
  const limit = brusselsToUtc(event.event_date, settings.endLimit);
  const multi = (layout?.sizes.length ?? 0) > 1;
  const advance = advanceOverride ?? (multi ? Math.min(settings.advancePerPool, Math.min(...(layout?.sizes ?? [2])) - 1) : (layout?.advanceToA ?? 2));

  const plan = (sizes: number[], adv: number): PlanInput => ({
    sizes,
    advance: adv,
    boards,
    mainBoard,
    legs,
    timing: settings.timing,
    holdFinal,
    start: plannedStart,
  });
  const estimates = useMemo(
    () => new Map(options.map((o) => [o.id, estimatePlan(plan(o.sizes, o.id === layout?.id ? advance : o.sizes.length > 1 ? Math.min(settings.advancePerPool, Math.min(...o.sizes) - 1) : o.advanceToA))])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [options, boards, mainBoard, legs, holdFinal, plannedStart, advance, layout?.id],
  );
  const current = layout ? estimates.get(layout.id) : undefined;
  const tooLate = current ? current.end > limit : false;
  const suggestions = useMemo(
    () => (layout && tooLate ? suggestAdjustments(plan(layout.sizes, advance), limit).slice(0, 4) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layout?.id, tooLate, advance, boards, legs, holdFinal, limit],
  );

  const start = useMutation({
    mutationFn: async () => {
      if (!layout) return;
      const players = present.map((r) => ({ id: r.player_id, seedRank: seedRanks.get(r.player_id) ?? null }));
      const { pools, matches } = startPools({ players, sizes: layout.sizes, bestOf: legs.pool, rng: createRng(event.rng_seed), createdAt: 0 });
      const config: TournamentConfig = {
        layoutId: layout.id,
        sizes: layout.sizes,
        advance,
        legs,
        timing: settings.timing,
        boards: Array.from({ length: boards }, (_, i) => i + 1),
        mainBoard,
        holdFinal,
      };
      await updateEvent(event.id, { boards, main_board: mainBoard });
      await startTournament(event.id, poolsToInsert(pools), matches.map(matchToInsert), config);
    },
    onSuccess: async () => {
      setConfirm(false);
      await qc.invalidateQueries({ queryKey: keys.event(event.id) });
      await qc.invalidateQueries({ queryKey: keys.events });
    },
  });

  if (n < 4) {
    return <InfoBox>Er zijn minstens 4 aanwezige spelers nodig om te starten (nu {n}). Vink de aanwezigen aan bij de check-in.</InfoBox>;
  }

  const ranked = present.filter((r) => seedRanks.has(r.player_id)).length;

  return (
    <div className="space-y-3">
      <Card className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-ink text-lg font-bold text-white tabular-nums">{n}</span>
        <div className="min-w-0">
          <div className="font-semibold text-zinc-950">{n} aanwezige spelers</div>
          <p className="text-xs text-zinc-500">
            Seeding op de seizoensranking: {ranked} speler{ranked === 1 ? '' : 's'} met ranking, {n - ranked} zonder (worden willekeurig verdeeld).
          </p>
        </div>
      </Card>

      <div>
        <h3 className="mb-1.5 text-xs font-bold tracking-wider text-zinc-500 uppercase">Poule-indeling</h3>
        <div className="space-y-1.5">
          {options.map((o) => {
            const est = estimates.get(o.id);
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  setLayoutId(o.id);
                  setAdvance(null);
                }}
                className={cx(
                  'flex w-full items-center justify-between gap-3 rounded-xl border bg-white px-3 py-2 text-left transition-colors',
                  o.id === layout?.id ? 'border-brand-600 ring-1 ring-brand-600' : 'border-zinc-200 hover:border-zinc-300',
                )}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className={cx('h-4 w-4 shrink-0 rounded-full border-2', o.id === layout?.id ? 'border-[5px] border-brand-600' : 'border-zinc-300')} />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-zinc-950">
                      {o.label} {o.standard && <span className="ml-1 text-xs font-medium text-brand-700">standaard</span>}
                    </div>
                    <div className="text-xs text-zinc-500">{est && `${est.poolMatches} poulematchen · A ${est.A} / B ${est.B} spelers`}</div>
                  </div>
                </div>
                {est && (
                  <div className={cx('text-right text-base font-bold tabular-nums', est.end > limit ? 'text-accent-600' : 'text-zinc-950')}>
                    ±{formatTime(est.end)}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <Card className="grid grid-cols-2 items-end gap-3 sm:grid-cols-3">
        <Field label={multi ? 'Naar A per poule' : 'Spelers naar A'}>
          <Stepper value={advance} onChange={setAdvance} min={1} max={multi ? Math.min(...(layout?.sizes ?? [2])) - 1 : (layout?.sizes[0] ?? 2) - 1} />
        </Field>
        <Field label="Aantal borden">
          <Stepper value={boards} onChange={setBoards} min={1} max={16} />
        </Field>
        <div className="col-span-2 sm:col-span-1">
          <Field label="Hoofdbord (A-finale)">
            <Select value={mainBoard} onChange={(e) => setMainBoard(Number(e.target.value))}>
              {Array.from({ length: boards }, (_, i) => i + 1).map((b) => (
                <option key={b} value={b}>
                  Bord {b}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-zinc-950">Legs per ronde</h3>
            <p className="text-xs text-zinc-500">
              Poules bo{legs.pool} · A: bo{legs.A.early} / halve bo{legs.A.semi} / finale bo{legs.A.final} · B: bo{legs.B.early} / halve bo{legs.B.semi} / finale bo
              {legs.B.final}
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setShowLegs((s) => !s)}>
            {showLegs ? 'Klaar' : 'Wijzigen'}
          </Button>
        </div>
        {showLegs && (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <LegsSelect label="Poules" value={legs.pool} onChange={(v) => setLegs((l) => ({ ...l, pool: v }))} />
            <LegsSelect label="A t.e.m. kwart" value={legs.A.early} onChange={(v) => setLegs((l) => ({ ...l, A: { ...l.A, early: v } }))} />
            <LegsSelect label="A halve finale" value={legs.A.semi} onChange={(v) => setLegs((l) => ({ ...l, A: { ...l.A, semi: v } }))} />
            <LegsSelect label="A finale" value={legs.A.final} onChange={(v) => setLegs((l) => ({ ...l, A: { ...l.A, final: v } }))} />
            <LegsSelect label="Barrage" value={legs.barrage} onChange={(v) => setLegs((l) => ({ ...l, barrage: v }))} />
            <LegsSelect label="B t.e.m. kwart" value={legs.B.early} onChange={(v) => setLegs((l) => ({ ...l, B: { ...l.B, early: v } }))} />
            <LegsSelect label="B halve finale" value={legs.B.semi} onChange={(v) => setLegs((l) => ({ ...l, B: { ...l.B, semi: v } }))} />
            <LegsSelect label="B finale" value={legs.B.final} onChange={(v) => setLegs((l) => ({ ...l, B: { ...l.B, final: v } }))} />
          </div>
        )}
        <label className="mt-3 flex items-center gap-2.5 text-sm">
          <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={holdFinal} onChange={(e) => setHoldFinal(e.target.checked)} />
          A-finale als laatste op het hoofdbord (iedereen kan meekijken)
        </label>
      </Card>

      {current && (
        <div className="rounded-xl bg-ink p-3 text-white sm:p-4">
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-xs font-medium tracking-wide text-zinc-400 uppercase">Geschatte eindtijd</div>
            {tooLate ? <span className="rounded-md bg-accent-600 px-1.5 py-0.5 text-xs font-bold">te laat</span> : <span className="rounded-md bg-brand-600 px-1.5 py-0.5 text-xs font-bold">op tijd</span>}
          </div>
          <div className="text-4xl font-bold tabular-nums">{formatTime(current.end)}</div>
          <div className="text-xs text-zinc-400">
            Poules klaar rond {formatTime(current.poolsEnd)} · uitgaande van {settings.timing.minutesPerLeg} min per leg en {settings.timing.changeoverMinutes} min wisseltijd ·
            liefst klaar om {formatTime(limit)}
          </div>
          {suggestions.length > 0 && (
            <div className="mt-3">
              <div className="text-sm font-semibold">Voorstellen om sneller klaar te zijn:</div>
              <div className="mt-1.5 space-y-1.5">
                {suggestions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-2 rounded-lg bg-white/10 px-2.5 py-2 text-left text-sm hover:bg-white/15"
                    onClick={() => {
                      setLegs(s.plan.legs);
                      setHoldFinal(s.plan.holdFinal);
                      setBoards(s.plan.boards);
                      const target = options.find((o) => o.id === s.plan.sizes.join('-'));
                      if (target) setLayoutId(target.id);
                      setAdvance(s.plan.advance);
                    }}
                  >
                    <span>{s.label}</span>
                    <span className={cx('font-bold tabular-nums', s.meetsLimit ? 'text-brand-300' : 'text-zinc-400')}>±{formatTime(s.estimate.end)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <Button size="xl" block onClick={() => setConfirm(true)}>
        Toernooi starten
      </Button>
      {start.error && <ErrorBox error={start.error} />}

      <ConfirmModal
        open={confirm}
        title="Toernooi starten?"
        confirmLabel="Starten en poules loten"
        busy={start.isPending}
        onClose={() => setConfirm(false)}
        onConfirm={() => start.mutate()}
      >
        <p>
          {n} spelers in {layout?.label}, top {advance} {multi ? 'per poule' : ''} naar het A-schema, {boards} borden.
        </p>
        <p className="mt-2">Na de start kunnen er geen spelers meer bijkomen. De poules worden nu geloot.</p>
      </ConfirmModal>
    </div>
  );
}
