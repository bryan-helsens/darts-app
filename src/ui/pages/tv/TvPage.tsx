import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { buildEventView } from '../../../data/eventView';
import { useEventBundle, usePlayerDirectory, useRegistrationCounts } from '../../../data/queries';
import { onlineRegistrationOpen, registrationClosesAt } from '../../../data/registration';
import { formatDate, formatLongDate, formatTime, shortTime } from '../../../lib/time';
import { cx, DateTile, LiveBadge } from '../../components/ui';
import { seasonSettings, useCurrentSeason, useNow, useSeasonRanking, useUpcoming } from '../../hooks';
import { TvBoards, TvBracket, TvHighlights, TvPodium, TvPools, TvRanking } from './TvSlides';

/** Hoe lang elk scherm blijft staan. */
const SLIDE_MS = 15_000;

interface Slide {
  id: string;
  title: string;
  body: ReactNode;
}

/**
 * TV-modus voor het scherm in de brasserie: schermvullend, donker en
 * automatisch roterend. Tijdens een avond: borden, schema, highlights en
 * ranking; anders de volgende speelavond, de ranking en de laatste winnaars.
 * Met ?toon=borden (of schema, highlights, ranking, volgende, winnaars) blijft
 * één scherm staan.
 */
export function TvPage() {
  const [params] = useSearchParams();
  const pinned = params.get('toon');
  const qc = useQueryClient();
  const now = useNow(15_000);
  const clock = useNow(1_000);
  const { live, next, events } = useUpcoming();
  const { season } = useCurrentSeason();
  const settings = seasonSettings(season);
  const { rows: ranking } = useSeasonRanking(season);
  const directory = usePlayerDirectory();
  const { data: counts } = useRegistrationCounts();
  const lastFinished = [...events].filter((e) => e.status === 'afgelopen').sort((a, b) => b.event_date.localeCompare(a.event_date))[0];
  const liveBundle = useEventBundle(live?.id, { live: true });
  const lastBundle = useEventBundle(live ? undefined : lastFinished?.id);
  const view = useMemo(() => (liveBundle.data ? buildEventView(liveBundle.data, now) : null), [liveBundle.data, now]);
  const name = directory.name;

  useTvScale();
  useWakeLock();

  // Kalender, ranking en spelers af en toe verversen: het scherm blijft uren open.
  useEffect(() => {
    const id = window.setInterval(() => {
      void qc.invalidateQueries({ queryKey: ['events'] });
      void qc.invalidateQueries({ queryKey: ['season-data'] });
      void qc.invalidateQueries({ queryKey: ['players'] });
      void qc.invalidateQueries({ queryKey: ['registration-counts'] });
    }, 5 * 60_000);
    return () => window.clearInterval(id);
  }, [qc]);

  const slides: Slide[] = [];
  if (live && view) {
    slides.push({ id: 'borden', title: 'Nu op de borden', body: <TvBoards view={view} name={name} /> });
    if (view.event.knockout) {
      const liveIds = new Set((view.replay?.boards ?? []).map((b) => b.matchId).filter((x): x is string => Boolean(x)));
      for (const stage of ['A', 'B'] as const) {
        if (view.matches.some((m) => m.stage === stage)) {
          slides.push({ id: 'schema', title: `${stage}-schema`, body: <TvBracket stage={stage} matches={view.matches} name={name} live={liveIds} /> });
        }
      }
    } else if (view.poolStatus) {
      slides.push({ id: 'schema', title: 'Poules', body: <TvPools standings={view.poolStatus.standings} view={view} name={name} /> });
    }
    slides.push({ id: 'highlights', title: 'Highlights van vanavond', body: <TvHighlights view={view} stats={liveBundle.data?.stats ?? []} name={name} /> });
  } else if (next) {
    const preregistered = Number(counts?.find((c) => c.event_id === next.id)?.preregistered ?? 0);
    const host = window.location.host;
    slides.push({
      id: 'volgende',
      title: 'Volgende speelavond',
      body: (
        <div className="flex h-full flex-col items-center justify-center text-center">
          <div className="scale-[2.2]">
            <DateTile date={next.event_date} tone="dark" />
          </div>
          <div className="mt-12 text-6xl font-semibold tracking-tight">{formatLongDate(next.event_date)}</div>
          <div className="mt-5 text-3xl text-zinc-300">
            Start {formatTime(shortTime(next.start_time))} · inschrijven tot {formatTime(registrationClosesAt(next))} · inleg €{settings.entryFee}
          </div>
          {preregistered > 0 && <div className="mt-3 text-2xl text-zinc-400">{preregistered} spelers schreven zich al in</div>}
          {onlineRegistrationOpen(next, now) && (
            <div className="mt-10 rounded-2xl bg-brand-600 px-8 py-4 text-3xl font-semibold">
              Schrijf je in op <span className="underline decoration-white/40 underline-offset-4">{host}</span>
            </div>
          )}
        </div>
      ),
    });
  }
  if (ranking.length > 0) slides.push({ id: 'ranking', title: `Ranking ${season?.name ?? ''}`.trim(), body: <TvRanking rows={ranking} name={name} /> });
  if (!live && lastFinished && (lastBundle.data?.results.length ?? 0) > 0) {
    slides.push({
      id: 'winnaars',
      title: `Uitslag ${formatDate(lastFinished.event_date)}`,
      body: <TvPodium results={lastBundle.data?.results ?? []} name={name} />,
    });
  }

  const visible = pinned ? slides.filter((s) => s.id === pinned) : slides;
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (visible.length <= 1) return;
    const id = window.setInterval(() => setIndex((i) => i + 1), SLIDE_MS);
    return () => window.clearInterval(id);
  }, [visible.length]);
  const slide = visible.length > 0 ? visible[index % visible.length] : null;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-ink px-[2.5rem] py-[1.75rem] text-white">
      <header className="mb-6 flex items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <img src="/favicon.svg" alt="" className="h-12 w-12" />
          <span className="text-3xl font-semibold tracking-tight">
            Sanapolis <span className="text-accent-500">Darts</span>
          </span>
          {live && (
            <span className="ml-2 scale-150">
              <LiveBadge />
            </span>
          )}
        </div>
        <h1 className="truncate text-3xl font-semibold text-zinc-200">{slide?.title}</h1>
        <div className="flex items-center gap-5">
          {view?.live?.forecast.end && <span className="text-xl text-zinc-400">einde ±{formatTime(view.live.forecast.end)}</span>}
          <span className="text-4xl font-semibold tabular-nums">{formatTime(clock)}</span>
        </div>
      </header>

      <main className="min-h-0 flex-1">{slide ? slide.body : <div className="flex h-full items-center justify-center text-3xl text-zinc-500">Even geduld…</div>}</main>

      <footer className="mt-5 flex items-center justify-between">
        <div className="flex gap-2">
          {visible.map((s, i) => (
            <span key={`${s.id}-${i}`} className={cx('h-2 rounded-full transition-all', i === index % visible.length ? 'w-10 bg-accent-500' : 'w-2 bg-white/20')} />
          ))}
        </div>
        <FullscreenButton />
      </footer>
    </div>
  );
}

/** Schaal de rem mee met de schermbreedte, zodat alles op elke tv even groot oogt. */
function useTvScale() {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.fontSize;
    root.style.fontSize = 'clamp(12px, 1.05vw, 44px)';
    return () => {
      root.style.fontSize = previous;
    };
  }, []);
}

/** Houd het scherm wakker (als de browser dat ondersteunt). */
function useWakeLock() {
  useEffect(() => {
    type Sentinel = { release: () => Promise<void> };
    const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<Sentinel> } };
    if (!nav.wakeLock) return;
    let sentinel: Sentinel | null = null;
    const request = () => {
      nav.wakeLock
        ?.request('screen')
        .then((s) => {
          sentinel = s;
        })
        .catch(() => {
          // geweigerd (bv. batterijbesparing): dan maar zonder
        });
    };
    const onVisible = () => document.visibilityState === 'visible' && request();
    request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release();
    };
  }, []);
}

function FullscreenButton() {
  const [full, setFull] = useState(() => Boolean(document.fullscreenElement));
  useEffect(() => {
    const onChange = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  if (full || !document.fullscreenEnabled) return <span />;
  return (
    <button
      type="button"
      className="rounded-lg bg-white/10 px-4 py-2 text-base text-zinc-300 hover:bg-white/20"
      onClick={() => void document.documentElement.requestFullscreen().catch(() => undefined)}
    >
      Volledig scherm
    </button>
  );
}
