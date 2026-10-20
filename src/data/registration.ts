/** Wanneer kan men zich nog online inschrijven voor een speelavond? */

import { brusselsToUtc, shortTime } from '../lib/time';
import type { EventRow } from './rows';

/** Sluitingsuur van de inschrijving (ms, UTC), op de dag van de avond zelf. */
export function registrationClosesAt(event: Pick<EventRow, 'event_date' | 'registration_closes'>): number {
  return brusselsToUtc(event.event_date, shortTime(event.registration_closes));
}

/** Online inschrijven kan zolang de avond gepland is en het sluitingsuur niet voorbij is. */
export function onlineRegistrationOpen(event: Pick<EventRow, 'status' | 'event_date' | 'registration_closes'>, now: number): boolean {
  return event.status === 'gepland' && now < registrationClosesAt(event);
}
