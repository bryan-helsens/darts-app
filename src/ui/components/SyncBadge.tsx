import { useState } from 'react';
import { outbox, useOutbox } from '../../data/outbox';
import { Button, Modal, cx } from './ui';

/** Toont of er nog iets op synchronisatie wacht (offline-buffer). */
/** `onLight`: voor gebruik op een lichte achtergrond in plaats van in de zwarte kop. */
export function SyncBadge({ className, onLight }: { className?: string; onLight?: boolean }) {
  const { items, pending, failed, online } = useOutbox();
  const [open, setOpen] = useState(false);
  const tone = failed.length > 0 ? 'bg-accent-600 text-white' : pending.length > 0 ? 'bg-amber-400 text-amber-950' : online ? (onLight ? 'bg-white text-zinc-700 ring-1 ring-inset ring-zinc-200' : 'bg-white/10 text-zinc-200 hover:bg-white/15') : 'bg-zinc-600 text-white';
  const dot = failed.length > 0 ? 'bg-white' : pending.length > 0 ? 'bg-amber-900 animate-pulse' : online ? 'bg-brand-500' : 'bg-zinc-300';
  const label =
    failed.length > 0
      ? `${failed.length} probleem${failed.length > 1 ? 'en' : ''}`
      : pending.length > 0
        ? `${pending.length} wacht${pending.length > 1 ? 'en' : ''} op verbinding`
        : online
          ? '✓ Alles gesynchroniseerd'
          : 'Offline';
  return (
    <>
      <button type="button" aria-label={label} onClick={() => setOpen(true)} className={cx('inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap', tone, className)}>
        <span className={cx('h-1.5 w-1.5 rounded-full', dot)} />
        {label === '✓ Alles gesynchroniseerd' ? (
          <>
            <span className="sm:hidden">Online</span>
            <span className="hidden sm:inline">{label}</span>
          </>
        ) : (
          label
        )}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Synchronisatie">
        {items.length === 0 ? (
          <p className="text-sm text-zinc-600">Alles is opgeslagen op de server.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((i) => (
              <li key={i.id} className="rounded-lg border border-zinc-200 p-2.5">
                <div className="text-sm font-semibold">{i.label}</div>
                <div className={cx('text-xs', i.status === 'failed' ? 'text-accent-700' : 'text-amber-800')}>
                  {i.status === 'failed' ? i.message : 'Wacht op verbinding…'}
                </div>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => void outbox.retry(i.id)}>
                    Opnieuw proberen
                  </Button>
                  {i.status === 'failed' && (
                    <Button size="sm" variant="ghost" onClick={() => void outbox.dismiss(i.id)}>
                      Verwijderen
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-zinc-500">
          Uitslagen en check-ins worden eerst op dit toestel bewaard en automatisch verstuurd zodra er verbinding is. Sluit de app gerust: er gaat niets verloren.
        </p>
      </Modal>
    </>
  );
}
