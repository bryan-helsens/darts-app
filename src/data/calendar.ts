/**
 * Speelavonden als agenda-items (zelfde in de browser en in de Netlify-functie
 * netlify/functions/kalender.mts). Bewust zonder de Supabase-client: de functie
 * haalt de rijen zelf op.
 */

import { withDefaults, type SeasonSettings } from '../engine/settings';
import type { CalendarEvent } from '../lib/ics';
import { formatTime } from '../lib/time';
import type { EventRow, SeasonRow } from './rows';

export const CALENDAR_NAME = 'Sanapolis Darts';
export const CALENDAR_LOCATION = 'Brasserie ’t Oud Sanatorium, Sijsele';

type CalendarEventRow = Pick<EventRow, 'id' | 'season_id' | 'event_date' | 'start_time' | 'registration_closes' | 'notes'>;
type CalendarSeasonRow = Pick<SeasonRow, 'id' | 'settings'>;

/** `site`: bv. "https://sanapolis-darts.netlify.app" (zonder slash op het einde). */
export function toCalendarEvents(events: readonly CalendarEventRow[], seasons: readonly CalendarSeasonRow[], site: string): CalendarEvent[] {
  const settings = new Map(seasons.map((s) => [s.id, withDefaults(s.settings as Partial<SeasonSettings>)]));
  return [...events]
    .sort((a, b) => a.event_date.localeCompare(b.event_date))
    .map((e) => {
      const season = settings.get(e.season_id) ?? withDefaults(null);
      const url = `${site}/avond/${e.id}`;
      const description = [
        `Dartstoernooi, 501 double out. Start ${formatTime(e.start_time)}, inschrijven tot ${formatTime(e.registration_closes)} (online of ter plaatse). Inleg €${season.entryFee}.`,
        e.notes ?? '',
        url,
      ]
        .filter(Boolean)
        .join('\n');
      return { id: e.id, date: e.event_date, start: e.start_time, end: season.endLimit, title: CALENDAR_NAME, description, url };
    });
}
