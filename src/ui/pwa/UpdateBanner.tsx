import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '../components/ui';

const HOUR = 60 * 60 * 1000;

/**
 * Melding "Nieuwe versie beschikbaar". De app herlaadt nooit vanzelf (bv.
 * midden in een scoreinvoer), behalve op het TV-scherm: daar tikt niemand.
 */
export function UpdateBanner() {
  const [later, setLater] = useState(false);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // De app blijft soms uren open (TV, wedstrijdleider): af en toe zelf naar updates kijken.
      if (registration) window.setInterval(() => void registration.update(), HOUR);
    },
  });
  const tv = typeof window !== 'undefined' && window.location.pathname.startsWith('/tv');

  useEffect(() => {
    if (needRefresh && tv) void updateServiceWorker(true);
  }, [needRefresh, tv, updateServiceWorker]);

  if (!needRefresh || later || tv) return null;
  return (
    <div className="no-print fixed inset-x-3 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md items-center gap-3 rounded-lg bg-ink px-3 py-2.5 text-white shadow-lg md:bottom-4">
      <div className="min-w-0 flex-1 text-[13px]">
        <div className="font-semibold">Nieuwe versie beschikbaar</div>
        <div className="text-xs text-zinc-400">Wat je nog moet doorsturen, blijft bewaard.</div>
      </div>
      <button type="button" className="text-xs text-zinc-400 hover:text-white" onClick={() => setLater(true)}>
        Later
      </button>
      <Button size="sm" onClick={() => void updateServiceWorker(true)}>
        Vernieuwen
      </Button>
    </div>
  );
}
