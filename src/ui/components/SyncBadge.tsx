import { useState } from 'react';
import { outbox, useOutbox } from '../../data/outbox';
import { Button, Modal, cx } from './ui';

/** Toont of er nog iets op synchronisatie wacht (offline-buffer). */
export function SyncBadge({ className }: { className?: string }) {
  const { items, pending, failed, online } = useOutbox();
  const [open, setOpen] = useState(false);
  const tone = failed.length > 0 ? 'bg-red-600 text-white' : pending.length > 0 ? 'bg-amber-400 text-amber-950' : online ? 'bg-emerald-600 text-white' : 'bg-stone-500 text-white';
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
      <button type="button" onClick={() => setOpen(true)} className={cx('rounded-full px-3 py-1 text-sm font-semibold', tone, className)}>
        {label}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Synchronisatie">
        {items.length === 0 ? (
          <p className="text-stone-600">Alles is opgeslagen op de server.</p>
        ) : (
          <ul className="space-y-3">
            {items.map((i) => (
              <li key={i.id} className="rounded-xl border border-stone-200 p-3">
                <div className="font-semibold">{i.label}</div>
                <div className={cx('text-sm', i.status === 'failed' ? 'text-red-700' : 'text-amber-800')}>
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
        <p className="mt-4 text-sm text-stone-500">
          Uitslagen en check-ins worden eerst op dit toestel bewaard en automatisch verstuurd zodra er verbinding is. Sluit de app gerust: er gaat niets verloren.
        </p>
      </Modal>
    </>
  );
}
