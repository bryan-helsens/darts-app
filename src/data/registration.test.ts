import { describe, expect, it } from 'vitest';
import { onlineRegistrationOpen, registrationClosesAt } from './registration';

const event = { status: 'gepland' as const, event_date: '2026-11-21', registration_closes: '18:30:00' };

describe('online inschrijven', () => {
  it('sluit om het sluitingsuur in Belgische tijd', () => {
    expect(new Date(registrationClosesAt(event)).toISOString()).toBe('2026-11-21T17:30:00.000Z');
  });

  it('is open tot het sluitingsuur en enkel voor geplande avonden', () => {
    expect(onlineRegistrationOpen(event, Date.parse('2026-11-21T17:29:00Z'))).toBe(true);
    expect(onlineRegistrationOpen(event, Date.parse('2026-11-21T17:30:00Z'))).toBe(false);
    expect(onlineRegistrationOpen({ ...event, status: 'bezig' }, Date.parse('2026-11-01T12:00:00Z'))).toBe(false);
    // De Masters: enkel de top van de ranking, geen online inschrijving.
    expect(onlineRegistrationOpen({ ...event, kind: 'masters' }, Date.parse('2026-11-21T12:00:00Z'))).toBe(false);
  });
});
