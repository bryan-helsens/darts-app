import { Link } from 'react-router-dom';
import { useAuth } from '../../../data/auth';
import { useProfiles, useRegistrationCounts } from '../../../data/queries';
import { formatLongDate, shortTime } from '../../../lib/time';
import { Badge, cx, DateTile, Empty, Icon, List, LiveBadge, PageTitle, rowClass, rowHover, SectionTitle, Spinner } from '../../components/ui';
import { useUpcoming } from '../../hooks';
import { InstallCard } from '../../pwa/InstallCard';
import { DemoDataCard } from './DemoDataCard';

export function DashboardPage() {
  const { profile, isAdmin } = useAuth();
  const { next, live, events, isLoading } = useUpcoming();
  const { data: counts } = useRegistrationCounts();
  const { data: profiles } = useProfiles(isAdmin);
  const requests = (profiles ?? []).filter((p) => p.role === 'aanvraag').length;
  const focus = live ?? next;
  const count = counts?.find((c) => c.event_id === focus?.id);

  if (isLoading) return <Spinner />;
  return (
    <div>
      <PageTitle sub={`Hallo ${profile?.display_name || profile?.email || ''}`}>Beheer</PageTitle>
      {requests > 0 && (
        <Link to="/beheer/gebruikers" className="mb-3 flex items-center justify-between rounded-md border border-amber-200/80 bg-amber-50 px-2.5 py-2 text-[13px] font-medium text-amber-900">
          {requests} account{requests > 1 ? 's wachten' : ' wacht'} op goedkeuring
          <Icon name="chevron" className="h-3.5 w-3.5" />
        </Link>
      )}
      {focus ? (
        <div className="overflow-hidden rounded-lg bg-ink text-white shadow-xs">
          <div className="flex gap-3 p-3">
            <DateTile date={focus.event_date} tone="dark" />
            <div className="min-w-0 flex-1">
              <div className="mb-0.5">{live ? <LiveBadge>Nu bezig</LiveBadge> : <span className="text-2xs font-semibold tracking-wider text-accent-500 uppercase">Volgende speelavond</span>}</div>
              <div className="truncate text-base leading-tight font-semibold">{formatLongDate(focus.event_date)}</div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-400">
                <span className="inline-flex items-center gap-1">
                  <Icon name="clock" className="h-3.5 w-3.5" /> {shortTime(focus.start_time).replace(':', 'u')} · inschrijven tot {shortTime(focus.registration_closes).replace(':', 'u')}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Icon name="users" className="h-3.5 w-3.5" /> {Number(count?.preregistered ?? 0)} vooraf · {Number(count?.present ?? 0)} aanwezig
                </span>
              </div>
            </div>
          </div>
          <Link to={`/beheer/avond/${focus.id}`} className="flex h-10 items-center justify-center gap-1.5 bg-brand-600 text-sm font-medium hover:bg-brand-700">
            {live ? 'Naar de avond' : 'Avond openen'}
            <Icon name="chevron" className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : (
        <Empty>
          Geen geplande speelavond. <Link to="/beheer/seizoenen" className="underline">Plan er een in.</Link>
        </Empty>
      )}

      <InstallCard className="mt-3" />

      <a
        href="/tv"
        target="_blank"
        rel="noreferrer"
        className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-zinc-200/80 bg-white px-3 py-2.5 shadow-xs hover:bg-zinc-50"
      >
        <span className="min-w-0">
          <span className="block text-[13px] font-semibold text-zinc-950">TV-scherm</span>
          <span className="block truncate text-xs text-zinc-500">Open {window.location.host}/tv in de browser van de tv in de zaal.</span>
        </span>
        <Icon name="external" className="text-zinc-400" />
      </a>

      {isAdmin && (
        <Link
          to="/beheer/logboek"
          className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-zinc-200/80 bg-white px-3 py-2.5 shadow-xs hover:bg-zinc-50"
        >
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold text-zinc-950">Logboek</span>
            <span className="block truncate text-xs text-zinc-500">Wie veranderde wat: uitslagen, correcties, inschrijvingen, spelers.</span>
          </span>
          <Icon name="history" className="text-zinc-400" />
        </Link>
      )}

      {isAdmin && (
        <div className="mt-3">
          <DemoDataCard />
        </div>
      )}

      <SectionTitle>Recente avonden</SectionTitle>
      <List>
        {events
          .filter((e) => e.status === 'afgelopen')
          .slice(-4)
          .reverse()
          .map((e) => (
            <Link key={e.id} to={`/beheer/avond/${e.id}`} className={cx(rowClass, rowHover, 'py-1.5')}>
              <DateTile date={e.event_date} tone="muted" />
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-zinc-900">{formatLongDate(e.event_date)}</span>
              <Badge tone="dark">afgelopen</Badge>
              <Icon name="chevron" className="h-3.5 w-3.5 text-zinc-300" />
            </Link>
          ))}
      </List>
    </div>
  );
}
