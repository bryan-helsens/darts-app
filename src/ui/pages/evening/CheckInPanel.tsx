import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { deleteRegistration, updateEvent } from '../../../data/api';
import { outbox, useOutbox } from '../../../data/outbox';
import { keys, usePlayers } from '../../../data/queries';
import type { EventRow, PlayerRow, RegistrationRow } from '../../../data/rows';
import { matchesSearch } from '../../../lib/names';
import { brusselsToUtc, formatTime, shortTime } from '../../../lib/time';
import { AddPlayerForm, displayName } from '../../components/players';
import { Badge, Button, Card, cx, ErrorBox, InfoBox, Modal, SearchInput, Stats } from '../../components/ui';
import { useNow } from '../../hooks';

interface Row {
  player: PlayerRow;
  reg: RegistrationRow | null;
  present: boolean;
  paid: boolean;
  pending: boolean;
}

/** Check-in: zoeken, vinkje "aanwezig" en "betaald", tellers en prijzenpot. */
export function CheckInPanel({ event, registrations, entryFee }: { event: EventRow; registrations: RegistrationRow[]; entryFee: number }) {
  const { data: players = [] } = usePlayers();
  const { items } = useOutbox();
  const qc = useQueryClient();
  const now = useNow(30_000);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const started = event.status !== 'gepland';

  const closesAt = brusselsToUtc(event.event_date, shortTime(event.registration_closes));
  const closed = now > closesAt && !event.registration_reopened;

  // Openstaande wijzigingen uit de offline-buffer meteen tonen.
  const rows: Row[] = useMemo(() => {
    const patches = new Map<string, { present?: boolean; paid?: boolean }>();
    for (const i of items) {
      if (i.kind === 'registration' && i.data.eventId === event.id) patches.set(i.data.playerId, { ...patches.get(i.data.playerId), ...i.data.patch });
    }
    const byPlayer = new Map(registrations.map((r) => [r.player_id, r]));
    const ids = new Set([...byPlayer.keys(), ...patches.keys()]);
    return [...ids]
      .map((id) => {
        const reg = byPlayer.get(id) ?? null;
        const patch = patches.get(id);
        const player = players.find((p) => p.id === id);
        if (!player) return null;
        return {
          player,
          reg,
          present: patch?.present ?? reg?.present ?? false,
          paid: patch?.paid ?? reg?.paid ?? false,
          pending: Boolean(patch),
        };
      })
      .filter((r): r is Row => r !== null)
      .sort((a, b) => a.player.name.localeCompare(b.player.name, 'nl'));
  }, [registrations, items, players, event.id]);

  const present = rows.filter((r) => r.present).length;
  const paid = rows.filter((r) => r.paid).length;
  const registeredIds = new Set(rows.map((r) => r.player.id));
  const visible = rows.filter((r) => matchesSearch(`${r.player.name} ${r.player.nickname ?? ''}`, query));
  const others = query.trim().length >= 2 ? players.filter((p) => p.active && !registeredIds.has(p.id) && matchesSearch(`${p.name} ${p.nickname ?? ''}`, query)).slice(0, 8) : [];

  const toggle = (player: PlayerRow, patch: { present?: boolean; paid?: boolean }) => {
    const parts = [patch.present !== undefined && (patch.present ? 'aanwezig' : 'niet aanwezig'), patch.paid !== undefined && (patch.paid ? 'betaald' : 'niet betaald')]
      .filter(Boolean)
      .join(', ');
    void outbox.addRegistration({ eventId: event.id, playerId: player.id, patch }, `${player.name}: ${parts}`);
  };

  const reopen = useMutation({
    mutationFn: () => updateEvent(event.id, { registration_reopened: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.event(event.id) }).then(() => qc.invalidateQueries({ queryKey: keys.events })),
  });
  const unregister = useMutation({
    mutationFn: (playerId: string) => deleteRegistration(event.id, playerId),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.registrations(event.id) }),
  });

  return (
    <div className="space-y-3">
      <Stats
        items={[
          { value: present, label: 'aanwezig' },
          { value: paid, label: 'betaald' },
          { value: `€${(paid * entryFee).toLocaleString('nl-BE')}`, label: 'prijzenpot' },
        ]}
      />

      {started ? (
        <InfoBox>Het toernooi is gestart: nieuwe spelers kunnen niet meer meedoen. Betalingen kan je hier nog aanvinken.</InfoBox>
      ) : closed ? (
        <InfoBox tone="amber">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>De inschrijving is gesloten sinds {formatTime(closesAt)}.</span>
            <Button size="sm" variant="secondary" onClick={() => reopen.mutate()} disabled={reopen.isPending}>
              Toch heropenen
            </Button>
          </div>
        </InfoBox>
      ) : (
        <p className="text-sm text-zinc-500">
          Inschrijving open tot {formatTime(closesAt)}
          {event.registration_reopened && ' (heropend door de wedstrijdleider)'}.
        </p>
      )}

      <div className="sticky top-0 z-10 -mx-4 bg-zinc-100/95 px-4 py-2 backdrop-blur md:top-14">
        <SearchInput placeholder="Zoek of voeg een speler toe…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {!started && (others.length > 0 || query.trim().length >= 2) && (
        <Card className="space-y-2">
          <div className="text-xs font-bold tracking-wider text-zinc-500 uppercase">Nog niet ingeschreven</div>
          {others.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{displayName(p)}</span>
              <Button size="sm" disabled={closed} onClick={() => toggle(p, { present: true })}>
                + Aanwezig
              </Button>
            </div>
          ))}
          <Button variant="secondary" block disabled={closed} onClick={() => setAdding(true)}>
            + Nieuwe speler “{query.trim()}”
          </Button>
        </Card>
      )}

      <div className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white">
        {visible.length === 0 && <p className="p-4 text-sm text-zinc-500">Nog niemand ingeschreven. Zoek hierboven een speler.</p>}
        {visible.map((r) => (
          <div key={r.player.id} className={cx('flex items-center gap-2 px-3 py-2', r.pending && 'bg-amber-50')}>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] leading-snug font-semibold break-words text-zinc-950">{displayName(r.player)}</div>
              {(r.reg?.preregistered || r.reg?.withdrawn_at || r.pending || (!started && !r.present && r.reg)) && (
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  {r.reg?.preregistered && <Badge tone="blue">vooraf</Badge>}
                  {r.reg?.withdrawn_at && <Badge tone="red">opgegeven</Badge>}
                  {r.pending && <Badge tone="amber">wacht op sync</Badge>}
                  {!started && !r.present && r.reg && (
                    <button type="button" className="text-xs text-zinc-500 underline" onClick={() => unregister.mutate(r.player.id)}>
                      uitschrijven
                    </button>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              disabled={started}
              aria-pressed={r.present}
              onClick={() => toggle(r.player, { present: !r.present })}
              className={cx(
                'h-11 w-[6.5rem] shrink-0 rounded-lg text-sm font-bold transition-colors',
                r.present ? 'bg-brand-600 text-white' : 'bg-white text-zinc-600 ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50',
                started && 'opacity-60',
              )}
            >
              {r.present ? '✓ Aanwezig' : 'Aanwezig?'}
            </button>
            <button
              type="button"
              aria-pressed={r.paid}
              onClick={() => toggle(r.player, { paid: !r.paid })}
              className={cx(
                'h-11 w-[5.5rem] shrink-0 rounded-lg text-sm font-bold transition-colors',
                r.paid ? 'bg-ink text-white' : 'bg-white text-zinc-600 ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50',
              )}
            >
              {r.paid ? '✓ Betaald' : `€${entryFee}?`}
            </button>
          </div>
        ))}
      </div>
      {unregister.error && <ErrorBox error={unregister.error} />}

      <Modal open={adding} onClose={() => setAdding(false)} title="Nieuwe speler">
        <AddPlayerForm
          initialName={query.trim()}
          submitLabel="Toevoegen en aanwezig"
          onCreated={(p) => {
            toggle(p, { present: true });
            setAdding(false);
            setQuery('');
          }}
          onPickExisting={(p) => {
            toggle(p, { present: true });
            setAdding(false);
            setQuery('');
          }}
        />
      </Modal>
    </div>
  );
}
