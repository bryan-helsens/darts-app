import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  averageProgress,
  eloChangeForEvent,
  eloProgress,
  formatPlace,
  isFinished,
  placementPoints,
  rankingProgress,
  seasonLeaderboards,
  STAGE_NAMES,
} from '../../../engine';
import { averagesFor, buildEventView, SCHEMA_STAGES } from '../../../data/eventView';
import { isMasters } from '../../../data/masters';
import { matchFromRow } from '../../../data/mappers';
import { useEventBundle, useEvents, usePlayerData, usePlayerDirectory, useRegistrationCounts, useSeasonData, useSeasons } from '../../../data/queries';
import { onlineRegistrationOpen } from '../../../data/registration';
import { formatDecimal } from '../../../lib/format';
import { matchesSearch } from '../../../lib/names';
import { formatDate, formatLongDate, formatTime, shortTime } from '../../../lib/time';
import { AddToCalendarButton } from '../../components/Calendar';
import { AveragesTable, BoardsOverview, Bracket, MastersBadge, MatchTile, PlacementsTable, PoolTable, shortTitle, TileGrid } from '../../components/darts';
import { LineChart } from '../../components/LineChart';
import { displayName } from '../../components/players';
import { ShareResultButton } from '../../share/ShareResult';
import { Badge, Button, Card, cx, DateTile, Empty, ErrorBox, Icon, List, LiveBadge, PageTitle, rowClass, rowHover, SearchInput, SectionTitle, Segmented, Select, Spinner, Tabs } from '../../components/ui';
import { pickCurrentSeason, seasonSettings, useCurrentSeason, useElo, useNow, useSeasonRanking, useUpcoming } from '../../hooks';

const time = (t: string) => formatTime(shortTime(t));

/** Initialen voor het rondje naast een naam ("Arne Beke" → "AB"). */
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

// ---------------------------------------------------------------------------
// Startpagina: volgende speelavond en kalender
// ---------------------------------------------------------------------------

export function HomePage() {
  const { next, live, events, isLoading } = useUpcoming();
  const now = useNow(60_000);
  const { season } = useCurrentSeason();
  const { data: counts } = useRegistrationCounts();
  const settings = seasonSettings(season);
  const directory = usePlayerDirectory();
  const lastFinished = [...events].filter((e) => e.status === 'afgelopen').sort((a, b) => b.event_date.localeCompare(a.event_date))[0];
  const last = useEventBundle(lastFinished?.id);
  const seasonEvents = events.filter((e) => e.season_id === season?.id);

  if (isLoading) return <Spinner />;
  const preregistered = Number(counts?.find((c) => c.event_id === next?.id)?.preregistered ?? 0);
  const podium = (last.data?.results ?? []).filter((r) => r.place_from <= 3).sort((a, b) => a.place_from - b.place_from);

  return (
    <div className="space-y-4">
      {live && (
        <Link to={`/avond/${live.id}`} className="flex items-center justify-between gap-3 rounded-lg bg-accent-600 px-3 py-2 text-white shadow-xs hover:bg-accent-700">
          <span className="flex items-center gap-2 text-[13px] font-medium">
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
            <span>
              <b className="font-semibold">Nu live</b> · volg het schema en de uitslagen
            </span>
          </span>
          <Icon name="chevron" />
        </Link>
      )}

      {next ? (
        <div className="overflow-hidden rounded-lg bg-ink text-white shadow-xs">
          <div className="flex gap-3 p-3">
            <DateTile date={next.event_date} tone="dark" />
            <div className="min-w-0">
              <div className="text-2xs font-semibold tracking-wider text-accent-500 uppercase">{isMasters(next) ? 'Masters · eindejaarsfinale' : 'Volgende speelavond'}</div>
              <div className="truncate text-base leading-tight font-semibold">{formatLongDate(next.event_date)}</div>
              <ul className="mt-1.5 space-y-0.5 text-xs text-zinc-400">
                <li className="flex items-center gap-1.5">
                  <Icon name="clock" className="h-3.5 w-3.5" />
                  <span>
                    Start <b className="font-medium text-white">{time(next.start_time)}</b>
                    {!isMasters(next) && (
                      <>
                        {' '}
                        · inschrijven tot <b className="font-medium text-white">{time(next.registration_closes)}</b>
                      </>
                    )}
                  </span>
                </li>
                {isMasters(next) ? (
                  <li className="flex items-center gap-1.5">
                    <Icon name="trophy" className="h-3.5 w-3.5" />
                    <span>
                      Voor de top <b className="font-medium text-white">{settings.masters.size}</b> van de ranking
                    </span>
                  </li>
                ) : (
                  <li className="flex items-center gap-1.5">
                    <Icon name="euro" className="h-3.5 w-3.5" />
                    <span>
                      Inleg <b className="font-medium text-white">€{settings.entryFee}</b> · steeldarts · 501 double out
                    </span>
                  </li>
                )}
                <li className="flex items-center gap-1.5">
                  <Icon name="pin" className="h-3.5 w-3.5" />
                  Brasserie ’t Oud Sanatorium, Sijsele
                </li>
                {preregistered > 0 && (
                  <li className="flex items-center gap-1.5">
                    <Icon name="users" className="h-3.5 w-3.5" />
                    {preregistered} spelers schreven zich al in
                  </li>
                )}
                {next.notes && (
                  <li className="flex items-center gap-1.5">
                    <Icon name="note" className="h-3.5 w-3.5" />
                    {next.notes}
                  </li>
                )}
              </ul>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-white/10 px-3 py-2 text-xs text-zinc-400">
            <span>
              Nieuw? Iedereen is welkom.{' '}
              <Link to="/nieuw" className="font-medium text-white hover:underline">
                Zo werkt het
              </Link>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <AddToCalendarButton event={next} dark />
              {onlineRegistrationOpen(next, now) && (
                <Link to={`/inschrijven/${next.id}`} className="inline-flex h-8 items-center rounded-md bg-brand-600 px-3 text-[13px] font-medium text-white hover:bg-brand-700">
                  Schrijf je in
                </Link>
              )}
            </span>
          </div>
        </div>
      ) : (
        <Empty>De volgende speelavond is nog niet gepland.</Empty>
      )}

      {lastFinished && podium.length > 0 && (
        <div>
          <SectionTitle
            actions={
              <Link to={`/avond/${lastFinished.id}`} className="text-2xs font-medium text-brand-700 hover:underline">
                Volledige uitslag
              </Link>
            }
          >
            <span className="inline-flex items-center gap-1.5">
              Laatste winnaars · {formatDate(lastFinished.event_date)}
              {isMasters(lastFinished) && <MastersBadge />}
            </span>
          </SectionTitle>
          <div className="grid grid-cols-3 gap-2">
            {podium.slice(0, 3).map((r) => (
              <Link
                key={r.player_id}
                to={`/spelers/${r.player_id}`}
                className="flex min-w-0 flex-col items-center rounded-lg border border-zinc-200/80 bg-white px-1.5 py-2 text-center shadow-xs hover:border-brand-500"
              >
                <span className={cx('flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold', MEDALS[r.place_from - 1])}>{r.place_from}</span>
                <span className="mt-1 w-full truncate text-[13px] font-medium text-zinc-950">{directory.name(r.player_id)}</span>
                {!isMasters(lastFinished) && <span className="text-2xs text-zinc-500 tabular-nums">{r.points} ptn</span>}
              </Link>
            ))}
          </div>
        </div>
      )}

      {season && (
        <div>
          <SectionTitle>Kalender {season.name}</SectionTitle>
          <List>
            {seasonEvents.length === 0 && <p className="p-3 text-[13px] text-zinc-500">Nog geen speelavonden gepland.</p>}
            {seasonEvents.map((e) => (
              <Link key={e.id} to={`/avond/${e.id}`} className={cx(rowClass, rowHover, 'py-1.5')}>
                <DateTile date={e.event_date} tone={e.status === 'afgelopen' ? 'muted' : 'light'} />
                <span className={cx('min-w-0 flex-1 truncate text-[13px]', e.status === 'afgelopen' ? 'text-zinc-500' : 'font-medium text-zinc-950')}>{formatLongDate(e.event_date)}</span>
                {isMasters(e) && <MastersBadge />}
                {e.status === 'bezig' ? <LiveBadge /> : <Badge tone={e.status === 'afgelopen' ? 'stone' : 'blue'}>{e.status === 'afgelopen' ? 'uitslag' : time(e.start_time)}</Badge>}
                <Icon name="chevron" className="h-3.5 w-3.5 text-zinc-300" />
              </Link>
            ))}
          </List>
        </div>
      )}
    </div>
  );
}

const MEDALS = ['bg-amber-400 text-amber-950', 'bg-zinc-300 text-zinc-800', 'bg-orange-300 text-orange-950'];

// ---------------------------------------------------------------------------
// Eén speelavond: live schema of uitslag
// ---------------------------------------------------------------------------

type PublicTab = 'borden' | 'eindstand' | 'schema' | 'poules' | 'uitslagen';

export function EventPublicPage() {
  const { eventId } = useParams();
  const bundle = useEventBundle(eventId, { live: true });
  const directory = usePlayerDirectory();
  const now = useNow(20_000);
  const view = useMemo(() => (bundle.data ? buildEventView(bundle.data, now) : null), [bundle.data, now]);
  const [tab, setTab] = useState<PublicTab | null>(null);
  if (bundle.isLoading) return <Spinner />;
  if (!view) return <ErrorBox error={bundle.error ?? 'Speelavond niet gevonden.'} />;
  const { event } = view;
  const pooled = view.format === 'poules_ab';
  const schemaTab = { id: 'schema' as const, label: pooled ? 'A/B-schema' : 'Schema' };
  const poulesTab = pooled ? [{ id: 'poules' as const, label: 'Poules' }] : [];
  const tabs: Array<{ id: PublicTab; label: string }> =
    event.status === 'bezig'
      ? [{ id: 'borden', label: 'Borden' }, ...poulesTab, schemaTab, { id: 'uitslagen', label: 'Laatste uitslagen' }]
      : [{ id: 'eindstand', label: 'Eindstand' }, schemaTab, ...poulesTab];
  const active = tab && tabs.some((t) => t.id === tab) ? tab : tabs[0].id;
  const name = directory.name;
  // De Masters heeft geen seizoenspunten.
  const points = isMasters(event) ? undefined : new Map((bundle.data?.results ?? []).map((r) => [r.player_id, r.points]));
  const poolAverages = averagesFor(view, (m) => m.stage === 'pool');
  const recent = view.matches
    .filter((m) => m.finishedAt !== null && !m.walkover)
    .sort((a, b) => (b.finishedAt as number) - (a.finishedAt as number))
    .slice(0, 12);

  return (
    <div>
      <div className="mb-2 flex items-start gap-3">
        <DateTile date={event.event_date} tone={event.status === 'afgelopen' ? 'muted' : 'light'} />
        <div className="min-w-0">
          <h1 className="truncate text-lg leading-tight font-semibold tracking-tight text-zinc-950">{formatLongDate(event.event_date)}</h1>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            {isMasters(event) && <MastersBadge />}
            {event.status === 'bezig' ? <LiveBadge /> : <Badge tone={event.status === 'afgelopen' ? 'dark' : 'blue'}>{event.status === 'afgelopen' ? 'afgelopen' : 'gepland'}</Badge>}
            {event.status === 'bezig' && view.live?.forecast.end && <span>verwacht einde rond {formatTime(view.live.forecast.end)}</span>}
            {event.notes && <span className="truncate">{event.notes}</span>}
          </div>
        </div>
      </div>
      {event.status === 'gepland' ? (
        <Card className="space-y-2.5 text-[13px] text-zinc-700">
          {isMasters(event) ? (
            <p>
              De Masters (eindejaarsfinale) start om {time(event.start_time)}. Ze is voor de top van de seizoensranking: wie er niet is, wordt vervangen door de volgende in de
              ranking. Inschrijven is niet nodig. Het schema verschijnt hier zodra de Masters begint.
            </p>
          ) : (
            <p>
              Deze speelavond start om {time(event.start_time)}. Inschrijven kan online of ter plaatse tot {time(event.registration_closes)}. Het schema verschijnt hier
              zodra het toernooi begint.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {onlineRegistrationOpen(event, now) && (
              <Link to={`/inschrijven/${event.id}`} className="flex-1">
                <Button block>Schrijf je in</Button>
              </Link>
            )}
            <AddToCalendarButton event={event} className="h-9" />
          </div>
        </Card>
      ) : (
        <>
          <Tabs value={active} onChange={setTab} tabs={tabs} />
          {active === 'borden' && <BoardsOverview view={view} name={name} />}
          {active === 'eindstand' && view.placements?.complete && (
            <>
              {event.status === 'afgelopen' && (
                <div className="mb-2 flex justify-end">
                  <ShareResultButton view={view} points={points ?? new Map()} name={name} />
                </div>
              )}
              <PlacementsTable placements={view.placements.placements} name={name} points={points} />
              {view.averages.size > 0 && (
                <>
                  <SectionTitle>Gemiddelden van de avond</SectionTitle>
                  <AveragesTable averages={view.averages} name={name} />
                </>
              )}
            </>
          )}
          {active === 'schema' &&
            (!pooled || event.knockout ? (
              SCHEMA_STAGES[view.format].map((stage) => (
                <div key={stage}>
                  <SectionTitle>{STAGE_NAMES[stage]}</SectionTitle>
                  <Bracket stage={stage} matches={view.matches} name={name} />
                </div>
              ))
            ) : (
              <Empty>De A- en B-schema’s verschijnen zodra de poules gespeeld zijn.</Empty>
            ))}
          {active === 'poules' && view.poolStatus && (
            <div className="grid gap-2 md:grid-cols-2">
              {view.poolStatus.standings.map((s) => (
                <PoolTable
                  key={s.poolId}
                  standing={s}
                  label={view.pools.find((p) => p.id === s.poolId)?.label ?? s.poolId}
                  advance={view.config?.advance ?? 2}
                  name={name}
                  averages={poolAverages}
                />
              ))}
            </div>
          )}
          {active === 'uitslagen' &&
            (recent.length > 0 ? (
              <>
                <TileGrid>
                  {recent.map((m) => (
                    <MatchTile key={m.id} m={m} name={name} title={shortTitle(m, view)} />
                  ))}
                </TileGrid>
                {view.averages.size > 0 && (
                  <>
                    <SectionTitle>Gemiddelden van de avond</SectionTitle>
                    <AveragesTable averages={view.averages} name={name} />
                  </>
                )}
              </>
            ) : (
              <Empty>Nog geen uitslagen.</Empty>
            ))}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Uitslagen per avond
// ---------------------------------------------------------------------------

function SeasonSelect({ value, onChange }: { value: string | undefined; onChange: (id: string) => void }) {
  const { data: seasons } = useSeasons();
  if (!seasons || seasons.length < 2) return null;
  return (
    <Select className="h-8 w-40 text-[13px]" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Seizoen">
      {seasons.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </Select>
  );
}

export function ResultsPage() {
  const { data: seasons, isLoading } = useSeasons();
  const { data: events } = useEvents();
  const [seasonId, setSeasonId] = useState<string | undefined>();
  const season = seasons?.find((s) => s.id === seasonId) ?? pickCurrentSeason(seasons);
  const { data: seasonData } = useSeasonData(season?.id);
  const directory = usePlayerDirectory();
  if (isLoading) return <Spinner />;
  const finished = (events ?? []).filter((e) => e.season_id === season?.id && e.status !== 'gepland').sort((a, b) => b.event_date.localeCompare(a.event_date));
  const resultsOf = (eventId: string) => (seasonData?.results ?? []).filter((r) => r.event_id === eventId);
  return (
    <div>
      <PageTitle actions={<SeasonSelect value={season?.id} onChange={setSeasonId} />}>Uitslagen {season?.name}</PageTitle>
      {finished.length === 0 ? (
        <Empty>Nog geen gespeelde avonden in dit seizoen.</Empty>
      ) : (
        <List>
          {finished.map((e) => {
            const results = resultsOf(e.id);
            const winner = results.find((r) => r.place_from === 1);
            return (
              <Link key={e.id} to={`/avond/${e.id}`} className={cx(rowClass, rowHover, 'py-1.5')}>
                <DateTile date={e.event_date} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 truncate text-[13px] font-medium text-zinc-950">
                    {formatLongDate(e.event_date)}
                    {isMasters(e) && <MastersBadge />}
                  </span>
                  <span className="block truncate text-2xs text-zinc-500">
                    {winner ? (
                      <>
                        <Icon name="trophy" className="mr-1 inline h-3 w-3 align-[-2px] text-amber-500" />
                        {directory.name(winner.player_id)} · {results.length} spelers
                      </>
                    ) : (
                      'bezig'
                    )}
                  </span>
                </span>
                {e.status === 'bezig' && <LiveBadge />}
                <Icon name="chevron" className="h-3.5 w-3.5 text-zinc-300" />
              </Link>
            );
          })}
        </List>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Seizoensranking
// ---------------------------------------------------------------------------

type Board = 'punten' | 'elo' | '180' | 'finish' | 'deelnames' | 'nieuwkomers';

const BOARDS: Array<{ id: Board; label: string }> = [
  { id: 'punten', label: 'Punten' },
  { id: 'elo', label: 'Elo' },
  { id: '180', label: '180’s' },
  { id: 'finish', label: 'Hoogste uitgooi' },
  { id: 'deelnames', label: 'Deelnames' },
  { id: 'nieuwkomers', label: 'Nieuwkomers' },
];

const positionClass = (position: number) =>
  cx(
    'inline-flex h-5 w-5 items-center justify-center rounded-full text-2xs font-bold tabular-nums',
    position === 1 ? 'bg-amber-400 text-amber-950' : position === 2 ? 'bg-zinc-300 text-zinc-800' : position === 3 ? 'bg-orange-300 text-orange-950' : 'text-zinc-500',
  );

/** Eenvoudig klassement: positie, speler, één waarde (en optioneel een detail). */
function LeaderTable({ rows, name, valueLabel, detail }: { rows: Array<{ playerId: string; position: number; value: ReactNode; detail?: ReactNode }>; name: (id: string) => string; valueLabel: string; detail?: string }) {
  if (rows.length === 0) return <Empty>Nog niets in dit klassement.</Empty>;
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200/80 bg-white shadow-xs">
      <table className="w-full text-[13px]">
        <thead className="border-b border-zinc-100 bg-zinc-50/80 text-2xs text-zinc-500">
          <tr>
            <th className="w-10 py-1.5 text-center font-medium">#</th>
            <th className="py-1.5 text-left font-medium">Speler</th>
            {detail && <th className="w-24 text-right font-medium">{detail}</th>}
            <th className="w-16 pr-3 text-right font-medium">{valueLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.playerId} className="border-t border-zinc-100 first:border-t-0 hover:bg-zinc-50">
              <td className="py-1.5 text-center">
                <span className={positionClass(r.position)}>{r.position}</span>
              </td>
              <td className="max-w-0 truncate py-1.5">
                <Link to={`/spelers/${r.playerId}`} className="font-medium text-zinc-950 hover:text-brand-700">
                  {name(r.playerId)}
                </Link>
              </td>
              {detail && <td className="text-right text-2xs text-zinc-500 tabular-nums">{r.detail}</td>}
              <td className="pr-3 text-right font-semibold text-zinc-950 tabular-nums">{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RankingPage() {
  const { seasonId } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const board = (BOARDS.find((b) => b.id === params.get('klassement'))?.id ?? 'punten') as Board;
  const { data: seasons, isLoading: loadingSeasons } = useSeasons();
  const season = seasons?.find((s) => s.id === seasonId) ?? pickCurrentSeason(seasons);
  const settings = seasonSettings(season);
  const { rows, isLoading, error, data } = useSeasonRanking(season);
  const { elo, firstSeen } = useElo();
  const directory = usePlayerDirectory();
  const boards = useMemo(
    () =>
      season && data
        ? seasonLeaderboards({
            stats: data.stats.map((s) => ({ playerId: s.player_id, eventId: s.event_id, count180: s.count_180, highestFinish: s.highest_finish })),
            participations: data.results.map((r) => ({ playerId: r.player_id, eventId: r.event_id })),
            ranking: rows,
            firstSeen,
            seasonStart: season.starts_on,
            seasonEnd: season.ends_on,
          })
        : null,
    [season, data, rows, firstSeen],
  );
  if (loadingSeasons || isLoading) return <Spinner />;
  if (error) return <ErrorBox error={error} />;
  const played = (data?.events ?? []).filter((e) => e.status === 'afgelopen').length;
  const dateOf = new Map((data?.events ?? []).map((e) => [e.id, e.event_date]));

  const eloRows = elo
    ? [...elo.ratings.entries()]
        .filter(([p]) => directory.byId.has(p))
        .sort((a, b) => b[1] - a[1])
        .map(([playerId, rating], i) => ({
          playerId,
          position: i + 1,
          value: Math.round(rating),
          detail: `${(elo.matches.get(playerId) ?? 0) < settings.elo.newcomerMatches ? 'voorlopig · ' : ''}${elo.matches.get(playerId) ?? 0}`,
        }))
    : [];

  return (
    <div>
      <PageTitle
        sub={
          board === 'elo'
            ? 'Niveau over alle avonden en seizoenen heen; gebruikt voor de loting.'
            : settings.bestOf.enabled
              ? `De beste ${settings.bestOf.count} van ${settings.bestOf.of} avonden tellen mee · ${played} avond${played === 1 ? '' : 'en'} gespeeld`
              : `Alle avonden tellen mee · ${played} gespeeld`
        }
        actions={board !== 'elo' && <SeasonSelect value={season?.id} onChange={(id) => navigate(`/ranking/${id}?klassement=${board}`)} />}
      >
        {board === 'elo' ? 'Elo-rating' : `Ranking ${season?.name ?? ''}`}
      </PageTitle>
      <Tabs
        value={board}
        onChange={(b) => setParams(b === 'punten' ? {} : { klassement: b }, { replace: true })}
        tabs={BOARDS}
      />

      {board === 'punten' &&
        (rows.length === 0 ? (
          <Empty>Nog geen punten in dit seizoen.</Empty>
        ) : (
          <>
            <div className="overflow-hidden rounded-lg border border-zinc-200/80 bg-white shadow-xs">
              <table className="w-full text-[13px]">
                <thead className="border-b border-zinc-100 bg-zinc-50/80 text-2xs text-zinc-500">
                  <tr>
                    <th className="w-10 py-1.5 text-center font-medium">#</th>
                    <th className="py-1.5 text-left font-medium">Speler</th>
                    <th className="w-12 text-center font-medium">Ptn</th>
                    <th className="w-12 text-center font-medium">Av.</th>
                    <th className="hidden w-14 text-center font-medium sm:table-cell">Zeges</th>
                    <th className="w-12 text-center font-medium">Beste</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.playerId} className="border-t border-zinc-100 first:border-t-0 hover:bg-zinc-50">
                      <td className="py-1.5 text-center">
                        <span className={positionClass(r.position)}>{r.position}</span>
                      </td>
                      <td className="max-w-0 truncate py-1.5">
                        <Link to={`/spelers/${r.playerId}`} className="font-medium text-zinc-950 hover:text-brand-700">
                          {directory.name(r.playerId)}
                        </Link>
                        {settings.bestOf.enabled && r.total !== r.counted && <span className="ml-1 text-2xs text-zinc-400">({r.total})</span>}
                      </td>
                      <td className="text-center font-semibold text-zinc-950 tabular-nums">{r.counted}</td>
                      <td className="text-center text-zinc-500 tabular-nums">{r.events}</td>
                      <td className="hidden text-center text-zinc-500 tabular-nums sm:table-cell">{r.wins}</td>
                      <td className="text-center text-zinc-500 tabular-nums">{r.bestPlace}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-2xs text-zinc-500">
              Tussen haakjes: totaal van alle avonden. Bij gelijke punten: aantal overwinningen → beste resultaat → onderling resultaat → gewonnen legs → loting.
            </p>
          </>
        ))}
      {board === 'elo' && <LeaderTable rows={eloRows} name={directory.name} valueLabel="Elo" detail="Matchen" />}
      {board === '180' && boards && <LeaderTable rows={boards.most180} name={directory.name} valueLabel="180’s" />}
      {board === 'finish' && boards && (
        <LeaderTable
          rows={boards.highestFinish.map((r) => ({ ...r, detail: r.eventId && dateOf.get(r.eventId) ? formatDate(dateOf.get(r.eventId) as string) : '' }))}
          name={directory.name}
          valueLabel="Uitgooi"
          detail="Avond"
        />
      )}
      {board === 'deelnames' && boards && <LeaderTable rows={boards.attendances} name={directory.name} valueLabel="Avonden" />}
      {board === 'nieuwkomers' && boards && (
        <>
          <LeaderTable rows={boards.newcomers} name={directory.name} valueLabel="Ptn" />
          <p className="mt-2 text-2xs text-zinc-500">Spelers die hun allereerste avond in dit seizoen speelden, gerangschikt op hun punten.</p>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Spelers
// ---------------------------------------------------------------------------

export function PlayersPage() {
  const directory = usePlayerDirectory();
  const [query, setQuery] = useState('');
  if (directory.isLoading) return <Spinner />;
  const list = directory.list.filter((p) => !p.anonymized_at && matchesSearch(`${p.name} ${p.nickname ?? ''}`, query));
  return (
    <div>
      <PageTitle>Spelers</PageTitle>
      <SearchInput placeholder="Zoek een speler…" value={query} onChange={(e) => setQuery(e.target.value)} className="mb-3" />
      <List className="grid sm:grid-cols-2 sm:divide-y-0">
        {list.map((p) => (
          <Link key={p.id} to={`/spelers/${p.id}`} className={cx(rowClass, rowHover, 'py-1.5 sm:border-b sm:border-zinc-100 sm:odd:border-r')}>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-2xs font-semibold text-white">{initials(p.name)}</span>
            <span className="truncate text-[13px] font-medium text-zinc-950">{displayName(p)}</span>
          </Link>
        ))}
      </List>
    </div>
  );
}

export function PlayerPage() {
  const { playerId } = useParams();
  const directory = usePlayerDirectory();
  const { data, isLoading, error } = usePlayerData(playerId);
  const { data: events } = useEvents();
  const { season, data: seasons } = useCurrentSeason();
  const { rows, data: seasonData } = useSeasonRanking(season);
  const { elo } = useElo();
  const player = directory.byId.get(playerId ?? '');
  const [chart, setChart] = useState<'ranking' | 'elo' | 'average'>('ranking');
  const progress = useMemo(() => {
    if (!player || !season || !seasonData) return [];
    const settings = seasonSettings(season);
    return rankingProgress(
      {
        events: seasonData.events.filter((e) => e.status === 'afgelopen').map((e) => ({ id: e.id, date: e.event_date })),
        results: seasonData.results.map((r) => ({
          eventId: r.event_id,
          playerId: r.player_id,
          placeFrom: r.place_from,
          placeTo: r.place_to,
          points: placementPoints(r.place_from, settings.points.table) + settings.points.participation,
        })),
        matches: seasonData.matches.map((m) => ({ eventId: m.event_id, match: matchFromRow(m) })),
        bestOf: settings.bestOf,
        lotSeed: season.id,
      },
      player.id,
    );
  }, [player, season, seasonData]);
  if (isLoading || directory.isLoading) return <Spinner />;
  if (error) return <ErrorBox error={error} />;
  if (!player) return <ErrorBox>Speler niet gevonden.</ErrorBox>;

  const eventById = new Map((events ?? []).map((e) => [e.id, e]));
  const results = (data?.results ?? [])
    .map((r) => ({ ...r, date: eventById.get(r.event_id)?.event_date ?? '', masters: isMasters(eventById.get(r.event_id)) }))
    .sort((a, b) => b.date.localeCompare(a.date));
  // De Masters telt niet mee als deelname of avondzege.
  const regular = results.filter((r) => !r.masters);
  const mastersWins = results
    .filter((r) => r.masters && r.place_from === 1)
    .map((r) => seasons?.find((s) => s.id === eventById.get(r.event_id)?.season_id)?.name ?? r.date.slice(0, 4));
  const matches = (data?.matches ?? []).map(matchFromRow).filter(isFinished);
  const won = matches.filter((m) => m.winner === player.id && !m.walkover).length;
  const lost = matches.filter((m) => m.winner !== player.id && !m.walkover).length;
  const legsFor = matches.reduce((s, m) => s + ((m.player1 === player.id ? m.legs1 : m.legs2) ?? 0), 0);
  const legsAgainst = matches.reduce((s, m) => s + ((m.player1 === player.id ? m.legs2 : m.legs1) ?? 0), 0);
  const n180 = (data?.stats ?? []).reduce((s, x) => s + x.count_180, 0);
  const bestFinish = Math.max(0, ...(data?.stats ?? []).map((x) => x.highest_finish ?? 0));
  const rank = rows.find((r) => r.playerId === player.id);
  const history = elo?.history.get(player.id) ?? [];
  const rating = elo?.ratings.get(player.id);
  const lastChange = history.length > 0 ? eloChangeForEvent(history, history[history.length - 1].eventId) : null;
  const peak = history.length > 0 ? Math.max(...history.map((h) => h.after)) : null;
  const eloPoints = eloProgress(history);
  // Gemiddelde per avond (enkel matchen die per beurt gescoord werden).
  const averagePoints = averageProgress(
    (data?.stats ?? [])
      .filter((s) => s.darts != null && s.points != null)
      .map((s) => ({ eventId: s.event_id, date: eventById.get(s.event_id)?.event_date ?? '', darts: s.darts as number, points: s.points as number })),
  );
  const averageByEvent = new Map(averagePoints.map((p) => [p.eventId, p.value]));

  const stat = (label: string, value: string | number, sub?: string) => (
    <div className="bg-white px-1.5 py-2 text-center">
      <div className="text-base leading-5 font-semibold text-zinc-950 tabular-nums">{value}</div>
      <div className="truncate text-2xs text-zinc-500">{label}</div>
      {sub && <div className="truncate text-2xs text-zinc-400 tabular-nums">{sub}</div>}
    </div>
  );

  return (
    <div>
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-semibold text-white">{initials(player.name)}</span>
        <div className="min-w-0">
          <h1 className="truncate text-lg leading-tight font-semibold tracking-tight text-zinc-950">{player.name}</h1>
          <p className="text-xs text-zinc-500">
            {player.nickname ? `“${player.nickname}” · ` : ''}
            {rank ? `#${rank.position} in ${season?.name ?? 'de ranking'}` : 'nog niet gerankt'}
            {peak !== null && ` · Elo-piek ${Math.round(peak)}`}
          </p>
          {mastersWins.length > 0 && (
            <p className="mt-1 flex flex-wrap gap-1" data-masters-winner>
              {mastersWins.map((name) => (
                <Badge key={name} tone="amber">
                  <Icon name="trophy" className="h-3 w-3" />
                  Masters-winnaar {name}
                </Badge>
              ))}
            </p>
          )}
        </div>
      </div>
      <div className="grid grid-cols-4 gap-px overflow-hidden rounded-lg border border-zinc-200/80 bg-zinc-100 shadow-xs">
        {stat('deelnames', regular.length)}
        {stat('zeges', regular.filter((r) => r.place_from === 1).length)}
        {stat('beste', regular.length ? Math.min(...regular.map((r) => r.place_from)) : '–')}
        {stat('matchen', `${won}/${won + lost}`)}
        {stat('legs', `${legsFor}–${legsAgainst}`)}
        {stat('180’s', n180)}
        {stat('uitgooi', bestFinish || '–')}
        {stat(
          'Elo',
          rating !== undefined ? Math.round(rating) : '–',
          lastChange !== null ? `${lastChange >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(lastChange))} laatste avond` : undefined,
        )}
      </div>
      {(progress.length > 0 || eloPoints.length > 0 || averagePoints.length > 0) && (
        <>
          <SectionTitle
            actions={
              <Segmented
                value={chart}
                onChange={setChart}
                options={[
                  { id: 'ranking', label: 'Ranking' },
                  { id: 'elo', label: 'Elo' },
                  ...(averagePoints.length > 0 ? [{ id: 'average' as const, label: 'Gemiddelde' }] : []),
                ]}
              />
            }
          >
            Verloop
          </SectionTitle>
          {chart === 'ranking' ? (
            progress.length > 0 ? (
              <LineChart points={progress} invert integer format={(v) => `#${Math.round(v)}`} label={`Plaats in de ranking ${season?.name ?? ''}`} />
            ) : (
              <Empty>Nog geen punten in dit seizoen.</Empty>
            )
          ) : chart === 'average' && averagePoints.length > 0 ? (
            <LineChart points={averagePoints} format={(v) => formatDecimal(v)} label="3-dart gemiddelde per avond" />
          ) : eloPoints.length > 0 ? (
            <LineChart points={eloPoints} label="Elo na elke avond" />
          ) : (
            <Empty>Nog geen Elo.</Empty>
          )}
        </>
      )}

      <SectionTitle>Resultaten per avond</SectionTitle>
      {results.length === 0 ? (
        <Empty>Nog geen resultaten.</Empty>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-200/80 bg-white shadow-xs">
          <table className="w-full text-[13px]">
            <thead className="border-b border-zinc-100 bg-zinc-50/80 text-2xs text-zinc-500">
              <tr>
                <th className="py-1.5 pl-3 text-left font-medium">Datum</th>
                <th className="text-center font-medium">Plaats</th>
                <th className="text-center font-medium">Punten</th>
                {averageByEvent.size > 0 && <th className="pr-3 text-right font-medium">Gem.</th>}
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.event_id} className="border-t border-zinc-100 first:border-t-0">
                  <td className="py-1.5 pl-3">
                    <Link to={`/avond/${r.event_id}`} className="font-medium text-zinc-950 hover:text-brand-700">
                      {formatDate(r.date)}
                    </Link>
                    {r.masters && (
                      <span className="ml-1.5">
                        <MastersBadge />
                      </span>
                    )}
                  </td>
                  <td className="text-center text-zinc-600 tabular-nums">{formatPlace(r.place_from, r.place_to)}</td>
                  <td className="text-center font-semibold tabular-nums">{r.masters ? '–' : r.points}</td>
                  {averageByEvent.size > 0 && (
                    <td className="pr-3 text-right text-zinc-600 tabular-nums">{averageByEvent.has(r.event_id) ? formatDecimal(averageByEvent.get(r.event_id)) : ''}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
