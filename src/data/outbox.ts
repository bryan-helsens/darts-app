/**
 * Offline-buffer ("outbox"). Score-invoer en check-in gaan eerst hierheen en
 * worden bewaard in IndexedDB. Zodra er verbinding is, worden ze één voor één
 * naar de server gestuurd. Zo gaat er niets verloren als de wifi wegvalt.
 */

import { createStore, get, set } from 'idb-keyval';
import { useSyncExternalStore } from 'react';
import { isNetworkError, submitScore, upsertRegistration, type ScoreSubmission } from './api';

interface BaseItem {
  id: string;
  createdAt: number;
  attempts: number;
  status: 'pending' | 'failed';
  message?: string;
  /** Korte omschrijving voor de gebruiker, bv. "Jan – Piet 2–1". */
  label: string;
}

export interface ScoreItem extends BaseItem {
  kind: 'score';
  data: ScoreSubmission;
}

export interface RegistrationItem extends BaseItem {
  kind: 'registration';
  data: { eventId: string; playerId: string; patch: { present?: boolean; paid?: boolean; preregistered?: boolean } };
}

export type OutboxItem = ScoreItem | RegistrationItem;

const store = typeof indexedDB !== 'undefined' ? createStore('sanapolis-darts', 'outbox') : null;
const KEY = 'items';

type Listener = () => void;

class Outbox {
  private items: OutboxItem[] = [];
  private listeners = new Set<Listener>();
  private syncedListeners = new Set<(item: OutboxItem) => void>();
  private flushing = false;
  private ready: Promise<void>;
  online = typeof navigator === 'undefined' ? true : navigator.onLine;

  constructor() {
    this.ready = (async () => {
      try {
        this.items = (store ? ((await get<OutboxItem[]>(KEY, store)) ?? []) : []).map((i) => ({ ...i }));
      } catch {
        this.items = [];
      }
      this.emit();
    })();
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.online = true;
        this.emit();
        void this.flush();
      });
      window.addEventListener('offline', () => {
        this.online = false;
        this.emit();
      });
      setInterval(() => {
        if (this.items.some((i) => i.status === 'pending')) void this.flush();
      }, 10_000);
    }
  }

  subscribe = (fn: Listener) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  /** Wordt opgeroepen na elke geslaagde synchronisatie (om gegevens te verversen). */
  onSynced(fn: (item: OutboxItem) => void): () => void {
    this.syncedListeners.add(fn);
    return () => {
      this.syncedListeners.delete(fn);
    };
  }

  getSnapshot = () => this.items;

  private emit() {
    this.items = [...this.items];
    for (const fn of this.listeners) fn();
  }

  private async persist() {
    try {
      if (store) await set(KEY, this.items, store);
    } catch {
      // Opslag niet beschikbaar (privévenster): enkel in het geheugen.
    }
  }

  async addScore(data: ScoreSubmission, label: string) {
    await this.ready;
    this.items.push({ id: data.clientId, kind: 'score', createdAt: Date.now(), attempts: 0, status: 'pending', label, data });
    this.emit();
    await this.persist();
    void this.flush();
  }

  async addRegistration(data: RegistrationItem['data'], label: string) {
    await this.ready;
    const existing = this.items.find(
      (i): i is RegistrationItem =>
        i.kind === 'registration' && i.status === 'pending' && i.data.eventId === data.eventId && i.data.playerId === data.playerId,
    );
    if (existing && !this.flushing) {
      existing.data = { ...existing.data, patch: { ...existing.data.patch, ...data.patch } };
      existing.label = label;
    } else {
      this.items.push({ id: crypto.randomUUID(), kind: 'registration', createdAt: Date.now(), attempts: 0, status: 'pending', label, data });
    }
    this.emit();
    await this.persist();
    void this.flush();
  }

  async dismiss(id: string) {
    this.items = this.items.filter((i) => i.id !== id);
    this.emit();
    await this.persist();
  }

  async retry(id: string) {
    const item = this.items.find((i) => i.id === id);
    if (item) {
      item.status = 'pending';
      item.message = undefined;
      this.emit();
      await this.persist();
      void this.flush();
    }
  }

  async flush() {
    await this.ready;
    if (this.flushing) return;
    this.flushing = true;
    try {
      for (const item of [...this.items]) {
        if (item.status !== 'pending') continue;
        item.attempts++;
        try {
          const outcome = await send(item);
          if (outcome === null) {
            this.items = this.items.filter((i) => i.id !== item.id);
            this.online = true;
            for (const fn of this.syncedListeners) fn(item);
          } else {
            item.status = 'failed';
            item.message = outcome;
          }
        } catch (e) {
          if (isNetworkError(e)) {
            this.online = false;
            break;
          }
          item.status = 'failed';
          item.message = e instanceof Error ? e.message : String(e);
        } finally {
          this.emit();
          await this.persist();
        }
      }
    } finally {
      this.flushing = false;
    }
  }
}

/** null = gelukt; tekst = definitieve fout (niet opnieuw proberen); exception = opnieuw proberen. */
async function send(item: OutboxItem): Promise<string | null> {
  if (item.kind === 'registration') {
    await upsertRegistration(item.data.eventId, item.data.playerId, item.data.patch);
    return null;
  }
  const result = await submitScore(item.data);
  if (result.status === 'ok') return null;
  return result.message ?? 'De uitslag kon niet opgeslagen worden.';
}

export const outbox = new Outbox();

export function useOutbox() {
  const items = useSyncExternalStore(outbox.subscribe, outbox.getSnapshot, outbox.getSnapshot);
  return {
    items,
    pending: items.filter((i) => i.status === 'pending'),
    failed: items.filter((i) => i.status === 'failed'),
    online: outbox.online,
  };
}

/** Uitslagen die nog op synchronisatie wachten, per matchcode. */
export function usePendingScores(eventId: string | undefined): Map<string, ScoreItem> {
  const { items } = useOutbox();
  const map = new Map<string, ScoreItem>();
  for (const i of items) if (i.kind === 'score' && i.data.eventId === eventId) map.set(i.data.code, i);
  return map;
}
