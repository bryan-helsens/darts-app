import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AUDIT_TABLES, describeAudit, type AuditCategory, type AuditEntry } from '../../../data/audit';
import { useAuth } from '../../../data/auth';
import { useAuditLog, useEvents, usePlayerDirectory, useProfiles } from '../../../data/queries';
import { matchesSearch } from '../../../lib/names';
import { formatDate, formatLongDate, formatTime, isoDateInBrussels } from '../../../lib/time';
import { Badge, Button, Empty, ErrorBox, InfoBox, List, PageTitle, rowClass, SearchInput, Spinner, Tabs, type Tone } from '../../components/ui';

type Filter = 'alles' | Exclude<AuditCategory, 'overig'>;

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'alles', label: 'Alles' },
  { id: 'uitslagen', label: 'Uitslagen' },
  { id: 'inschrijvingen', label: 'Inschrijvingen' },
  { id: 'spelers', label: 'Spelers' },
  { id: 'seizoenen', label: 'Seizoenen' },
  { id: 'avonden', label: 'Avonden' },
];

const CATEGORY: Record<AuditCategory, { label: string; tone: Tone }> = {
  uitslagen: { label: 'uitslag', tone: 'blue' },
  inschrijvingen: { label: 'inschrijving', tone: 'stone' },
  spelers: { label: 'speler', tone: 'stone' },
  seizoenen: { label: 'seizoen', tone: 'dark' },
  avonden: { label: 'avond', tone: 'dark' },
  overig: { label: 'beheer', tone: 'amber' },
};

/** Logboek (admin): wie veranderde wat en wanneer, in gewone zinnen. */
export function AuditPage() {
  const { isAdmin } = useAuth();
  const [filter, setFilter] = useState<Filter>('alles');
  const [query, setQuery] = useState('');
  const directory = usePlayerDirectory();
  const { data: profiles } = useProfiles(isAdmin);
  const { data: events } = useEvents();
  const log = useAuditLog(filter, filter === 'alles' ? undefined : AUDIT_TABLES[filter], isAdmin);

  const eventDate = useMemo(() => new Map((events ?? []).map((e) => [e.id, e.event_date])), [events]);
  const entries = useMemo(() => {
    const profileName = new Map((profiles ?? []).map((p) => [p.user_id, p.display_name || p.email || 'gebruiker']));
    const ctx = {
      player: (id: string) => directory.byId.get(id)?.name,
      profile: (id: string) => profileName.get(id),
      eventDate: (id: string) => eventDate.get(id),
    };
    return (log.data?.pages ?? []).flat().map((row) => describeAudit(row, ctx));
  }, [log.data, directory.byId, profiles, eventDate]);

  const days = useMemo(() => {
    const out: Array<{ day: string; entries: AuditEntry[] }> = [];
    for (const e of entries) {
      const date = e.eventId ? eventDate.get(e.eventId) : undefined;
      if (!matchesSearch([e.text, ...e.details, e.who, date ? formatDate(date) : ''].join(' '), query)) continue;
      const day = isoDateInBrussels(e.at);
      if (out.at(-1)?.day !== day) out.push({ day, entries: [] });
      out.at(-1)?.entries.push(e);
    }
    return out;
  }, [entries, query, eventDate]);

  if (!isAdmin) return <InfoBox tone="amber">Het logboek is enkel voor beheerders.</InfoBox>;

  return (
    <div>
      <PageTitle sub="Elke wijziging aan uitslagen, inschrijvingen, spelers, seizoenen en avonden: wie, wat en wanneer.">Logboek</PageTitle>
      <Tabs value={filter} onChange={setFilter} tabs={FILTERS} />
      <SearchInput className="mb-3" placeholder="Zoek op speler, match of naam…" value={query} onChange={(e) => setQuery(e.target.value)} />

      {log.isLoading ? (
        <Spinner />
      ) : log.error ? (
        <ErrorBox error={log.error} />
      ) : days.length === 0 ? (
        <Empty>{query ? 'Niets gevonden in de geladen wijzigingen.' : 'Nog geen wijzigingen.'}</Empty>
      ) : (
        <div className="space-y-3">
          {days.map(({ day, entries: list }) => (
            <section key={day}>
              <h2 className="mb-1.5 text-2xs font-semibold tracking-wider text-zinc-500 uppercase">{formatLongDate(day)}</h2>
              <List>
                {list.map((e) => (
                  <AuditLine key={e.id} entry={e} date={e.eventId ? eventDate.get(e.eventId) : undefined} showCategory={filter === 'alles'} />
                ))}
              </List>
            </section>
          ))}
        </div>
      )}

      {log.hasNextPage && (
        <div className="mt-3 text-center">
          <Button variant="secondary" onClick={() => void log.fetchNextPage()} disabled={log.isFetchingNextPage}>
            {log.isFetchingNextPage ? 'Laden…' : 'Meer laden'}
          </Button>
        </div>
      )}
      {query && log.hasNextPage && <p className="mt-2 text-center text-2xs text-zinc-500">Het zoeken gebeurt in de geladen wijzigingen. Laad er meer om verder terug te zoeken.</p>}
    </div>
  );
}

function AuditLine({ entry: e, date, showCategory }: { entry: AuditEntry; date?: string; showCategory: boolean }) {
  return (
    <div className={`${rowClass} items-start`} data-audit-row>
      <span className="w-10 shrink-0 pt-px text-xs text-zinc-500 tabular-nums">{formatTime(e.at)}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-zinc-950">{e.text}</div>
        {e.details.map((d) => (
          <div key={d} className="text-xs text-zinc-600">
            {d}
          </div>
        ))}
        <div className="mt-0.5 text-2xs text-zinc-500">
          {e.who}
          {e.eventId && date && (
            <>
              {' · '}
              <Link to={`/beheer/avond/${e.eventId}`} className="underline decoration-zinc-300 hover:text-zinc-800">
                avond {formatDate(date)}
              </Link>
            </>
          )}
        </div>
      </div>
      {showCategory && <Badge tone={CATEGORY[e.category].tone}>{CATEGORY[e.category].label}</Badge>}
    </div>
  );
}
