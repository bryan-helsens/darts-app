import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { formatPlace, isFinished } from '../../../engine';
import { buildEventView } from '../../../data/eventView';
import { matchFromRow } from '../../../data/mappers';
import { useEventBundle, useEvents, usePlayerData, usePlayerDirectory, useRegistrationCounts, useSeasons } from '../../../data/queries';
import { matchesSearch } from '../../../lib/names';
import { formatDate, formatLongDate, formatTime, shortTime } from '../../../lib/time';
import { BoardsOverview, Bracket, MatchLine, PlacementsTable, PoolTable } from '../../components/darts';
import { displayName } from '../../components/players';
import { Badge, Card, cx, Empty, ErrorBox, Icon, LiveBadge, PageTitle, SearchInput, SectionTitle, Select, Spinner } from '../../components/ui';
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
    <div className="space-y-5">
      {live && (
        <Link to={`/avond/${live.id}`} className="flex items-center justify-between gap-3 rounded-xl bg-accent-600 px-4 py-3 text-white hover:bg-accent-700">
          <span>
            <span className="flex items-center gap-1.5 text-xs font-bold tracking-wider uppercase">
              <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> Nu live
            </span>
            <span className="block font-semibold">Volg het schema en de uitslagen van vanavond</span>
          </span>
          <Icon name="chevron" className="h-5 w-5" />
        </Link>
      )}

      {next ? (
        <div className="overflow-hidden rounded-xl bg-ink text-white">
          <div className="p-4 sm:p-5">
            <div className="text-xs font-semibold tracking-wider text-accent-500 uppercase">Volgende speelavond</div>
            <div className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{formatLongDate(next.event_date)}</div>
            <ul className="mt-3 grid gap-1.5 text-sm text-zinc-300 sm:grid-cols-2">
              <li className="flex items-center gap-2">
                <Icon name="clock" className="text-zinc-500" />
                <span>
                  Start <b className="text-white">{time(next.start_time)}</b> · inschrijven tot <b className="text-white">{time(next.registration_closes)}</b>
                </span>
              </li>
              <li className="flex items-center gap-2">
                <Icon name="euro" className="text-zinc-500" />
                <span>
                  Inleg <b className="text-white">€{settings.entryFee}</b> · steeldarts · 501 double out
                </span>
              </li>
              <li className="flex items-center gap-2">
                <Icon name="pin" className="text-zinc-500" />
                Brasserie ’t Oud Sanatorium, Sijsele
              </li>
              {preregistered > 0 && (
                <li className="flex items-center gap-2">
                  <Icon name="users" className="text-zinc-500" />
                  {preregistered} spelers schreven zich al in
                </li>
              )}
              {next.notes && (
                <li className="flex items-center gap-2 sm:col-span-2">
                  <Icon name="note" className="text-zinc-500" />
                  {next.notes}
                </li>
              )}
            </ul>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-white/5 px-4 py-2.5 text-sm text-zinc-300 sm:px-5">
            <span>Nieuw? Iedereen is welkom, ook zonder toernooi-ervaring.</span>
            <Link to="/nieuw" className="font-semibold text-white hover:underline">
              Zo werkt het →
            </Link>
          </div>
        </div>
      ) : (
        <Empty>De volgende speelavond is nog niet gepland.</Empty>
      )}

      {lastFinished && podium.length > 0 && (
        <div>
          <SectionTitle
            actions={
              <Link to={`/avond/${lastFinished.id}`} className="text-xs font-semibold text-brand-700 hover:underline">
                Volledige uitslag
              </Link>
            }
          >
            Laatste winnaars · {formatDate(lastFinished.event_date)}
          </SectionTitle>
          <div className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white">
            {podium.slice(0, 3).map((r) => (
              <div key={r.player_id} className="flex items-center gap-3 px-3 py-2">
                <span
                  className={cx(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                    r.place_from === 1 ? 'bg-amber-400 text-amber-950' : r.place_from === 2 ? 'bg-zinc-300 text-zinc-800' : 'bg-orange-300 text-orange-950',
                  )}
                >
                  {r.place_from}
                </span>
                <span className="flex-1 truncate font-semibold text-zinc-950">{directory.name(r.player_id)}</span>
                <span className="text-sm text-zinc-500 tabular-nums">{r.points} ptn</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {season && (
        <div>
          <SectionTitle>Kalender {season.name}</SectionTitle>
          <div className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white">
            {seasonEvents.length === 0 && <p className="p-4 text-sm text-zinc-500">Nog geen speelavonden gepland.</p>}
            {seasonEvents.map((e) => (
              <Link key={e.id} to={`/avond/${e.id}`} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm hover:bg-zinc-50">
                <span className="flex items-center gap-2.5">
                  <Icon name="calendar" className={e.status === 'afgelopen' ? 'text-zinc-300' : 'text-brand-600'} />
                  <span className={e.status === 'afgelopen' ? 'text-zinc-500' : 'font-semibold text-zinc-950'}>{formatLongDate(e.event_date)}</span>
                </span>
                <span className="flex items-center gap-2">
                  {e.status === 'bezig' ? <LiveBadge /> : <Badge tone={e.status === 'afgelopen' ? 'stone' : 'blue'}>{e.status === 'afgelopen' ? 'uitslag' : time(e.start_time)}</Badge>}
                  <Icon name="chevron" className="text-zinc-300" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Eén speelavond: live schema of uitslag
// ---------------------------------------------------------------------------

export function EventPublicPage() {
  const { eventId } = useParams();
  const bundle = useEventBundle(eventId, { live: true });
  const directory = usePlayerDirectory();
  const now = useNow(20_000);
  const view = useMemo(() => (bundle.data ? buildEventView(bundle.data, now) : null), [bundle.data, now]);
  if (bundle.isLoading) return <Spinner />;
  if (!view) return <ErrorBox error={bundle.error ?? 'Speelavond niet gevonden.'} />;
  const { event } = view;
  const name = directory.name;
  const points = new Map((bundle.data?.results ?? []).map((r) => [r.player_id, r.points]));
  const recent = view.matches
    .filter((m) => m.finishedAt !== null && !m.walkover)
    .sort((a, b) => (b.finishedAt as number) - (a.finishedAt as number))
    .slice(0, 8);

  return (
    <div className="space-y-4">
      <PageTitle sub={event.notes ?? undefined}>{formatLongDate(event.event_date)}</PageTitle>
      {event.status === 'gepland' && (
        <Card className="text-sm text-zinc-700">
          Deze speelavond start om {time(event.start_time)}. Inschrijven kan ter plaatse tot {time(event.registration_closes)}. Het schema verschijnt hier zodra het
          toernooi begint.
        </Card>
      )}
      {event.status === 'bezig' && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <LiveBadge />
            {view.live?.forecast.end && <span className="text-zinc-500">verwacht einde rond {formatTime(view.live.forecast.end)}</span>}
          </div>
          <SectionTitle>Nu op de borden</SectionTitle>
          <BoardsOverview view={view} name={name} />
        </>
      )}
      {event.status === 'afgelopen' && view.placements?.complete && (
        <>
          <SectionTitle>Eindstand</SectionTitle>
          <PlacementsTable placements={view.placements.placements} name={name} points={points} />
        </>
      )}
      {event.knockout && (
        <>
          <SectionTitle>A-schema</SectionTitle>
          <Bracket stage="A" matches={view.matches} name={name} />
          <SectionTitle>B-schema</SectionTitle>
          <Bracket stage="B" matches={view.matches} name={name} />
        </>
      )}
      {view.poolStatus && (
        <>
          <SectionTitle>Poules</SectionTitle>
          <div className="grid gap-3 md:grid-cols-2">
            {view.poolStatus.standings.map((s) => (
              <PoolTable key={s.poolId} standing={s} label={view.pools.find((p) => p.id === s.poolId)?.label ?? s.poolId} advance={view.config?.advance ?? 2} name={name} />
            ))}
          </div>
        </>
      )}
      {event.status === 'bezig' && recent.length > 0 && (
        <>
          <SectionTitle>Laatste uitslagen</SectionTitle>
          <div className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white">
            {recent.map((m) => (
              <div key={m.id} className="px-3 py-2">
                <MatchLine m={m} name={name} compact />
              </div>
            ))}
          </div>
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
    <Select className="w-48" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Seizoen">
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
  if (isLoading) return <Spinner />;
  const finished = (events ?? []).filter((e) => e.season_id === season?.id && e.status !== 'gepland').sort((a, b) => b.event_date.localeCompare(a.event_date));
  return (
    <div>
      <PageTitle actions={<SeasonSelect value={season?.id} onChange={setSeasonId} />}>Uitslagen {season?.name}</PageTitle>
      {finished.length === 0 ? (
        <Empty>Nog geen gespeelde avonden in dit seizoen.</Empty>
      ) : (
        <div className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          {finished.map((e) => (
            <Link key={e.id} to={`/avond/${e.id}`} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm hover:bg-zinc-50">
              <span className="flex items-center gap-2.5">
                <Icon name="trophy" className="text-zinc-400" />
                <span className="font-semibold text-zinc-950">{formatLongDate(e.event_date)}</span>
              </span>
              <span className="flex items-center gap-2">
                {e.status === 'bezig' ? <LiveBadge /> : <Badge>uitslag</Badge>}
                <Icon name="chevron" className="text-zinc-300" />
              </span>
            </Link>
          ))}
        </div>
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
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-ink text-xs text-zinc-400">
              <tr>
                <th className="w-11 py-2 text-center font-semibold">#</th>
                <th className="py-2 text-left font-semibold">Speler</th>
                <th className="w-14 text-center font-semibold text-white">Ptn</th>
                <th className="hidden w-16 text-center font-semibold sm:table-cell">Avonden</th>
                <th className="hidden w-16 text-center font-semibold sm:table-cell">Zeges</th>
                <th className="w-14 text-center font-semibold">Beste</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.playerId} className="border-t border-zinc-100 hover:bg-zinc-50">
                  <td className="py-2 text-center">
                    <span
                      className={cx(
                        'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold tabular-nums',
                        r.position === 1 ? 'bg-amber-400 text-amber-950' : r.position === 2 ? 'bg-zinc-300 text-zinc-800' : r.position === 3 ? 'bg-orange-300 text-orange-950' : 'text-zinc-500',
                      )}
                    >
                      {r.position}
                    </span>
                  </td>
                  <td className="py-2">
                    <Link to={`/spelers/${r.playerId}`} className="font-medium text-zinc-950 hover:text-brand-700 hover:underline">
                      {directory.name(r.playerId)}
                    </Link>
                    {settings.bestOf.enabled && r.total !== r.counted && <span className="ml-1.5 text-xs text-zinc-400">({r.total} totaal)</span>}
                  </td>
                  <td className="text-center text-base font-bold text-zinc-950 tabular-nums">{r.counted}</td>
                  <td className="hidden text-center text-zinc-600 tabular-nums sm:table-cell">{r.events}</td>
                  <td className="hidden text-center text-zinc-600 tabular-nums sm:table-cell">{r.wins}</td>
                  <td className="text-center text-zinc-600 tabular-nums">{r.bestPlace}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-zinc-500">
        Bij gelijke punten: aantal overwinningen → beste resultaat → onderling resultaat → gewonnen legs → loting.
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
      <div className="grid overflow-hidden rounded-xl border border-zinc-200 bg-white sm:grid-cols-2">
        {list.map((p) => (
          <Link key={p.id} to={`/spelers/${p.id}`} className="flex items-center gap-2.5 border-b border-zinc-100 px-3 py-2 text-sm hover:bg-zinc-50 sm:odd:border-r">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-bold text-white">
              {initials(p.name)}
            </span>
            <span className="truncate font-medium text-zinc-950">{displayName(p)}</span>
          </Link>
        ))}
      </div>
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
    <div className="bg-white px-2 py-2.5 text-center">
      <div className="text-xl font-bold text-zinc-950 tabular-nums">{value}</div>
      <div className="text-xs text-zinc-500">{label}</div>
    </div>
  );

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ink text-base font-bold text-white">{initials(player.name)}</span>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold tracking-tight text-zinc-950 sm:text-2xl">{player.name}</h1>
          {player.nickname && <p className="text-sm text-zinc-500">“{player.nickname}”</p>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-zinc-200 bg-zinc-200 sm:grid-cols-4">
        {stat('deelnames', results.length)}
        {stat(`ranking ${season?.name ?? ''}`, rank ? `#${rank.position}` : '–')}
        {stat('matchen gewonnen', `${won}/${won + lost}`)}
        {stat('legs', `${legsFor}–${legsAgainst}`)}
        {stat('180’s', n180)}
        {stat('hoogste uitgooi', bestFinish || '–')}
        {stat('overwinningen', results.filter((r) => r.place_from === 1).length)}
        {stat('beste plaats', results.length ? Math.min(...results.map((r) => r.place_from)) : '–')}
      </div>
      <SectionTitle>Resultaten per avond</SectionTitle>
      {results.length === 0 ? (
        <Empty>Nog geen resultaten.</Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-ink text-xs text-zinc-400">
              <tr>
                <th className="py-2 pl-3 text-left font-semibold">Datum</th>
                <th className="text-center font-semibold">Plaats</th>
                <th className="text-center font-semibold">Punten</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.event_id} className="border-t border-zinc-100">
                  <td className="py-2 pl-3">
                    <Link to={`/avond/${r.event_id}`} className="font-medium text-zinc-950 hover:text-brand-700 hover:underline">
                      {formatDate(r.date)}
                    </Link>
                  </td>
                  <td className="text-center">{formatPlace(r.place_from, r.place_to)}</td>
                  <td className="text-center font-semibold">{r.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
