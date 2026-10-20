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
import { Badge, Card, Empty, ErrorBox, PageTitle, SectionTitle, Select, Spinner, TextInput } from '../../components/ui';
import { pickCurrentSeason, seasonSettings, useCurrentSeason, useNow, useSeasonRanking, useUpcoming } from '../../hooks';

const time = (t: string) => formatTime(shortTime(t));

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
    <div className="space-y-6">
      {live && (
        <Link to={`/avond/${live.id}`} className="block rounded-2xl bg-red-700 p-4 text-white shadow">
          <div className="text-sm font-semibold tracking-wide uppercase">● Nu live</div>
          <div className="text-xl font-bold">Volg het schema en de uitslagen van vanavond</div>
        </Link>
      )}

      {next ? (
        <Card className="border-brand-700 bg-gradient-to-br from-white to-brand-50">
          <div className="text-sm font-semibold text-brand-800 uppercase">Volgende speelavond</div>
          <div className="mt-1 text-3xl font-bold text-brand-900">{formatLongDate(next.event_date)}</div>
          <ul className="mt-3 space-y-1 text-stone-700">
            <li>
              🎯 Start om <b>{time(next.start_time)}</b>, inschrijven ter plaatse tot <b>{time(next.registration_closes)}</b>
            </li>
            <li>
              💶 Inleg <b>€{settings.entryFee}</b> · steeldarts · 501 double out
            </li>
            <li>📍 Brasserie ’t Oud Sanatorium, Sijsele</li>
            {preregistered > 0 && <li>👥 {preregistered} spelers schreven zich al in</li>}
            {next.notes && <li>📝 {next.notes}</li>}
          </ul>
          <p className="mt-3 text-sm text-stone-600">
            Nieuw? Iedereen is welkom, ook als je nog nooit in een toernooi speelde.{' '}
            <Link to="/nieuw" className="font-semibold text-brand-800 underline">
              Zo werkt het
            </Link>
          </p>
        </Card>
      ) : (
        <Empty>De volgende speelavond is nog niet gepland.</Empty>
      )}

      {lastFinished && podium.length > 0 && (
        <div>
          <SectionTitle>Laatste winnaars ({formatDate(lastFinished.event_date)})</SectionTitle>
          <div className="grid grid-cols-3 gap-2 text-center">
            {podium.slice(0, 3).map((r) => (
              <Card key={r.player_id} className="p-3">
                <div className="text-2xl">{r.place_from === 1 ? '🥇' : r.place_from === 2 ? '🥈' : '🥉'}</div>
                <div className="font-semibold">{directory.name(r.player_id)}</div>
              </Card>
            ))}
          </div>
          <Link to={`/avond/${lastFinished.id}`} className="mt-2 inline-block text-brand-800 underline">
            Volledige uitslag
          </Link>
        </div>
      )}

      {season && (
        <div>
          <SectionTitle>Kalender {season.name}</SectionTitle>
          <div className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
            {seasonEvents.length === 0 && <p className="p-4 text-stone-500">Nog geen speelavonden gepland.</p>}
            {seasonEvents.map((e) => (
              <Link key={e.id} to={`/avond/${e.id}`} className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-stone-50">
                <span className={e.status === 'afgelopen' ? 'text-stone-500' : 'font-semibold'}>{formatLongDate(e.event_date)}</span>
                <Badge tone={e.status === 'bezig' ? 'red' : e.status === 'afgelopen' ? 'stone' : 'green'}>
                  {e.status === 'bezig' ? 'live' : e.status === 'afgelopen' ? 'uitslag' : time(e.start_time)}
                </Badge>
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
        <Card>
          Deze speelavond start om {time(event.start_time)}. Inschrijven kan ter plaatse tot {time(event.registration_closes)}. Het schema verschijnt hier zodra het
          toernooi begint.
        </Card>
      )}
      {event.status === 'bezig' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="red">● live</Badge>
            {view.live?.forecast.end && <span className="text-stone-600">verwacht einde rond {formatTime(view.live.forecast.end)}</span>}
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
          <div className="grid gap-4 md:grid-cols-2">
            {view.poolStatus.standings.map((s) => (
              <PoolTable key={s.poolId} standing={s} label={view.pools.find((p) => p.id === s.poolId)?.label ?? s.poolId} advance={view.config?.advance ?? 2} name={name} />
            ))}
          </div>
        </>
      )}
      {event.status === 'bezig' && recent.length > 0 && (
        <>
          <SectionTitle>Laatste uitslagen</SectionTitle>
          <Card className="space-y-2">
            {recent.map((m) => (
              <MatchLine key={m.id} m={m} name={name} compact />
            ))}
          </Card>
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
        <div className="space-y-2">
          {finished.map((e) => (
            <Link key={e.id} to={`/avond/${e.id}`} className="block">
              <Card className="flex items-center justify-between hover:border-brand-700">
                <span className="font-semibold">{formatLongDate(e.event_date)}</span>
                <Badge tone={e.status === 'bezig' ? 'red' : 'stone'}>{e.status === 'bezig' ? 'live' : 'uitslag'}</Badge>
              </Card>
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
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
          <table className="w-full">
            <thead className="bg-stone-50 text-sm text-stone-500">
              <tr>
                <th className="w-12 py-2 text-center">#</th>
                <th className="py-2 text-left">Speler</th>
                <th className="w-16 text-center">Ptn</th>
                <th className="hidden w-16 text-center sm:table-cell">Avonden</th>
                <th className="hidden w-16 text-center sm:table-cell">Zeges</th>
                <th className="w-16 text-center">Beste</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.playerId} className="border-t border-stone-100">
                  <td className="py-2 text-center font-bold">{r.position}</td>
                  <td className="py-2">
                    <Link to={`/spelers/${r.playerId}`} className="hover:underline">
                      {directory.name(r.playerId)}
                    </Link>
                    {settings.bestOf.enabled && r.total !== r.counted && <span className="ml-2 text-xs text-stone-400">({r.total} totaal)</span>}
                  </td>
                  <td className="text-center text-lg font-bold tabular-nums">{r.counted}</td>
                  <td className="hidden text-center tabular-nums sm:table-cell">{r.events}</td>
                  <td className="hidden text-center tabular-nums sm:table-cell">{r.wins}</td>
                  <td className="text-center tabular-nums">{r.bestPlace}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-sm text-stone-500">
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
      <TextInput placeholder="Zoek een speler…" value={query} onChange={(e) => setQuery(e.target.value)} className="mb-4" />
      <div className="grid gap-2 sm:grid-cols-2">
        {list.map((p) => (
          <Link key={p.id} to={`/spelers/${p.id}`}>
            <Card className="hover:border-brand-700">{displayName(p)}</Card>
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
    <Card className="p-3 text-center">
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-sm text-stone-500">{label}</div>
    </Card>
  );

  return (
    <div>
      <PageTitle sub={player.nickname ? `“${player.nickname}”` : undefined}>{player.name}</PageTitle>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
          <table className="w-full">
            <thead className="bg-stone-50 text-sm text-stone-500">
              <tr>
                <th className="py-2 text-left pl-3">Datum</th>
                <th className="text-center">Plaats</th>
                <th className="text-center">Punten</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.event_id} className="border-t border-stone-100">
                  <td className="py-2 pl-3">
                    <Link to={`/avond/${r.event_id}`} className="hover:underline">
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
