import { Link } from 'react-router-dom';
import { useAuth } from '../../../data/auth';
import { useProfiles, useRegistrationCounts } from '../../../data/queries';
import { formatLongDate, shortTime } from '../../../lib/time';
import { Badge, Button, Empty, Icon, LiveBadge, PageTitle, SectionTitle, Spinner } from '../../components/ui';
import { useUpcoming } from '../../hooks';
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
        <Link to="/beheer/gebruikers" className="mb-3 block rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 hover:underline">
          {requests} account{requests > 1 ? 's wachten' : ' wacht'} op goedkeuring
        </Link>
      )}
      {focus ? (
        <div className="rounded-xl bg-ink p-4 text-white">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-1">{live ? <LiveBadge>Nu bezig</LiveBadge> : <span className="text-xs font-semibold tracking-wider text-zinc-400 uppercase">Volgende speelavond</span>}</div>
              <div className="text-xl font-bold sm:text-2xl">{formatLongDate(focus.event_date)}</div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-zinc-400">
                <span className="inline-flex items-center gap-1">
                  <Icon name="clock" /> start {shortTime(focus.start_time).replace(':', 'u')} · inschrijven tot {shortTime(focus.registration_closes).replace(':', 'u')}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Icon name="users" /> {Number(count?.preregistered ?? 0)} vooraf · {Number(count?.present ?? 0)} aanwezig
                </span>
              </div>
            </div>
            <Link to={`/beheer/avond/${focus.id}`} className="w-full sm:w-auto">
              <Button size="lg" block>
                {live ? 'Naar de avond' : 'Avond openen'}
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <Empty>
          Geen geplande speelavond. <Link to="/beheer/seizoenen" className="underline">Plan er een in.</Link>
        </Empty>
      )}

      {isAdmin && (
        <div className="mt-3">
          <DemoDataCard />
        </div>
      )}

      <SectionTitle>Recente avonden</SectionTitle>
      <div className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white">
        {events
          .filter((e) => e.status === 'afgelopen')
          .slice(-4)
          .reverse()
          .map((e) => (
            <Link key={e.id} to={`/beheer/avond/${e.id}`} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm hover:bg-zinc-50">
              <span className="font-medium text-zinc-900">{formatLongDate(e.event_date)}</span>
              <span className="flex items-center gap-2">
                <Badge tone="dark">afgelopen</Badge>
                <Icon name="chevron" className="text-zinc-400" />
              </span>
            </Link>
          ))}
      </div>
    </div>
  );
}
