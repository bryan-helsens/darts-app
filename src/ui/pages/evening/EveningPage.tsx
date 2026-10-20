import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { buildEventView, PHASE_LABEL } from '../../../data/eventView';
import { useEventBundle, usePlayerDirectory, useRegistrations, useScorerPin, useSeasons } from '../../../data/queries';
import { formatLongDate } from '../../../lib/time';
import { PlacementsTable } from '../../components/darts';
import { Badge, ErrorBox, Spinner, Tabs } from '../../components/ui';
import { seasonSettings, seedRanksFrom, useNow, useSeasonRanking } from '../../hooks';
import { CheckInPanel } from './CheckInPanel';
import { BoardsPanel, BracketPanel, FinishPanel, PoolsPanel } from './LivePanels';
import { MatchesPanel } from './MatchesPanel';
import { StartPanel } from './StartPanel';

type Tab = 'checkin' | 'start' | 'borden' | 'matchen' | 'poules' | 'schema' | 'afsluiten' | 'uitslag';

/** Het scherm van de wedstrijdleider tijdens de speelavond. */
export function EveningPage() {
  const { eventId } = useParams();
  const bundle = useEventBundle(eventId, { live: true });
  const registrations = useRegistrations(eventId);
  const pin = useScorerPin(eventId);
  const { data: seasons } = useSeasons();
  const directory = usePlayerDirectory();
  const now = useNow(20_000);
  const season = seasons?.find((s) => s.id === bundle.data?.event.season_id);
  const settings = seasonSettings(season);
  const { rows: ranking } = useSeasonRanking(season);
  const seedRanks = useMemo(() => seedRanksFrom(ranking), [ranking]);
  const view = useMemo(() => (bundle.data ? buildEventView(bundle.data, now) : null), [bundle.data, now]);
  const [tab, setTab] = useState<Tab | null>(null);

  if (bundle.isLoading) return <Spinner />;
  if (bundle.error || !view) return <ErrorBox error={bundle.error ?? 'Speelavond niet gevonden.'} />;

  const { event } = view;
  const tabs: Array<{ id: Tab; label: string }> =
    event.status === 'gepland'
      ? [
          { id: 'checkin', label: 'Check-in' },
          { id: 'start', label: 'Starten' },
        ]
      : event.status === 'bezig'
        ? [
            { id: 'borden', label: 'Borden' },
            { id: 'matchen', label: 'Matchen' },
            { id: 'poules', label: 'Poules' },
            { id: 'schema', label: 'A/B-schema' },
            { id: 'afsluiten', label: 'Afsluiten' },
            { id: 'checkin', label: 'Check-in' },
          ]
        : [
            { id: 'uitslag', label: 'Uitslag' },
            { id: 'matchen', label: 'Matchen' },
            { id: 'schema', label: 'A/B-schema' },
            { id: 'poules', label: 'Poules' },
            { id: 'afsluiten', label: 'Correcties' },
          ];
  const active = tab && tabs.some((t) => t.id === tab) ? tab : tabs[0].id;
  const name = directory.name;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-zinc-950 sm:text-2xl">{formatLongDate(event.event_date)}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <Badge tone={event.status === 'bezig' ? 'red' : event.status === 'afgelopen' ? 'dark' : 'blue'}>{PHASE_LABEL[view.phase]}</Badge>
            <Link to={`/avond/${event.id}`} className="font-medium text-brand-700 hover:underline">
              Publieke pagina
            </Link>
            {event.status !== 'gepland' && (
              <Link to={`/print/avond/${event.id}`} className="font-medium text-brand-700 hover:underline">
                Afdrukken
              </Link>
            )}
          </div>
        </div>
        {event.status !== 'afgelopen' && (
          <Link to={`/score/${event.id}`} className="flex items-center gap-3 rounded-xl bg-ink px-3 py-2 text-white hover:bg-zinc-800" title="Scorepagina voor de schrijvers">
            <div>
              <div className="text-[11px] font-medium tracking-wide text-zinc-400 uppercase">Score-pin</div>
              <div data-pin className="font-mono text-xl leading-tight font-bold tracking-[0.2em]">{pin.data ?? '····'}</div>
            </div>
            <span className="text-xs text-zinc-400">/score →</span>
          </Link>
        )}
      </div>

      <Tabs value={active} onChange={setTab} tabs={tabs} />

      {active === 'checkin' && (registrations.data ? <CheckInPanel event={event} registrations={registrations.data} entryFee={settings.entryFee} /> : <Spinner />)}
      {active === 'start' && (registrations.data ? <StartPanel event={event} registrations={registrations.data} settings={settings} seedRanks={seedRanks} /> : <Spinner />)}
      {active === 'borden' && <BoardsPanel view={view} name={name} onGoTo={setTab} />}
      {active === 'matchen' && <MatchesPanel view={view} name={name} />}
      {active === 'poules' && <PoolsPanel view={view} name={name} seedRanks={seedRanks} />}
      {active === 'schema' && <BracketPanel view={view} name={name} />}
      {active === 'afsluiten' && <FinishPanel view={view} name={name} settings={settings} />}
      {active === 'uitslag' &&
        (view.placements?.complete ? (
          <PlacementsTable
            placements={view.placements.placements}
            name={name}
            points={new Map((bundle.data?.results ?? []).map((r) => [r.player_id, r.points]))}
          />
        ) : (
          <ErrorBox>Nog geen uitslag.</ErrorBox>
        ))}
    </div>
  );
}
