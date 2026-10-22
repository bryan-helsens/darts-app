/*
 * Pushmeldingen in de service worker. vite-plugin-pwa laadt dit bestand in de
 * gegenereerde service worker (workbox.importScripts in vite.config.ts). De
 * inhoud komt van de Netlify-functie "meldingen": { title, body, url, tag }.
 */

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Sanapolis Darts', {
      body: data.body || '',
      icon: '/icon-192.png',
      tag: data.tag || undefined,
      // Een nieuwere melding met dezelfde tag (bv. "straks" → "nu") trilt opnieuw.
      renotify: Boolean(data.tag),
      data: { url: data.url || '/' },
    }),
  );
});

// Tikken op een melding: de app openen op de juiste pagina (of het open venster daarheen sturen).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        open.postMessage({ type: 'sanapolis-navigate', url: path });
        return;
      }
      await self.clients.openWindow(new URL(path, self.location.origin).href);
    })(),
  );
});
