/**
 * Installeren als app (PWA). Chrome en Android sturen één keer het event
 * `beforeinstallprompt`, vaak al vóór React getekend is: daarom vangen we het
 * hier meteen bij het laden op en bewaren we het voor de knop "Installeren".
 */

import { useSyncExternalStore } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

/** Draait de app al als geïnstalleerde app (eigen venster)? */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** iPhone of iPad (daar kan installeren enkel via Deel → Zet op beginscherm). */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function useInstallPrompt(): { canPrompt: boolean; install: () => Promise<boolean> } {
  const event = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => deferred,
    () => null,
  );
  return {
    canPrompt: event !== null,
    install: async () => {
      if (!deferred) return false;
      const e = deferred;
      deferred = null;
      notify();
      await e.prompt();
      return (await e.userChoice).outcome === 'accepted';
    },
  };
}
