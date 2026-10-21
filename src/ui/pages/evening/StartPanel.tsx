import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  createRng,
  estimateBracketPlan,
  estimatePlan,
  layoutOptions,
  startBracket,
  startPools,
  suggestAdjustments,
  suggestBracketAdjustments,
  type BracketPlanInput,
  type EliminationFormat,
  type LegsSettings,
  type PlanInput,
  type SeasonSettings,
  type SeedingSource,
  type TournamentFormat,
} from '../../../engine';
import { startTournament, updateEvent } from '../../../data/api';
import { FORMAT_LABEL } from '../../../data/eventView';
import { matchToInsert, poolsToInsert, type TournamentConfig } from '../../../data/mappers';
import { keys } from '../../../data/queries';
import type { EventRow, RegistrationRow } from '../../../data/rows';
import { brusselsToUtc, formatTime, shortTime } from '../../../lib/time';
import { Button, Card, ConfirmModal, cx, ErrorBox, Field, InfoBox, List, rowClass, rowHover, Segmented, Select, Stats, Stepper } from '../../components/ui';
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

const FORMAT_INFO: Record<TournamentFormat, string> = {
  poules_ab: 'Iedereen speelt eerst in een poule, daarna een A- en een B-schema.',
  double_elim: 'Wie twee keer verliest, ligt eruit. Eén grote finale tussen de winnaars van beide schema’s.',
  single_elim_plate: 'Knock-out; wie zijn eerste match verliest, speelt verder in de plate (troostschema).',
};

/** Legs-labels: de A-legs en B-legs krijgen per format een andere rol. */
const LEGS_LABELS: Record<EliminationFormat, { A: [string, string, string]; B: [string, string, string] }> = {
  double_elim: {
    A: ['Winnaars vroege rondes', 'Winnaars halve + finale', 'Grote finale'],
    B: ['Verliezers vroege rondes', 'Verliezers halve finale', 'Verliezersfinale'],
  },
  single_elim_plate: {
    A: ['Hoofd t.e.m. kwart', 'Hoofd halve finale', 'Hoofd finale'],
    B: ['Plate t.e.m. kwart', 'Plate halve finale', 'Plate-finale'],
  },
};

/** Toernooi starten: format en indeling kiezen met geschatte eindtijd, dan loten. */
export function StartPanel({
  event,
  registrations,
  settings,
  seedSources,
}: {
  event: EventRow;
  registrations: RegistrationRow[];
  settings: SeasonSettings;
  /** Seedingrangen per bron (1 = sterkste); "random" is leeg. */
  seedSources: Record<SeedingSource, ReadonlyMap<string, number>>;
}) {
  const qc = useQueryClient();
  const now = useNow(60_000);
  const present = registrations.filter((r) => r.present && !r.withdrawn_at);
  const n = present.length;
  const options = useMemo(() => layoutOptions(n), [n]);
  const [format, setFormat] = useState<TournamentFormat>('poules_ab');
  const pooled = format === 'poules_ab';
  const [layoutId, setLayoutId] = useState<string | null>(null);
  const layout = options.find((o) => o.id === layoutId) ?? options[0];
  const [advanceOverride, setAdvance] = useState<number | null>(null);
  const [boards, setBoards] = useState(event.boards);
  const [mainBoard, setMainBoard] = useState(event.main_board);
  const [legs, setLegs] = useState<LegsSettings>(settings.legs);
  const [holdFinal, setHoldFinal] = useState(settings.holdFinal);
  const [showLegs, setShowLegs] = useState(false);
  const [source, setSource] = useState<SeedingSource>(settings.seeding);
  const seedRanks = seedSources[source];
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

  const bracketPlan = (f: EliminationFormat): BracketPlanInput => ({
    format: f,
    players: n,
    boards,
    mainBoard,
    legs,
    timing: settings.timing,
    holdFinal,
    start: plannedStart,
  });
  const bracketEstimates = useMemo(
    () =>
      n >= 4
        ? { double_elim: estimateBracketPlan(bracketPlan('double_elim')), single_elim_plate: estimateBracketPlan(bracketPlan('single_elim_plate')) }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [n, boards, mainBoard, legs, holdFinal, plannedStart],
  );
  const formatEnd: Record<TournamentFormat, number | undefined> = {
    poules_ab: current?.end,
    double_elim: bracketEstimates?.double_elim.end,
    single_elim_plate: bracketEstimates?.single_elim_plate.end,
  };
  const bracketCurrent = !pooled ? bracketEstimates?.[format] : undefined;
  const bracketTooLate = bracketCurrent ? bracketCurrent.end > limit : false;
  const bracketSuggestions = useMemo(
    () => (!pooled && bracketTooLate ? suggestBracketAdjustments(bracketPlan(format), limit).slice(0, 4) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [format, bracketTooLate, boards, legs, holdFinal, limit],
  );

  const start = useMutation({
    mutationFn: async () => {
      const players = present.map((r) => ({ id: r.player_id, seedRank: seedRanks.get(r.player_id) ?? null }));
      const snapshot = Object.fromEntries(players.filter((p) => p.seedRank !== null).map((p) => [p.id, p.seedRank as number]));
      const common = {
        legs,
        timing: settings.timing,
        boards: Array.from({ length: boards }, (_, i) => i + 1),
        mainBoard,
        holdFinal,
        seeding: source,
        seedRanks: snapshot,
      };
      if (!pooled) {
        const built = startBracket({ format, players, legs, rng: createRng(event.rng_seed), createdAt: 0 });
        const config: TournamentConfig = { ...common, format, seeds: built.seeds, layoutId: '', sizes: [], advance: 0 };
        await updateEvent(event.id, { boards, main_board: mainBoard });
        await startTournament(event.id, [], built.matches.map(matchToInsert), config);
        return;
      }
      if (!layout) return;
      const { pools, matches } = startPools({ players, sizes: layout.sizes, bestOf: legs.pool, rng: createRng(event.rng_seed), createdAt: 0 });
      const config: TournamentConfig = {
        format,
        layoutId: layout.id,
        sizes: layout.sizes,
        advance,
        ...common,
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
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-zinc-950">{n} aanwezige spelers</div>
          <p className="text-xs text-zinc-500">
            {source === 'random'
              ? 'Volledig willekeurige loting.'
              : `Seeding op ${source === 'elo' ? 'Elo' : 'de seizoensranking'}: ${ranked} met ${source === 'elo' ? 'rating' : 'ranking'}, ${n - ranked} zonder (willekeurig verdeeld).`}
          </p>
        </div>
        <Segmented
          value={source}
          onChange={setSource}
          options={[
            { id: 'elo', label: 'Elo' },
            { id: 'ranking', label: 'Ranking' },
            { id: 'random', label: 'Willekeurig' },
          ]}
        />
      </div>

      <div>
        <h3 className="mb-1.5 text-2xs font-semibold tracking-wider text-zinc-500 uppercase">Format</h3>
        <List>
          {(['poules_ab', 'double_elim', 'single_elim_plate'] as const).map((f) => {
            const end = formatEnd[f];
            return (
              <button
                key={f}
                type="button"
                data-format={f}
                onClick={() => setFormat(f)}
                aria-pressed={f === format}
                className={cx(rowClass, rowHover, 'justify-between', f === format && 'bg-brand-50/60')}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className={cx('h-4 w-4 shrink-0 rounded-full border-2', f === format ? 'border-[5px] border-brand-600' : 'border-zinc-300')} />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-zinc-950">
                      {FORMAT_LABEL[f]} {f === 'poules_ab' && <span className="ml-1 text-2xs font-medium text-brand-700">standaard</span>}
                    </div>
                    <div className="text-2xs text-zinc-500">{FORMAT_INFO[f]}</div>
                  </div>
                </div>
                {end !== undefined && (
                  <div className={cx('shrink-0 text-right text-sm font-semibold tabular-nums', end > limit ? 'text-accent-600' : 'text-zinc-950')}>±{formatTime(end)}</div>
                )}
              </button>
            );
          })}
        </List>
      </div>

      {pooled && (
        <>
      <div>
        <h3 className="mb-1.5 text-2xs font-semibold tracking-wider text-zinc-500 uppercase">Poule-indeling</h3>
        <List>
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
                aria-pressed={o.id === layout?.id}
                className={cx(rowClass, rowHover, 'justify-between', o.id === layout?.id && 'bg-brand-50/60')}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className={cx('h-4 w-4 shrink-0 rounded-full border-2', o.id === layout?.id ? 'border-[5px] border-brand-600' : 'border-zinc-300')} />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-zinc-950">
                      {o.label} {o.standard && <span className="ml-1 text-2xs font-medium text-brand-700">standaard</span>}
                    </div>
                    <div className="text-2xs text-zinc-500">{est && `${est.poolMatches} poulematchen · A ${est.A} / B ${est.B} spelers`}</div>
                  </div>
                </div>
                {est && (
                  <div className={cx('text-right text-sm font-semibold tabular-nums', est.end > limit ? 'text-accent-600' : 'text-zinc-950')}>
                    ±{formatTime(est.end)}
                  </div>
                )}
              </button>
            );
          })}
        </List>
      </div>

      <Card className="grid grid-cols-3 items-end gap-2">
        <Field label={multi ? 'Naar A/poule' : 'Naar A'}>
          <Stepper value={advance} onChange={setAdvance} min={1} max={multi ? Math.min(...(layout?.sizes ?? [2])) - 1 : (layout?.sizes[0] ?? 2) - 1} />
        </Field>
        <Field label="Borden">
          <Stepper value={boards} onChange={setBoards} min={1} max={16} />
        </Field>
        <div>
          <Field label="Hoofdbord">
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
        </>
      )}

      {!pooled && bracketCurrent && (
        <>
          <Stats
            items={[
              { label: 'spelers', value: n, sub: bracketCurrent.byes > 0 ? `${bracketCurrent.byes} met een bye` : 'geen byes' },
              { label: 'schema', value: bracketCurrent.size },
              { label: 'matchen', value: bracketCurrent.matches },
              ...(bracketCurrent.plateSize !== null ? [{ label: 'in de plate', value: bracketCurrent.plateSize }] : []),
            ]}
          />
          {format === 'double_elim' && n > 32 && (
            <InfoBox tone="amber">Double elimination met {n} spelers duurt erg lang. Overweeg knock-out met plate of poules.</InfoBox>
          )}
          <Card className="grid grid-cols-2 items-end gap-2">
            <Field label="Borden">
              <Stepper value={boards} onChange={setBoards} min={1} max={16} />
            </Field>
            <Field label="Hoofdbord">
              <Select value={mainBoard} onChange={(e) => setMainBoard(Number(e.target.value))}>
                {Array.from({ length: boards }, (_, i) => i + 1).map((b) => (
                  <option key={b} value={b}>
                    Bord {b}
                  </option>
                ))}
              </Select>
            </Field>
          </Card>
        </>
      )}

      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[13px] font-semibold text-zinc-950">Legs per ronde</h3>
            <p className="text-2xs text-zinc-500">
              {pooled ? (
                <>
                  Poules bo{legs.pool} · A: bo{legs.A.early} / halve bo{legs.A.semi} / finale bo{legs.A.final} · B: bo{legs.B.early} / halve bo{legs.B.semi} / finale bo
                  {legs.B.final}
                </>
              ) : (
                ([...LEGS_LABELS[format].A.map((l, i) => [l, [legs.A.early, legs.A.semi, legs.A.final][i]]), ...LEGS_LABELS[format].B.map((l, i) => [l, [legs.B.early, legs.B.semi, legs.B.final][i]])] as Array<[string, number]>)
                  .map(([l, v]) => `${l} bo${v}`)
                  .join(' · ')
              )}
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setShowLegs((s) => !s)}>
            {showLegs ? 'Klaar' : 'Wijzigen'}
          </Button>
        </div>
        {showLegs && (
          <div className={cx('mt-3 grid grid-cols-2 gap-3', pooled ? 'sm:grid-cols-4' : 'sm:grid-cols-3')}>
            {pooled && <LegsSelect label="Poules" value={legs.pool} onChange={(v) => setLegs((l) => ({ ...l, pool: v }))} />}
            <LegsSelect label={pooled ? 'A t.e.m. kwart' : LEGS_LABELS[format].A[0]} value={legs.A.early} onChange={(v) => setLegs((l) => ({ ...l, A: { ...l.A, early: v } }))} />
            <LegsSelect label={pooled ? 'A halve finale' : LEGS_LABELS[format].A[1]} value={legs.A.semi} onChange={(v) => setLegs((l) => ({ ...l, A: { ...l.A, semi: v } }))} />
            <LegsSelect label={pooled ? 'A finale' : LEGS_LABELS[format].A[2]} value={legs.A.final} onChange={(v) => setLegs((l) => ({ ...l, A: { ...l.A, final: v } }))} />
            {pooled && <LegsSelect label="Barrage" value={legs.barrage} onChange={(v) => setLegs((l) => ({ ...l, barrage: v }))} />}
            <LegsSelect label={pooled ? 'B t.e.m. kwart' : LEGS_LABELS[format].B[0]} value={legs.B.early} onChange={(v) => setLegs((l) => ({ ...l, B: { ...l.B, early: v } }))} />
            <LegsSelect label={pooled ? 'B halve finale' : LEGS_LABELS[format].B[1]} value={legs.B.semi} onChange={(v) => setLegs((l) => ({ ...l, B: { ...l.B, semi: v } }))} />
            <LegsSelect label={pooled ? 'B finale' : LEGS_LABELS[format].B[2]} value={legs.B.final} onChange={(v) => setLegs((l) => ({ ...l, B: { ...l.B, final: v } }))} />
          </div>
        )}
        <label className="mt-2.5 flex items-center gap-2 text-[13px]">
          <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={holdFinal} onChange={(e) => setHoldFinal(e.target.checked)} />
          {pooled ? 'A-finale' : format === 'double_elim' ? 'Grote finale' : 'Finale'} als laatste op het hoofdbord (iedereen kan meekijken)
        </label>
      </Card>

      {pooled && current && (
        <div className="rounded-lg bg-ink p-3 text-white">
          <div className="flex items-center justify-between gap-3">
            <div className="text-2xs font-medium tracking-wider text-zinc-400 uppercase">Geschatte eindtijd</div>
            {tooLate ? <span className="rounded bg-accent-600 px-1.5 py-px text-2xs font-semibold">te laat</span> : <span className="rounded bg-brand-600 px-1.5 py-px text-2xs font-semibold">op tijd</span>}
          </div>
          <div className="text-2xl leading-8 font-semibold tabular-nums">{formatTime(current.end)}</div>
          <div className="text-2xs text-zinc-400">
            Poules klaar rond {formatTime(current.poolsEnd)} · uitgaande van {settings.timing.minutesPerLeg} min per leg en {settings.timing.changeoverMinutes} min wisseltijd ·
            liefst klaar om {formatTime(limit)}
          </div>
          {suggestions.length > 0 && (
            <div className="mt-3">
              <div className="text-xs font-semibold">Voorstellen om sneller klaar te zijn:</div>
              <div className="mt-1.5 space-y-1.5">
                {suggestions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-2 rounded-md bg-white/10 px-2.5 py-1.5 text-left text-xs hover:bg-white/15"
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

      {bracketCurrent && (
        <div className="rounded-lg bg-ink p-3 text-white">
          <div className="flex items-center justify-between gap-3">
            <div className="text-2xs font-medium tracking-wider text-zinc-400 uppercase">Geschatte eindtijd</div>
            {bracketTooLate ? (
              <span className="rounded bg-accent-600 px-1.5 py-px text-2xs font-semibold">te laat</span>
            ) : (
              <span className="rounded bg-brand-600 px-1.5 py-px text-2xs font-semibold">op tijd</span>
            )}
          </div>
          <div className="text-2xl leading-8 font-semibold tabular-nums">{formatTime(bracketCurrent.end)}</div>
          <div className="text-2xs text-zinc-400">
            {bracketCurrent.matches} matchen · uitgaande van {settings.timing.minutesPerLeg} min per leg en {settings.timing.changeoverMinutes} min wisseltijd · liefst klaar om{' '}
            {formatTime(limit)}
          </div>
          {bracketSuggestions.length > 0 && (
            <div className="mt-3">
              <div className="text-xs font-semibold">Voorstellen om sneller klaar te zijn:</div>
              <div className="mt-1.5 space-y-1.5">
                {bracketSuggestions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-2 rounded-md bg-white/10 px-2.5 py-1.5 text-left text-xs hover:bg-white/15"
                    onClick={() => {
                      setFormat(s.plan.format);
                      setLegs(s.plan.legs);
                      setHoldFinal(s.plan.holdFinal);
                      setBoards(s.plan.boards);
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

      <Button size="lg" block onClick={() => setConfirm(true)}>
        Toernooi starten
      </Button>
      {start.error && <ErrorBox error={start.error} />}

      <ConfirmModal
        open={confirm}
        title="Toernooi starten?"
        confirmLabel={pooled ? 'Starten en poules loten' : 'Starten en schema loten'}
        busy={start.isPending}
        onClose={() => setConfirm(false)}
        onConfirm={() => start.mutate()}
      >
        {pooled ? (
          <p>
            {n} spelers in {layout?.label}, top {advance} {multi ? 'per poule' : ''} naar het A-schema, {boards} borden.
          </p>
        ) : (
          <p>
            {FORMAT_LABEL[format]} met {n} spelers op {boards} borden.
          </p>
        )}
        <p className="mt-2">Na de start kunnen er geen spelers meer bijkomen. {pooled ? 'De poules worden nu geloot.' : 'Het schema wordt nu geloot.'}</p>
      </ConfirmModal>
    </div>
  );
}
