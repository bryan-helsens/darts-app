/**
 * Pushmeldingen op dit toestel: aanzetten (toestemming vragen, abonneren bij
 * de pushdienst van de browser en het abonnement bewaren via `subscribe_push`),
 * uitzetten en de toestand opvragen. Versturen doet de Netlify-functie
 * "meldingen"; tonen doet de service worker (public/push-sw.js).
 */

import { fetchPushStatus, subscribePush, unsubscribePush, type PushStatus } from '../../data/api';
import type { PushKind } from '../../data/push';
import { isIos, isStandalone } from './install';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '';

/**
 * - `ok`: meldingen kunnen;
 * - `disabled`: niet ingesteld (geen VAPID-sleutel);
 * - `install`: iPhone/iPad in Safari: eerst de app op het beginscherm zetten;
 * - `unsupported`: deze browser kan het niet.
 */
export type PushSupport = 'ok' | 'disabled' | 'install' | 'unsupported';

export function pushSupport(): PushSupport {
  if (!VAPID_PUBLIC_KEY) return 'disabled';
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'unsupported';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return isIos() && !isStandalone() ? 'install' : 'unsupported';
  return 'ok';
}

/** De publieke VAPID-sleutel (base64url) als bytes, zoals `pushManager.subscribe` ze vraagt. */
export function urlBase64ToUint8Array(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** De service worker, of null als die er (nog) niet is (bv. op de dev-server). */
async function registration(timeoutMs = 4000): Promise<ServiceWorkerRegistration | null> {
  return Promise.race([navigator.serviceWorker.ready, new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs))]);
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== 'ok') return null;
  const reg = await registration();
  return reg ? reg.pushManager.getSubscription() : null;
}

export interface DevicePushState {
  permission: NotificationPermission;
  /** Voor wie dit toestel meldingen krijgt (null = staan uit). */
  status: PushStatus | null;
}

export async function devicePushState(): Promise<DevicePushState> {
  const permission = Notification.permission;
  const sub = permission === 'granted' ? await currentSubscription() : null;
  return { permission, status: sub ? await fetchPushStatus(sub.endpoint) : null };
}

async function subscribe(reg: ServiceWorkerRegistration): Promise<PushSubscription> {
  const options = { userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) };
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;
  try {
    return await reg.pushManager.subscribe(options);
  } catch (e) {
    // Een oud abonnement met een andere sleutel: opruimen en opnieuw.
    const stale = await reg.pushManager.getSubscription();
    if (!stale) throw e;
    await stale.unsubscribe();
    return reg.pushManager.subscribe(options);
  }
}

/**
 * Meldingen aanzetten (of de soorten wijzigen) voor een speler op dit toestel.
 * Geeft 'denied' als de gebruiker de toestemming weigert.
 */
export async function enablePush(playerId: string, kinds: readonly PushKind[]): Promise<'ok' | 'denied'> {
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';
  const reg = await registration(10_000);
  if (!reg) throw new Error('De app is nog niet volledig geladen. Herlaad de pagina en probeer opnieuw.');
  const sub = await subscribe(reg);
  const keys = sub.toJSON().keys ?? {};
  const res = await subscribePush({ playerId, endpoint: sub.endpoint, p256dh: keys.p256dh ?? '', auth: keys.auth ?? '', kinds });
  if (res.status !== 'ok') throw new Error(res.message ?? 'De meldingen konden niet aangezet worden.');
  return 'ok';
}

/** Meldingen uitzetten op dit toestel (voor iedereen). */
export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await unsubscribePush(sub.endpoint);
  await sub.unsubscribe();
}

/**
 * Tikken op een melding terwijl de app al open is: de service worker vraagt om
 * naar die pagina te gaan (zonder de app te herladen).
 */
export function onPushNavigate(go: (path: string) => void): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('message', (e: MessageEvent) => {
    const data = e.data as { type?: string; url?: unknown } | null;
    if (data?.type === 'sanapolis-navigate' && typeof data.url === 'string' && data.url.startsWith('/')) go(data.url);
  });
}
