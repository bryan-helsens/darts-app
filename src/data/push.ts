/**
 * Pushmeldingen: wat er nu te melden is, afgeleid uit de avond met dezelfde
 * planning als op elk scherm (`buildEventView`). Puur; de Netlify-functie
 * "meldingen" verstuurt (zie pushJob.ts). Elke melding heeft een vaste
 * sleutel, zodat ze maar één keer vertrekt.
 */

import { upcomingByBoard, type Match } from '../engine';
import { brusselsToUtc, formatTime, shortTime, todayInBrussels } from '../lib/time';
import { shortTitle } from './titles';
import type { EventView } from './eventView';
import type { EventRow } from './rows';

export type PushKind = 'start' | 'next' | 'scorer' | 'reminder';
export const PUSH_KINDS: readonly PushKind[] = ['start', 'next', 'scorer', 'reminder'];

export interface PushMessage {
  /** Uniek per avond en ontvanger(s). */
  key: string;
  kind: PushKind;
  /** Voor wie; null = iedereen met deze soort melding (herinnering). */
  playerId: string | null;
  title: string;
  body: string;
  /** Pad in de app, bv. "/avond/…". */
  url: string;
  /** Een nieuwere melding met dezelfde tag vervangt de oude op de gsm. */
  tag: string;
}

/** Hoe lang een match "net begonnen" is: oudere starts worden niet meer gemeld (bv. na een storing). */
export const START_WINDOW_MS = 10 * 60_000;
/** Vanaf wanneer de herinnering vertrekt op de dag zelf (Belgische tijd). */
export const REMINDER_AT = '12:00';

type NameFn = (id: string | null | undefined) => string;

const opponentOf = (m: Match, player: string) => (m.player1 === player ? m.player2 : m.player1);

/** Meldingen voor een lopende avond: wie nu begint, wie straks speelt en wie schrijft. */
export function eventMessages(view: EventView, name: NameFn): PushMessage[] {
  const replay = view.replay;
  if (!replay || view.event.status !== 'bezig') return [];
  const eventId = view.event.id;
  const out: PushMessage[] = [];
  const playingNow = new Set(replay.boards.map((b) => b.matchId).filter(Boolean));

  for (const b of replay.boards) {
    const m = b.matchId ? view.byCode.get(b.matchId) : undefined;
    if (!m || !m.player1 || !m.player2 || m.winner) continue;
    const fresh = b.since === null || view.now - b.since <= START_WINDOW_MS;
    if (!fresh) continue;
    const title = shortTitle(m, view);
    for (const p of [m.player1, m.player2]) {
      out.push({
        key: `start:${m.id}:${b.board}:${p}`,
        kind: 'start',
        playerId: p,
        title: `Bord ${b.board}: jouw match begint`,
        body: `Tegen ${name(opponentOf(m, p))} · ${title} · best of ${m.bestOf}`,
        url: `/avond/${eventId}`,
        tag: `match-${eventId}-${m.id}`,
      });
    }
    const scorer = view.scorers.get(b.board);
    if (scorer) {
      out.push({
        key: `scorer:${m.id}:${b.board}:${scorer}`,
        kind: 'scorer',
        playerId: scorer,
        title: `Bord ${b.board}: jij schrijft`,
        body: `${name(m.player1)} – ${name(m.player2)} · ${title}`,
        url: `/score/${eventId}`,
        tag: `scorer-${eventId}`,
      });
    }
  }

  // Straks: de volgende match op een bezet bord (na de lopende match).
  if (view.live) {
    for (const [board, a] of upcomingByBoard(view.live.forecast, view.now)) {
      const busy = replay.boards.find((b) => b.board === board)?.matchId;
      const m = view.byCode.get(a.matchId);
      if (!busy || !m || !m.player1 || !m.player2 || m.winner || playingNow.has(m.id)) continue;
      for (const p of [m.player1, m.player2]) {
        out.push({
          key: `next:${m.id}:${board}:${p}`,
          kind: 'next',
          playerId: p,
          title: `Straks op bord ${board}`,
          body: `Jij tegen ${name(opponentOf(m, p))}, na de lopende match. Rond ${formatTime(a.start)}.`,
          url: `/avond/${eventId}`,
          tag: `match-${eventId}-${m.id}`,
        });
      }
    }
  }
  return out;
}

/** Herinnering op de dag van een gewone speelavond, vanaf REMINDER_AT tot het sluitingsuur. */
export function reminderMessage(event: EventRow, now: number): PushMessage | null {
  if (event.status !== 'gepland' || event.kind === 'masters') return null;
  if (event.event_date !== todayInBrussels(now)) return null;
  const closes = brusselsToUtc(event.event_date, shortTime(event.registration_closes));
  if (now < brusselsToUtc(event.event_date, REMINDER_AT) || now >= closes) return null;
  return {
    key: `reminder:${event.id}`,
    kind: 'reminder',
    playerId: null,
    title: 'Vanavond darts',
    body: `Start om ${formatTime(shortTime(event.start_time))} in Brasserie ’t Oud Sanatorium. Inschrijven kan tot ${formatTime(closes)}.`,
    url: `/inschrijven/${event.id}`,
    tag: `reminder-${event.id}`,
  };
}
