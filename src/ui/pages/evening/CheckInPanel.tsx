import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { deleteRegistration, updateEvent } from '../../../data/api';
import { outbox, useOutbox } from '../../../data/outbox';
import { keys, usePlayers } from '../../../data/queries';
import type { EventRow, PlayerRow, RegistrationRow } from '../../../data/rows';
import { matchesSearch } from '../../../lib/names';
import { brusselsToUtc, formatTime, shortTime } from '../../../lib/time';
import { AddPlayerForm, displayName } from '../../components/players';
import { Badge, Button, Card, cx, ErrorBox, InfoBox, Modal, TextInput } from '../../components/ui';
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
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Card className="p-3">
          <div className="text-3xl font-bold tabular-nums">{present}</div>
          <div className="text-sm text-stone-500">aanwezig</div>
        </Card>
        <Card className="p-3">
          <div className="text-3xl font-bold tabular-nums">{paid}</div>
          <div className="text-sm text-stone-500">betaald</div>
        </Card>
        <Card className="p-3">
          <div className="text-3xl font-bold tabular-nums">€{(paid * entryFee).toLocaleString('nl-BE')}</div>
          <div className="text-sm text-stone-500">prijzenpot</div>
        </Card>
      </div>

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
        <p className="text-sm text-stone-600">
          Inschrijving open tot {formatTime(closesAt)}
          {event.registration_reopened && ' (heropend door de wedstrijdleider)'}.
        </p>
      )}

      <div className="sticky top-0 z-10 -mx-4 bg-stone-50/95 px-4 py-2 backdrop-blur">
        <TextInput placeholder="Zoek of voeg een speler toe…" value={query} onChange={(e) => setQuery(e.target.value)} className="text-lg" />
      </div>

      {!started && (others.length > 0 || query.trim().length >= 2) && (
        <Card className="space-y-2">
          <div className="text-sm font-semibold text-stone-600">Nog niet ingeschreven</div>
          {others.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2">
              <span>{displayName(p)}</span>
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

      <div className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
        {visible.length === 0 && <p className="p-4 text-stone-500">Nog niemand ingeschreven. Zoek hierboven een speler.</p>}
        {visible.map((r) => (
          <div key={r.player.id} className={cx('px-3 py-2.5', r.pending && 'bg-amber-50')}>
            <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-lg font-semibold">{displayName(r.player)}</span>
              {r.reg?.preregistered && <Badge tone="blue">vooraf</Badge>}
              {r.reg?.withdrawn_at && <Badge tone="red">opgegeven</Badge>}
              {r.pending && <Badge tone="amber">wacht op sync</Badge>}
              {!started && !r.present && r.reg && (
                <button type="button" className="ml-auto text-sm text-stone-500 underline" onClick={() => unregister.mutate(r.player.id)}>
                  uitschrijven
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={started}
                onClick={() => toggle(r.player, { present: !r.present })}
                className={cx(
                  'h-12 rounded-xl border-2 px-3 text-base font-bold',
                  r.present ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-stone-300 bg-white text-stone-600',
                  started && 'opacity-60',
                )}
              >
                {r.present ? '✓ Aanwezig' : 'Aanwezig?'}
              </button>
              <button
                type="button"
                onClick={() => toggle(r.player, { paid: !r.paid })}
                className={cx(
                  'h-12 rounded-xl border-2 px-3 text-base font-bold',
                  r.paid ? 'border-brand-800 bg-brand-800 text-white' : 'border-stone-300 bg-white text-stone-600',
                )}
              >
                {r.paid ? '✓ Betaald' : `€${entryFee}?`}
              </button>
            </div>
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
