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
    <div className="space-y-4">
      <Card>
        <div className="text-lg font-semibold">{n} aanwezige spelers</div>
        <p className="text-sm text-stone-600">
          Seeding op de seizoensranking: {ranked} speler{ranked === 1 ? '' : 's'} met ranking, {n - ranked} zonder (worden willekeurig verdeeld).
        </p>
      </Card>

      <div>
        <h3 className="mb-2 font-semibold">Poule-indeling</h3>
        <div className="space-y-2">
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
                  'flex w-full items-center justify-between gap-3 rounded-2xl border-2 bg-white p-3 text-left',
                  o.id === layout?.id ? 'border-brand-800' : 'border-stone-200',
                )}
              >
                <div>
                  <div className="font-semibold">
                    {o.label} {o.standard && <span className="text-sm font-normal text-brand-800">(standaard)</span>}
                  </div>
                  <div className="text-sm text-stone-500">{est && `${est.poolMatches} poulematchen · A ${est.A} / B ${est.B} spelers`}</div>
                </div>
                {est && (
                  <div className={cx('text-right text-lg font-bold tabular-nums', est.end > limit ? 'text-red-700' : 'text-emerald-700')}>
                    ±{formatTime(est.end)}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <Card className="grid gap-4 sm:grid-cols-3">
        <Field label={multi ? 'Doorstromers per poule naar A' : 'Aantal spelers naar A'}>
          <Stepper value={advance} onChange={setAdvance} min={1} max={multi ? Math.min(...(layout?.sizes ?? [2])) - 1 : (layout?.sizes[0] ?? 2) - 1} />
        </Field>
        <Field label="Aantal borden">
          <Stepper value={boards} onChange={setBoards} min={1} max={16} />
        </Field>
        <Field label="Hoofdbord (A-finale)">
          <Select value={mainBoard} onChange={(e) => setMainBoard(Number(e.target.value))}>
            {Array.from({ length: boards }, (_, i) => i + 1).map((b) => (
              <option key={b} value={b}>
                Bord {b}
              </option>
            ))}
          </Select>
        </Field>
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Legs per ronde</h3>
            <p className="text-sm text-stone-600">
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
        <label className="mt-3 flex items-center gap-3">
          <input type="checkbox" className="h-6 w-6" checked={holdFinal} onChange={(e) => setHoldFinal(e.target.checked)} />
          A-finale als laatste op het hoofdbord (iedereen kan meekijken)
        </label>
      </Card>

      {current && (
        <Card className={tooLate ? 'border-red-300 bg-red-50' : 'border-emerald-300 bg-emerald-50'}>
          <div className="text-sm text-stone-600">Geschatte eindtijd</div>
          <div className="text-4xl font-bold tabular-nums">{formatTime(current.end)}</div>
          <div className="text-sm text-stone-600">
            Poules klaar rond {formatTime(current.poolsEnd)} · uitgaande van {settings.timing.minutesPerLeg} min per leg en {settings.timing.changeoverMinutes} min wisseltijd ·
            liefst klaar om {formatTime(limit)}
          </div>
          {suggestions.length > 0 && (
            <div className="mt-3">
              <div className="font-semibold text-red-800">Voorstellen om sneller klaar te zijn:</div>
              <div className="mt-2 space-y-2">
                {suggestions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="flex w-full items-center justify-between rounded-xl border border-stone-200 bg-white p-2 text-left hover:border-brand-700"
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
                    <span className={cx('font-bold tabular-nums', s.meetsLimit ? 'text-emerald-700' : 'text-stone-700')}>±{formatTime(s.estimate.end)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </Card>
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
