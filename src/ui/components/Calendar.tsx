import { useState } from 'react';
import { CALENDAR_LOCATION, CALENDAR_NAME, toCalendarEvents } from '../../data/calendar';
import { useSeasons } from '../../data/queries';
import type { EventRow } from '../../data/rows';
import { buildCalendar } from '../../lib/ics';
import { downloadFile } from '../export/download';
import { Button, cx, Icon } from './ui';

/** Knop "In mijn agenda": één speelavond als .ics-bestand. */
export function AddToCalendarButton({ event, className, dark }: { event: EventRow; className?: string; dark?: boolean }) {
  const { data: seasons } = useSeasons();
  const download = () => {
    const ics = buildCalendar(toCalendarEvents([event], seasons ?? [], window.location.origin), {
      name: CALENDAR_NAME,
      location: CALENDAR_LOCATION,
      now: Date.now(),
    });
    downloadFile(`sanapolis-darts-${event.event_date}.ics`, ics, 'text/calendar;charset=utf-8');
  };
  return (
    <button
      type="button"
      onClick={download}
      aria-label="In mijn agenda"
      className={cx(
        'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium',
        dark ? 'text-zinc-300 ring-1 ring-white/20 hover:bg-white/10 hover:text-white' : 'bg-white text-zinc-800 ring-1 ring-zinc-200 hover:bg-zinc-50',
        className,
      )}
    >
      <Icon name="calendar" className="h-3.5 w-3.5" />
      <span className={dark ? 'hidden sm:inline' : undefined}>In mijn agenda</span>
      {dark && <span className="sm:hidden">Agenda</span>}
    </button>
  );
}

/** Abonneren op alle speelavonden: de agenda haalt wijzigingen zelf op. */
export function CalendarSubscribe() {
  const [copied, setCopied] = useState(false);
  const host = window.location.host;
  const https = `${window.location.origin}/kalender.ics`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(https);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt('Kopieer deze link:', https);
    }
  };
  return (
    <div className="space-y-2 text-[13px] leading-relaxed text-zinc-700">
      <h2 className="text-sm font-semibold text-zinc-950">Alle speelavonden in je agenda</h2>
      <p>Abonneer je op de kalender: nieuwe of verplaatste avonden verschijnen dan vanzelf in je agenda.</p>
      <div className="flex flex-wrap gap-2">
        <a href={`webcal://${host}/kalender.ics`}>
          <Button size="sm">
            <Icon name="calendar" className="h-3.5 w-3.5" />
            Abonneren
          </Button>
        </a>
        <Button size="sm" variant="secondary" onClick={() => void copy()}>
          {copied ? 'Gekopieerd ✓' : 'Link kopiëren'}
        </Button>
      </div>
      <ul className="list-disc space-y-0.5 pl-5 text-xs text-zinc-600">
        <li>
          <b>iPhone of Mac:</b> tik op Abonneren en bevestig.
        </li>
        <li>
          <b>Google Agenda:</b> kopieer de link, open Google Agenda op een computer, kies “Andere agenda's → Via URL” en plak de link.
        </li>
        <li>
          <b>Outlook:</b> “Agenda toevoegen → Abonneren vanaf internet” en plak de link.
        </li>
      </ul>
    </div>
  );
}
