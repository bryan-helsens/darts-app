import { useEffect, useState } from 'react';
import type { EventView } from '../../data/eventView';
import { isMasters } from '../../data/masters';
import { formatLongDate } from '../../lib/time';
import { Button, ErrorBox, Icon, Modal, Spinner } from '../components/ui';
import { canvasToFile, drawResultImage, resultImageData, type ResultImageData } from './resultImage';

/** Knop "Deel de uitslag": maakt een afbeelding van 1080×1080 om te delen of te downloaden. */
export function ShareResultButton({
  view,
  points,
  name,
  size = 'sm',
}: {
  view: EventView;
  /** Punten per speler (zoals bij het afsluiten berekend). */
  points: ReadonlyMap<string, number>;
  name: (id: string) => string;
  size?: 'sm' | 'md';
}) {
  const [open, setOpen] = useState(false);
  const [image, setImage] = useState<{ url: string; file: File } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileName = `sanapolis-darts-${view.event.event_date}.png`;
  const data = view.placements
    ? resultImageData({
        date: `${isMasters(view.event) ? 'Masters · ' : ''}${formatLongDate(view.event.event_date)}`,
        placements: view.placements.placements,
        points,
        stats: [...view.statsByMatch.values()].flat(),
        matchesPlayed: view.matches.filter((m) => m.winner !== null && !m.walkover).length,
        name: (id) => name(id),
        site: window.location.host,
      })
    : null;
  // Enkel opnieuw tekenen als de inhoud echt verandert (niet bij elke render).
  const signature = data ? JSON.stringify(data) : null;

  useEffect(() => {
    if (!open || !signature) return;
    let url: string | null = null;
    let cancelled = false;
    const canvas = document.createElement('canvas');
    drawResultImage(canvas, JSON.parse(signature) as ResultImageData)
      .then(() => canvasToFile(canvas, fileName))
      .then((file) => {
        if (cancelled) return;
        url = URL.createObjectURL(file);
        setImage({ url, file });
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
      setImage(null);
    };
  }, [open, signature, fileName]);

  if (!data || !view.placements?.complete) return null;
  const canShare = Boolean(image && typeof navigator.canShare === 'function' && navigator.canShare({ files: [image.file] }));

  const share = async () => {
    if (!image) return;
    try {
      await navigator.share({ files: [image.file], title: 'Sanapolis Darts', text: `Uitslag van ${data.date}` });
    } catch (e) {
      // Annuleren door de gebruiker is geen fout.
      if (!(e instanceof DOMException && e.name === 'AbortError')) setError('Delen lukte niet. Download de afbeelding en deel ze zelf.');
    }
  };

  return (
    <>
      <Button size={size} variant="secondary" onClick={() => setOpen(true)}>
        <Icon name="external" className="h-3.5 w-3.5" />
        Deel de uitslag
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Deel de uitslag">
        <div className="space-y-3">
          <div className="aspect-square overflow-hidden rounded-lg bg-ink">
            {image ? <img src={image.url} alt={`Uitslag ${data.date}`} className="h-full w-full" /> : <Spinner label="Afbeelding maken…" />}
          </div>
          {error && <ErrorBox>{error}</ErrorBox>}
          <div className="grid grid-cols-2 gap-2">
            {canShare && (
              <Button size="lg" onClick={() => void share()}>
                Delen
              </Button>
            )}
            <a href={image?.url} download={fileName} className={canShare ? '' : 'col-span-2'} aria-disabled={!image}>
              <Button size="lg" variant={canShare ? 'secondary' : 'primary'} block disabled={!image}>
                Downloaden
              </Button>
            </a>
          </div>
          <p className="text-2xs text-zinc-500">Klaar om te posten op Facebook, Instagram of WhatsApp.</p>
        </div>
      </Modal>
    </>
  );
}
