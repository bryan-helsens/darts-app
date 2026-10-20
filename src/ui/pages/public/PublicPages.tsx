import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { formatPlace, isFinished } from '../../../engine';
import { buildEventView } from '../../../data/eventView';
import { matchFromRow } from '../../../data/mappers';
import { useEventBundle, useEvents, usePlayerData, usePlayerDirectory, useRegistrationCounts, useSeasonData, useSeasons } from '../../../data/queries';
import { matchesSearch } from '../../../lib/names';
import { formatDate, formatLongDate, formatTime, shortTime } from '../../../lib/time';
import { BoardsOverview, Bracket, MatchTile, PlacementsTable, PoolTable, shortTitle, TileGrid } from '../../components/darts';
import { displayName } from '../../components/players';
import { Badge, Card, cx, DateTile, Empty, ErrorBox, Icon, List, LiveBadge, PageTitle, rowClass, rowHover, SearchInput, SectionTitle, Select, Spinner, Tabs } from '../../components/ui';
import { pickCurrentSeason, seasonSettings, useCurrentSeason, useNow, useSeasonRanking, useUpcoming } from '../../hooks';

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
              <div className="text-2xs font-semibold tracking-wider text-accent-500 uppercase">Volgende speelavond</div>
              <div className="truncate text-base leading-tight font-semibold">{formatLongDate(next.event_date)}</div>
              <ul className="mt-1.5 space-y-0.5 text-xs text-zinc-400">
                <li className="flex items-center gap-1.5">
                  <Icon name="clock" className="h-3.5 w-3.5" />
                  <span>
                    Start <b className="font-medium text-white">{time(next.start_time)}</b> · inschrijven tot <b className="font-medium text-white">{time(next.registration_closes)}</b>
                  </span>
                </li>
                <li className="flex items-center gap-1.5">
                  <Icon name="euro" className="h-3.5 w-3.5" />
                  <span>
                    Inleg <b className="font-medium text-white">€{settings.entryFee}</b> · steeldarts · 501 double out
                  </span>
                </li>
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
          <Link to="/nieuw" className="flex items-center justify-between gap-2 border-t border-white/10 px-3 py-2 text-xs text-zinc-400 hover:bg-white/5">
            <span>Nieuw? Iedereen is welkom.</span>
            <span className="font-medium text-white">Zo werkt het →</span>
          </Link>
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
            Laatste winnaars · {formatDate(lastFinished.event_date)}
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
                <span className="text-2xs text-zinc-500 tabular-nums">{r.points} ptn</span>
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
  const tabs: Array<{ id: PublicTab; label: string }> =
    event.status === 'bezig'
      ? [
          { id: 'borden', label: 'Borden' },
          { id: 'poules', label: 'Poules' },
          { id: 'schema', label: 'A/B-schema' },
          { id: 'uitslagen', label: 'Laatste uitslagen' },
        ]
      : [
          { id: 'eindstand', label: 'Eindstand' },
          { id: 'schema', label: 'A/B-schema' },
          { id: 'poules', label: 'Poules' },
        ];
  const active = tab && tabs.some((t) => t.id === tab) ? tab : tabs[0].id;
  const name = directory.name;
  const points = new Map((bundle.data?.results ?? []).map((r) => [r.player_id, r.points]));
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
            {event.status === 'bezig' ? <LiveBadge /> : <Badge tone={event.status === 'afgelopen' ? 'dark' : 'blue'}>{event.status === 'afgelopen' ? 'afgelopen' : 'gepland'}</Badge>}
            {event.status === 'bezig' && view.live?.forecast.end && <span>verwacht einde rond {formatTime(view.live.forecast.end)}</span>}
            {event.notes && <span className="truncate">{event.notes}</span>}
          </div>
        </div>
      </div>
      {event.status === 'gepland' ? (
        <Card className="text-[13px] text-zinc-700">
          Deze speelavond start om {time(event.start_time)}. Inschrijven kan ter plaatse tot {time(event.registration_closes)}. Het schema verschijnt hier zodra het
          toernooi begint.
        </Card>
      ) : (
        <>
          <Tabs value={active} onChange={setTab} tabs={tabs} />
          {active === 'borden' && <BoardsOverview view={view} name={name} />}
          {active === 'eindstand' && view.placements?.complete && <PlacementsTable placements={view.placements.placements} name={name} points={points} />}
          {active === 'schema' &&
            (event.knockout ? (
              <>
                <SectionTitle>A-schema</SectionTitle>
                <Bracket stage="A" matches={view.matches} name={name} />
                <SectionTitle>B-schema</SectionTitle>
                <Bracket stage="B" matches={view.matches} name={name} />
              </>
            ) : (
              <Empty>De A- en B-schema’s verschijnen zodra de poules gespeeld zijn.</Empty>
            ))}
          {active === 'poules' && view.poolStatus && (
            <div className="grid gap-2 md:grid-cols-2">
              {view.poolStatus.standings.map((s) => (
                <PoolTable key={s.poolId} standing={s} label={view.pools.find((p) => p.id === s.poolId)?.label ?? s.poolId} advance={view.config?.advance ?? 2} name={name} />
              ))}
            </div>
          )}
          {active === 'uitslagen' &&
            (recent.length > 0 ? (
              <TileGrid>
                {recent.map((m) => (
                  <MatchTile key={m.id} m={m} name={name} title={shortTitle(m, view)} />
                ))}
              </TileGrid>
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
                  <span className="block truncate text-[13px] font-medium text-zinc-950">{formatLongDate(e.event_date)}</span>
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

export function RankingPage() {
  const { seasonId } = useParams();
  const navigate = useNavigate();
  const { data: seasons, isLoading: loadingSeasons } = useSeasons();
  const season = seasons?.find((s) => s.id === seasonId) ?? pickCurrentSeason(seasons);
  const settings = seasonSettings(season);
  const { rows, isLoading, error, data } = useSeasonRanking(season);
  const directory = usePlayerDirectory();
  if (loadingSeasons || isLoading) return <Spinner />;
  if (error) return <ErrorBox error={error} />;
  const played = (data?.events ?? []).filter((e) => e.status === 'afgelopen').length;
  return (
    <div>
      <PageTitle
        sub={
          settings.bestOf.enabled
            ? `De beste ${settings.bestOf.count} van ${settings.bestOf.of} avonden tellen mee · ${played} avond${played === 1 ? '' : 'en'} gespeeld`
            : `Alle avonden tellen mee · ${played} gespeeld`
        }
        actions={<SeasonSelect value={season?.id} onChange={(id) => navigate(`/ranking/${id}`)} />}
      >
        Ranking {season?.name}
      </PageTitle>
      {rows.length === 0 ? (
        <Empty>Nog geen punten in dit seizoen.</Empty>
      ) : (
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
                    <span
                      className={cx(
                        'inline-flex h-5 w-5 items-center justify-center rounded-full text-2xs font-bold tabular-nums',
                        r.position === 1 ? 'bg-amber-400 text-amber-950' : r.position === 2 ? 'bg-zinc-300 text-zinc-800' : r.position === 3 ? 'bg-orange-300 text-orange-950' : 'text-zinc-500',
                      )}
                    >
                      {r.position}
                    </span>
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
      )}
      <p className="mt-2 text-2xs text-zinc-500">
        Tussen haakjes: totaal van alle avonden. Bij gelijke punten: aantal overwinningen → beste resultaat → onderling resultaat → gewonnen legs → loting.
      </p>
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
  const { season } = useCurrentSeason();
  const { rows } = useSeasonRanking(season);
  const player = directory.byId.get(playerId ?? '');
  if (isLoading || directory.isLoading) return <Spinner />;
  if (error) return <ErrorBox error={error} />;
  if (!player) return <ErrorBox>Speler niet gevonden.</ErrorBox>;

  const eventById = new Map((events ?? []).map((e) => [e.id, e]));
  const results = (data?.results ?? []).map((r) => ({ ...r, date: eventById.get(r.event_id)?.event_date ?? '' })).sort((a, b) => b.date.localeCompare(a.date));
  const matches = (data?.matches ?? []).map(matchFromRow).filter(isFinished);
  const won = matches.filter((m) => m.winner === player.id && !m.walkover).length;
  const lost = matches.filter((m) => m.winner !== player.id && !m.walkover).length;
  const legsFor = matches.reduce((s, m) => s + ((m.player1 === player.id ? m.legs1 : m.legs2) ?? 0), 0);
  const legsAgainst = matches.reduce((s, m) => s + ((m.player1 === player.id ? m.legs2 : m.legs1) ?? 0), 0);
  const n180 = (data?.stats ?? []).reduce((s, x) => s + x.count_180, 0);
  const bestFinish = Math.max(0, ...(data?.stats ?? []).map((x) => x.highest_finish ?? 0));
  const rank = rows.find((r) => r.playerId === player.id);

  const stat = (label: string, value: string | number) => (
    <div className="bg-white px-1.5 py-2 text-center">
      <div className="text-base leading-5 font-semibold text-zinc-950 tabular-nums">{value}</div>
      <div className="truncate text-2xs text-zinc-500">{label}</div>
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
          </p>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-px overflow-hidden rounded-lg border border-zinc-200/80 bg-zinc-100 shadow-xs">
        {stat('deelnames', results.length)}
        {stat('zeges', results.filter((r) => r.place_from === 1).length)}
        {stat('beste', results.length ? Math.min(...results.map((r) => r.place_from)) : '–')}
        {stat('matchen', `${won}/${won + lost}`)}
        {stat('legs', `${legsFor}–${legsAgainst}`)}
        {stat('180’s', n180)}
        {stat('uitgooi', bestFinish || '–')}
        {stat('ranking', rank ? `#${rank.position}` : '–')}
      </div>
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
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.event_id} className="border-t border-zinc-100 first:border-t-0">
                  <td className="py-1.5 pl-3">
                    <Link to={`/avond/${r.event_id}`} className="font-medium text-zinc-950 hover:text-brand-700">
                      {formatDate(r.date)}
                    </Link>
                  </td>
                  <td className="text-center text-zinc-600 tabular-nums">{formatPlace(r.place_from, r.place_to)}</td>
                  <td className="text-center font-semibold tabular-nums">{r.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
