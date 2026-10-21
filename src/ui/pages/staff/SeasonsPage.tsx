import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { DEFAULT_SEASON_SETTINGS, validatePointsTable, type BracketLegs, type PointsRule, type SeasonSettings, type SeedingSource } from '../../../engine';
import { createEvent, createSeason, deleteEvent, updateEvent, updateSeason } from '../../../data/api';
import { useAuth } from '../../../data/auth';
import { keys, useEvents, useSeasons } from '../../../data/queries';
import type { EventRow, SeasonRow } from '../../../data/rows';
import { formatDate, formatLongDate, shortTime, thirdSaturday, todayInBrussels } from '../../../lib/time';
import { Badge, Button, Card, ConfirmModal, Empty, ErrorBox, Field, Icon, InfoBox, Modal, PageTitle, SectionTitle, Select, Spinner, TextInput } from '../../components/ui';
import { seasonSettings } from '../../hooks';
import { SeasonExport } from './SeasonExport';

export const STATUS_TONE = { gepland: 'blue', bezig: 'red', afgelopen: 'dark' } as const;

export function SeasonsPage() {
  const { isAdmin } = useAuth();
  const { data: seasons, isLoading, error } = useSeasons();
  const { data: events } = useEvents();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const year = Number(todayInBrussels().slice(0, 4)) + (Number(todayInBrussels().slice(5, 7)) >= 10 ? 1 : 0);
  const create = useMutation({
    mutationFn: () => createSeason({ name: String(year), starts_on: `${year}-01-01`, ends_on: `${year}-12-31`, settings: { ...DEFAULT_SEASON_SETTINGS } }),
    onSuccess: async (s) => {
      await qc.invalidateQueries({ queryKey: keys.seasons });
      navigate(`/beheer/seizoenen/${s.id}`);
    },
  });

  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox error={error} />;
  return (
    <div>
      <PageTitle
        sub="Een seizoen is standaard één kalenderjaar. Per seizoen stel je de puntentabel en de wedstrijdregels in."
        actions={
          isAdmin && (
            <Button onClick={() => create.mutate()} disabled={create.isPending || seasons?.some((s) => s.name === String(year))}>
              + Seizoen {year}
            </Button>
          )
        }
      >
        Seizoenen & avonden
      </PageTitle>
      {create.error && <ErrorBox error={create.error} />}
      {(seasons ?? []).length === 0 && <Empty>Nog geen seizoenen. Maak er een aan om te beginnen.</Empty>}
      {(seasons ?? []).length > 0 && (
        <div className="divide-y divide-zinc-100 overflow-hidden rounded-lg border border-zinc-200/80 bg-white shadow-xs">
          {(seasons ?? []).map((s) => {
            const own = (events ?? []).filter((e) => e.season_id === s.id);
            return (
              <Link key={s.id} to={`/beheer/seizoenen/${s.id}`} className="flex items-center justify-between gap-3 px-3 py-2 transition-colors hover:bg-zinc-50">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-zinc-950">{s.name}</div>
                  <div className="text-xs text-zinc-500">
                    {formatDate(s.starts_on)} – {formatDate(s.ends_on)} · {own.length} speelavonden ({own.filter((e) => e.status === 'afgelopen').length} gespeeld)
                  </div>
                </div>
                <Icon name="chevron" className="text-zinc-400" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SeasonDetailPage() {
  const { seasonId } = useParams();
  const { isAdmin } = useAuth();
  const { data: seasons, isLoading } = useSeasons();
  const { data: events } = useEvents();
  const season = seasons?.find((s) => s.id === seasonId);
  const [editingEvent, setEditingEvent] = useState<EventRow | 'new' | null>(null);
  const qc = useQueryClient();

  const own = (events ?? []).filter((e) => e.season_id === seasonId).sort((a, b) => a.event_date.localeCompare(b.event_date));
  const addCalendar = useMutation({
    mutationFn: async () => {
      if (!season) return;
      const year = Number(season.starts_on.slice(0, 4));
      const settings = seasonSettings(season);
      const existing = new Set(own.map((e) => e.event_date));
      for (let m = 1; m <= 12; m++) {
        const date = thirdSaturday(year, m);
        if (date < season.starts_on || date > season.ends_on || existing.has(date)) continue;
        await createEvent({ season_id: season.id, event_date: date, boards: 6, start_time: settings.startTime, registration_closes: settings.registrationCloses });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.events }),
  });

  if (isLoading) return <Spinner />;
  if (!season) return <ErrorBox>Seizoen niet gevonden.</ErrorBox>;

  return (
    <div>
      <PageTitle sub={`${formatDate(season.starts_on)} – ${formatDate(season.ends_on)}`}>{season.name}</PageTitle>
      <SectionTitle
        actions={
          isAdmin && (
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => addCalendar.mutate()} disabled={addCalendar.isPending}>
                Alle derde zaterdagen
              </Button>
              <Button size="sm" onClick={() => setEditingEvent('new')}>
                + Avond
              </Button>
            </div>
          )
        }
      >
        Speelavonden
      </SectionTitle>
      {addCalendar.error && <ErrorBox error={addCalendar.error} />}
      {own.length === 0 ? (
        <Empty>Nog geen speelavonden in dit seizoen.</Empty>
      ) : (
        <div className="divide-y divide-zinc-100 overflow-hidden rounded-lg border border-zinc-200/80 bg-white shadow-xs">
          {own.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-zinc-950">{formatLongDate(e.event_date)}</div>
                <div className="text-xs text-zinc-500">
                  {shortTime(e.start_time).replace(':', 'u')} · {e.boards} borden {e.notes && `· ${e.notes}`}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={STATUS_TONE[e.status]}>{e.status}</Badge>
                {isAdmin && e.status === 'gepland' && (
                  <Button size="sm" variant="secondary" onClick={() => setEditingEvent(e)}>
                    Wijzigen
                  </Button>
                )}
                <Link to={`/beheer/avond/${e.id}`}>
                  <Button size="sm">Openen</Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <SeasonExport season={season} />
      {isAdmin && <SeasonSettingsForm season={season} />}
      {editingEvent && <EventForm season={season} event={editingEvent === 'new' ? null : editingEvent} onClose={() => setEditingEvent(null)} />}
    </div>
  );
}

function EventForm({ season, event, onClose }: { season: SeasonRow; event: EventRow | null; onClose: () => void }) {
  const settings = seasonSettings(season);
  const qc = useQueryClient();
  const today = todayInBrussels();
  const year = Number(season.starts_on.slice(0, 4));
  const suggestion = Array.from({ length: 12 }, (_, i) => thirdSaturday(year, i + 1)).find((d) => d >= today) ?? season.starts_on;
  const [date, setDate] = useState(event?.event_date ?? suggestion);
  const [boards, setBoards] = useState(event?.boards ?? 6);
  const [start, setStart] = useState(shortTime(event?.start_time ?? settings.startTime));
  const [closes, setCloses] = useState(shortTime(event?.registration_closes ?? settings.registrationCloses));
  const [notes, setNotes] = useState(event?.notes ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = useMutation({
    mutationFn: async () => {
      const data = { event_date: date, boards, start_time: start, registration_closes: closes, notes: notes.trim() || null };
      if (event) await updateEvent(event.id, data);
      else await createEvent({ season_id: season.id, ...data });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: keys.events });
      onClose();
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteEvent(event!.id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: keys.events });
      onClose();
    },
  });

  return (
    <Modal open onClose={onClose} title={event ? 'Speelavond wijzigen' : 'Nieuwe speelavond'}>
      <div className="space-y-3">
        <Field label="Datum">
          <TextInput type="date" value={date} min={season.starts_on} max={season.ends_on} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Borden">
            <TextInput type="number" min={1} max={16} value={boards} onChange={(e) => setBoards(Number(e.target.value))} />
          </Field>
          <Field label="Start">
            <TextInput type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Inschrijving tot">
            <TextInput type="time" value={closes} onChange={(e) => setCloses(e.target.value)} />
          </Field>
        </div>
        <Field label="Notities (publiek zichtbaar)">
          <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="bv. Kerstspecial" />
        </Field>
        {save.error && <ErrorBox error={save.error} />}
        <Button block onClick={() => save.mutate()} disabled={save.isPending || !date}>
          Opslaan
        </Button>
        {event && event.status === 'gepland' && (
          <Button variant="ghost" block onClick={() => setConfirmDelete(true)}>
            Speelavond verwijderen
          </Button>
        )}
        {remove.error && <ErrorBox error={remove.error} />}
      </div>
      <ConfirmModal
        open={confirmDelete}
        title="Speelavond verwijderen"
        danger
        confirmLabel="Verwijderen"
        busy={remove.isPending}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => remove.mutate()}
      >
        Ook de inschrijvingen voor deze avond worden verwijderd.
      </ConfirmModal>
    </Modal>
  );
}

function NumberInput({ value, onChange, min = 0, max = 999, step = 1 }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return <TextInput type="number" inputMode="decimal" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} />;
}

function LegsInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <Field label={label}>
      <Select value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {[1, 3, 5, 7, 9].map((n) => (
          <option key={n} value={n}>
            best of {n}
          </option>
        ))}
      </Select>
    </Field>
  );
}

function SeasonSettingsForm({ season }: { season: SeasonRow }) {
  const qc = useQueryClient();
  const [s, setS] = useState<SeasonSettings>(() => seasonSettings(season));
  const [name, setName] = useState(season.name);
  const [saved, setSaved] = useState(false);
  const tableError = validatePointsTable(s.points.table);
  const save = useMutation({
    mutationFn: () => updateSeason(season.id, { name, settings: s as unknown as Record<string, unknown> }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: keys.seasons });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });
  const setRule = (i: number, patch: Partial<PointsRule>) =>
    setS((x) => ({ ...x, points: { ...x.points, table: x.points.table.map((r, j) => (j === i ? { ...r, ...patch } : r)) } }));
  const setBracket = (stage: 'A' | 'B', patch: Partial<BracketLegs>) =>
    setS((x) => ({ ...x, legs: { ...x.legs, [stage]: { ...x.legs[stage], ...patch } } }));

  return (
    <div>
      <SectionTitle>Instellingen van het seizoen</SectionTitle>
      <Card className="space-y-4">
        <Field label="Naam van het seizoen">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} />
        </Field>

        <div>
          <h3 className="mb-1.5 text-[13px] font-semibold text-zinc-950">Puntentabel</h3>
          <table className="w-full text-[13px]">
            <thead className="text-zinc-500">
              <tr>
                <th className="text-left">Van plaats</th>
                <th className="text-left">Tot plaats</th>
                <th className="text-left">Punten</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {s.points.table.map((r, i) => (
                <tr key={i}>
                  <td className="py-1 pr-2">
                    <NumberInput value={r.from} min={1} onChange={(v) => setRule(i, { from: v })} />
                  </td>
                  <td className="py-1 pr-2">
                    {r.to === null ? (
                      <span className="text-zinc-500">en verder</span>
                    ) : (
                      <NumberInput value={r.to} min={1} onChange={(v) => setRule(i, { to: v })} />
                    )}
                  </td>
                  <td className="py-1 pr-2">
                    <NumberInput value={r.points} onChange={(v) => setRule(i, { points: v })} />
                  </td>
                  <td>
                    {s.points.table.length > 1 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setS((x) => ({ ...x, points: { ...x.points, table: x.points.table.filter((_, j) => j !== i) } }))}
                      >
                        ×
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Button
            size="sm"
            variant="secondary"
            className="mt-2"
            onClick={() =>
              setS((x) => {
                const table = [...x.points.table];
                const last = table[table.length - 1];
                const lastFixed = { ...last, to: last.to ?? last.from };
                return { ...x, points: { ...x.points, table: [...table.slice(0, -1), lastFixed, { from: lastFixed.to + 1, to: null, points: 0 }] } };
              })
            }
          >
            + Regel
          </Button>
          {tableError && <p className="mt-2 text-xs text-accent-700">{tableError}</p>}
          <div className="mt-3 max-w-xs">
            <Field label="Deelnamepunten per avond">
              <NumberInput value={s.points.participation} onChange={(v) => setS((x) => ({ ...x, points: { ...x.points, participation: v } }))} />
            </Field>
          </div>
        </div>

        <div>
          <h3 className="mb-1.5 text-[13px] font-semibold text-zinc-950">Beste X van Y</h3>
          <label className="mb-2 flex items-center gap-2 text-[13px]">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={s.bestOf.enabled} onChange={(e) => setS((x) => ({ ...x, bestOf: { ...x.bestOf, enabled: e.target.checked } }))} />
            Enkel de beste avonden tellen mee (deelnamepunten inbegrepen)
          </label>
          {s.bestOf.enabled && (
            <div className="grid max-w-sm grid-cols-2 gap-3">
              <Field label="Beste">
                <NumberInput value={s.bestOf.count} min={1} onChange={(v) => setS((x) => ({ ...x, bestOf: { ...x.bestOf, count: v } }))} />
              </Field>
              <Field label="van (geplande avonden)">
                <NumberInput value={s.bestOf.of} min={1} onChange={(v) => setS((x) => ({ ...x, bestOf: { ...x.bestOf, of: v } }))} />
              </Field>
            </div>
          )}
        </div>

        <div>
          <h3 className="mb-1.5 text-[13px] font-semibold text-zinc-950">Legs per ronde</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <LegsInput label="Poules" value={s.legs.pool} onChange={(v) => setS((x) => ({ ...x, legs: { ...x.legs, pool: v } }))} />
            <LegsInput label="Barrage" value={s.legs.barrage} onChange={(v) => setS((x) => ({ ...x, legs: { ...x.legs, barrage: v } }))} />
          </div>
          {(['A', 'B'] as const).map((stage) => (
            <div key={stage} className="mt-3 grid grid-cols-3 gap-3">
              <LegsInput label={`${stage}: t.e.m. kwartfinale`} value={s.legs[stage].early} onChange={(v) => setBracket(stage, { early: v })} />
              <LegsInput label={`${stage}: halve finale`} value={s.legs[stage].semi} onChange={(v) => setBracket(stage, { semi: v })} />
              <LegsInput label={`${stage}: finale`} value={s.legs[stage].final} onChange={(v) => setBracket(stage, { final: v })} />
            </div>
          ))}
          <p className="mt-2 text-2xs text-zinc-500">
            Bij double elimination gelden de A-legs voor het winnaarsschema en de grote finale, de B-legs voor het verliezersschema. Bij knock-out met plate: A voor het
            hoofdschema, B voor de plate.
          </p>
        </div>

        <div>
          <h3 className="mb-1.5 text-[13px] font-semibold text-zinc-950">Avond en tijdsinschatting</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Start">
              <TextInput type="time" value={s.startTime} onChange={(e) => setS((x) => ({ ...x, startTime: e.target.value }))} />
            </Field>
            <Field label="Inschrijving sluit">
              <TextInput type="time" value={s.registrationCloses} onChange={(e) => setS((x) => ({ ...x, registrationCloses: e.target.value }))} />
            </Field>
            <Field label="Liefst klaar om">
              <TextInput type="time" value={s.endLimit} onChange={(e) => setS((x) => ({ ...x, endLimit: e.target.value }))} />
            </Field>
            <Field label="Minuten per leg">
              <NumberInput value={s.timing.minutesPerLeg} step={0.5} onChange={(v) => setS((x) => ({ ...x, timing: { ...x.timing, minutesPerLeg: v } }))} />
            </Field>
            <Field label="Wisseltijd per match (min)">
              <NumberInput value={s.timing.changeoverMinutes} onChange={(v) => setS((x) => ({ ...x, timing: { ...x.timing, changeoverMinutes: v } }))} />
            </Field>
            <Field label="Minimale rust tussen matchen (min)">
              <NumberInput value={s.timing.minRestMinutes} onChange={(v) => setS((x) => ({ ...x, timing: { ...x.timing, minRestMinutes: v } }))} />
            </Field>
            <Field label="Inleg (€)">
              <NumberInput value={s.entryFee} step={0.5} onChange={(v) => setS((x) => ({ ...x, entryFee: v }))} />
            </Field>
            <Field label="Doorstromers per poule naar A">
              <NumberInput value={s.advancePerPool} min={1} max={4} onChange={(v) => setS((x) => ({ ...x, advancePerPool: v }))} />
            </Field>
          </div>
          <label className="mt-2.5 flex items-center gap-2 text-[13px]">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={s.holdFinal} onChange={(e) => setS((x) => ({ ...x, holdFinal: e.target.checked }))} />
            De A-finale wordt als laatste op het hoofdbord gespeeld
          </label>
        </div>

        <div>
          <h3 className="mb-1.5 text-[13px] font-semibold text-zinc-950">Loting en Elo</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Standaard seeding">
              <Select value={s.seeding} onChange={(e) => setS((x) => ({ ...x, seeding: e.target.value as SeedingSource }))}>
                <option value="elo">Elo</option>
                <option value="ranking">Seizoensranking</option>
                <option value="random">Willekeurig</option>
              </Select>
            </Field>
            <Field label="Elo bij de start">
              <NumberInput value={s.elo.start} min={100} max={3000} onChange={(v) => setS((x) => ({ ...x, elo: { ...x.elo, start: v } }))} />
            </Field>
            <Field label="K-factor">
              <NumberInput value={s.elo.k} min={1} max={100} onChange={(v) => setS((x) => ({ ...x, elo: { ...x.elo, k: v } }))} />
            </Field>
            <Field label="K-factor nieuwe spelers">
              <NumberInput value={s.elo.newcomerK} min={1} max={100} onChange={(v) => setS((x) => ({ ...x, elo: { ...x.elo, newcomerK: v } }))} />
            </Field>
            <Field label="Nieuw tot en met match">
              <NumberInput value={s.elo.newcomerMatches} min={0} max={100} onChange={(v) => setS((x) => ({ ...x, elo: { ...x.elo, newcomerMatches: v } }))} />
            </Field>
          </div>
          <p className="mt-1.5 text-2xs text-zinc-500">
            De Elo-instellingen gelden voor de matchen van dit seizoen. Een hogere K laat de rating sneller bewegen; nieuwe spelers krijgen een hogere K zodat ze snel op hun niveau
            komen.
          </p>
        </div>

        {save.error && <ErrorBox error={save.error} />}
        {saved && <InfoBox>Opgeslagen.</InfoBox>}
        <Button onClick={() => save.mutate()} disabled={save.isPending || Boolean(tableError)}>
          Instellingen opslaan
        </Button>
        <p className="text-xs text-zinc-500">
          De puntentabel en “beste X van Y” gelden meteen voor de hele seizoensranking. Legs, tijden en doorstromers gelden voor avonden die nog moeten starten.
        </p>
      </Card>
    </div>
  );
}
