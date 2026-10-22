/**
 * Check-in voor de Masters: geen vrij zoekveld, wel de seizoensranking.
 * Bovenaan de geplaatsten (top N), daaronder de reserves. Wie geplaatst is
 * maar er niet is, wordt vervangen door de volgende aanwezige in de ranking.
 */

import { useMemo } from 'react';
import { mastersField, type RankingRow } from '../../../engine';
import { outbox, useOutbox } from '../../../data/outbox';
import { usePlayerDirectory } from '../../../data/queries';
import type { EventRow, RegistrationRow } from '../../../data/rows';
import { displayName } from '../../components/players';
import { Badge, cx, Empty, InfoBox, List, SectionTitle, Stats } from '../../components/ui';

export function MastersCheckIn({ event, registrations, ranking, size }: { event: EventRow; registrations: RegistrationRow[]; ranking: RankingRow[]; size: number }) {
  const directory = usePlayerDirectory();
  const { items } = useOutbox();
  const started = event.status !== 'gepland';

  // Aanwezig volgens de database, met de openstaande wijzigingen uit de offline-buffer.
  const { present, pendingIds } = useMemo(() => {
    const present = new Set(registrations.filter((r) => r.present && !r.withdrawn_at).map((r) => r.player_id));
    const pendingIds = new Set<string>();
    for (const i of items) {
      if (i.kind !== 'registration' || i.data.eventId !== event.id || i.data.patch.present === undefined) continue;
      pendingIds.add(i.data.playerId);
      if (i.data.patch.present) present.add(i.data.playerId);
      else present.delete(i.data.playerId);
    }
    return { present, pendingIds };
  }, [registrations, items, event.id]);

  const field = useMemo(() => mastersField(ranking, present, size), [ranking, present, size]);
  const inField = new Set(field.field);
  const replacing = new Set(field.replacements);
  const qualified = ranking.slice(0, size);
  const reserves = ranking.slice(size);

  const toggle = (playerId: string, on: boolean) => {
    const player = directory.byId.get(playerId);
    void outbox.addRegistration({ eventId: event.id, playerId, patch: { present: on } }, `${player?.name ?? 'Speler'}: ${on ? 'aanwezig' : 'niet aanwezig'}`);
  };

  if (ranking.length === 0) return <Empty>Er is nog geen seizoensranking: speel eerst een avond.</Empty>;

  const row = (r: RankingRow) => {
    const on = present.has(r.playerId);
    const player = directory.byId.get(r.playerId);
    return (
      <div key={r.playerId} data-masters-row className={cx('flex items-center gap-2 py-1.5 pr-1.5 pl-3', pendingIds.has(r.playerId) && 'bg-amber-50')}>
        <span className="w-7 shrink-0 text-right text-xs font-semibold text-zinc-400 tabular-nums">#{r.position}</span>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className="truncate text-sm font-medium text-zinc-950">{player ? displayName(player) : directory.name(r.playerId)}</span>
          {inField.has(r.playerId) && (replacing.has(r.playerId) ? <Badge tone="amber">vervanger</Badge> : <Badge tone="blue">speelt</Badge>)}
          {!on && r.position <= size && <Badge tone="red">afwezig</Badge>}
          {on && !inField.has(r.playerId) && <Badge>reserve</Badge>}
        </div>
        <button
          type="button"
          disabled={started}
          aria-pressed={on}
          onClick={() => toggle(r.playerId, !on)}
          className={cx(
            'h-9 w-[5.75rem] shrink-0 rounded-md text-[13px] font-semibold transition-colors',
            on ? 'bg-brand-600 text-white shadow-xs' : 'bg-white text-zinc-500 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-50',
            started && 'opacity-60',
          )}
        >
          {on ? '✓ Aanwezig' : 'Aanwezig?'}
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <Stats
        items={[
          { value: `${field.field.length}/${size}`, label: 'plaatsen ingevuld' },
          { value: field.absent.length, label: 'afwezig' },
          { value: field.replacements.length, label: 'vervangers' },
        ]}
      />
      {started ? (
        <InfoBox>De Masters is gestart: het veld ligt vast.</InfoBox>
      ) : (
        <p className="text-xs text-zinc-500" data-masters-count>
          {field.field.length} van {size} plaatsen ingevuld. Zet de geplaatste spelers aanwezig. Is er iemand niet, zet dan de eerstvolgende reserve aanwezig: die neemt de
          plaats in volgens de ranking.
        </p>
      )}

      <SectionTitle>Geplaatst (top {size})</SectionTitle>
      <List>{qualified.map(row)}</List>
      {reserves.length > 0 && (
        <>
          <SectionTitle>Reserves</SectionTitle>
          <List>{reserves.map(row)}</List>
        </>
      )}
    </div>
  );
}
