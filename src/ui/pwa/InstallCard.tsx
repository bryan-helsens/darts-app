import { useState } from 'react';
import { Button, cx, Icon } from '../components/ui';
import { isIos, isStandalone, useInstallPrompt } from './install';

const DISMISSED = 'sanapolis-darts-install-dismissed';

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED) === '1';
  } catch {
    return false;
  }
}

/** Kaart "Installeer de app": op Android met een knop, op een iPhone met uitleg. */
export function InstallCard({ className }: { className?: string }) {
  const { canPrompt, install } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(readDismissed);
  const ios = isIos();
  if (dismissed || isStandalone() || (!canPrompt && !ios)) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED, '1');
    } catch {
      // Privévenster of geen opslag: dan verschijnt de kaart de volgende keer opnieuw.
    }
  };

  return (
    <div data-install-card className={cx('flex items-start gap-3 rounded-lg border border-brand-100 bg-brand-50/60 p-3', className)}>
      <img src="/icon-192.png" alt="" className="h-10 w-10 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-zinc-950">Installeer de app</div>
        <p className="text-xs text-zinc-600">
          {canPrompt
            ? 'Zet Sanapolis Darts op je beginscherm: opent sneller en werkt ook met slechte wifi.'
            : 'Tik in Safari op Deel (het vierkantje met het pijltje) en kies “Zet op beginscherm”.'}
        </p>
        {canPrompt && (
          <Button size="sm" className="mt-2" onClick={() => void install()}>
            Installeren
          </Button>
        )}
      </div>
      <button type="button" aria-label="Niet meer tonen" className="-m-1 rounded-md p-1 text-zinc-400 hover:text-zinc-700" onClick={dismiss}>
        <Icon name="x" className="h-4 w-4" />
      </button>
    </div>
  );
}
