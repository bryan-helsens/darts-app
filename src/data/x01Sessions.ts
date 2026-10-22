/**
 * Lopende 501-matchen op dit toestel. Na elke beurt bewaard in IndexedDB, zodat
 * herladen, een lege batterij of geen wifi niets kost. Afgewerkte legs gaan
 * daarnaast via de outbox naar de server; de lopende leg blijft enkel hier.
 */

import { createStore, del, entries, get, set } from 'idb-keyval';
import type { Leg, Slot } from '../engine';

export interface X01Session {
  /** Toestel-sessie: de server weigert beurten van een tweede toestel. */
  id: string;
  eventId: string;
  code: string;
  player1: string;
  player2: string;
  bestOf: number;
  /** Wie de eerste leg begon (daarna om beurten). */
  first: Slot;
  /** Afgewerkte legs. */
  legs: Leg[];
  /** De leg die nu gespeeld wordt. */
  current: Leg;
  board: number | null;
  updatedAt: number;
}

// Eigen database: idb-keyval maakt per database één store.
const store = typeof indexedDB !== 'undefined' ? createStore('sanapolis-darts-x01', 'sessions') : null;
// Zonder IndexedDB (privévenster): enkel in het geheugen.
const memory = new Map<string, X01Session>();
const key = (eventId: string, code: string) => `${eventId}:${code}`;

export async function loadSession(eventId: string, code: string): Promise<X01Session | null> {
  const k = key(eventId, code);
  try {
    if (store) return (await get<X01Session>(k, store)) ?? memory.get(k) ?? null;
  } catch {
    // val terug op het geheugen
  }
  return memory.get(k) ?? null;
}

export async function saveSession(session: X01Session): Promise<void> {
  const k = key(session.eventId, session.code);
  memory.set(k, session);
  try {
    if (store) await set(k, session, store);
  } catch {
    // enkel in het geheugen
  }
}

export async function deleteSession(eventId: string, code: string): Promise<void> {
  const k = key(eventId, code);
  memory.delete(k);
  try {
    if (store) await del(k, store);
  } catch {
    // niets te wissen
  }
}

/** Lopende matchen van een avond op dit toestel (om verder te gaan). */
export async function listSessions(eventId: string): Promise<X01Session[]> {
  const found = new Map<string, X01Session>();
  for (const [k, s] of memory) if (s.eventId === eventId) found.set(k, s);
  try {
    if (store) for (const [k, s] of await entries<string, X01Session>(store)) if (s.eventId === eventId) found.set(k, s);
  } catch {
    // enkel wat in het geheugen zit
  }
  return [...found.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}
