import { Link } from 'react-router-dom';
import { useAuth } from '../../../data/auth';
import { useProfiles, useRegistrationCounts } from '../../../data/queries';
import { formatLongDate, shortTime } from '../../../lib/time';
import { Badge, Button, Card, Empty, PageTitle, SectionTitle, Spinner } from '../../components/ui';
import { useUpcoming } from '../../hooks';

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
        <Link to="/beheer/gebruikers" className="mb-4 block rounded-xl bg-amber-50 p-3 text-amber-900 underline">
          {requests} account{requests > 1 ? 's wachten' : ' wacht'} op goedkeuring
        </Link>
      )}
      {focus ? (
        <Card className="border-brand-700">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-brand-800 uppercase">{live ? 'Nu bezig' : 'Volgende speelavond'}</div>
              <div className="text-2xl font-bold">{formatLongDate(focus.event_date)}</div>
              <div className="text-stone-600">
                Start {shortTime(focus.start_time).replace(':', 'u')} · inschrijven tot {shortTime(focus.registration_closes).replace(':', 'u')} ·{' '}
                {Number(count?.preregistered ?? 0)} vooraf ingeschreven · {Number(count?.present ?? 0)} aanwezig
              </div>
            </div>
            <Link to={`/beheer/avond/${focus.id}`}>
              <Button size="xl">{live ? 'Naar de avond' : 'Avond openen'}</Button>
            </Link>
          </div>
        </Card>
      ) : (
        <Empty>
          Geen geplande speelavond. <Link to="/beheer/seizoenen" className="underline">Plan er een in.</Link>
        </Empty>
      )}

      <SectionTitle>Recente avonden</SectionTitle>
      <div className="space-y-2">
        {events
          .filter((e) => e.status === 'afgelopen')
          .slice(-4)
          .reverse()
          .map((e) => (
            <Link key={e.id} to={`/beheer/avond/${e.id}`} className="block">
              <Card className="flex items-center justify-between hover:border-brand-700">
                <span>{formatLongDate(e.event_date)}</span>
                <Badge tone="green">afgelopen</Badge>
              </Card>
            </Link>
          ))}
      </div>
    </div>
  );
}
