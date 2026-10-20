import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { buildEventView, PHASE_LABEL } from '../../../data/eventView';
import { useEventBundle, usePlayerDirectory, useRegistrations, useScorerPin, useSeasons } from '../../../data/queries';
import { formatLongDate } from '../../../lib/time';
import { PlacementsTable } from '../../components/darts';
import { Badge, Card, ErrorBox, Spinner, Tabs } from '../../components/ui';
import { seasonSettings, seedRanksFrom, useNow, useSeasonRanking } from '../../hooks';
import { CheckInPanel } from './CheckInPanel';
import { BoardsPanel, BracketPanel, FinishPanel, PoolsPanel } from './LivePanels';
import { StartPanel } from './StartPanel';

type Tab = 'checkin' | 'start' | 'borden' | 'poules' | 'schema' | 'afsluiten' | 'uitslag';

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
            { id: 'poules', label: 'Poules' },
            { id: 'schema', label: 'A/B-schema' },
            { id: 'afsluiten', label: 'Afsluiten' },
            { id: 'checkin', label: 'Check-in' },
          ]
        : [
            { id: 'uitslag', label: 'Uitslag' },
            { id: 'schema', label: 'A/B-schema' },
            { id: 'poules', label: 'Poules' },
            { id: 'afsluiten', label: 'Correcties' },
          ];
  const active = tab && tabs.some((t) => t.id === tab) ? tab : tabs[0].id;
  const name = directory.name;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">{formatLongDate(event.event_date)}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge tone={event.status === 'bezig' ? 'amber' : event.status === 'afgelopen' ? 'green' : 'blue'}>{PHASE_LABEL[view.phase]}</Badge>
            <Link to={`/avond/${event.id}`} className="text-sm text-brand-800 underline">
              publieke pagina
            </Link>
            {event.status !== 'gepland' && (
              <Link to={`/print/avond/${event.id}`} className="text-sm text-brand-800 underline">
                afdrukken (PDF)
              </Link>
            )}
          </div>
        </div>
        {event.status !== 'afgelopen' && (
          <Card className="px-4 py-2 text-center">
            <div className="text-xs text-stone-500">Score-pin voor de schrijvers</div>
            <div className="font-mono text-2xl font-bold tracking-widest">{pin.data ?? '····'}</div>
            <Link to={`/score/${event.id}`} className="text-xs text-brand-800 underline">
              /score
            </Link>
          </Card>
        )}
      </div>

      <Tabs value={active} onChange={setTab} tabs={tabs} />

      {active === 'checkin' && (registrations.data ? <CheckInPanel event={event} registrations={registrations.data} entryFee={settings.entryFee} /> : <Spinner />)}
      {active === 'start' && (registrations.data ? <StartPanel event={event} registrations={registrations.data} settings={settings} seedRanks={seedRanks} /> : <Spinner />)}
      {active === 'borden' && <BoardsPanel view={view} name={name} onGoTo={setTab} />}
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
