import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { anonymizePlayer, deletePlayer, mergePlayers, updatePlayer } from '../../../data/api';
import { useAuth } from '../../../data/auth';
import { keys, useContacts, usePlayers } from '../../../data/queries';
import type { PlayerRow } from '../../../data/rows';
import { matchesSearch } from '../../../lib/names';
import { AddPlayerForm, displayName } from '../../components/players';
import { Badge, Button, ConfirmModal, Empty, ErrorBox, Field, Modal, PageTitle, Select, Spinner, TextInput } from '../../components/ui';

export function PlayersAdminPage() {
  const { data: players, isLoading, error } = usePlayers();
  const { data: contacts } = useContacts();
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<PlayerRow | null>(null);
  const contactOf = useMemo(() => new Map((contacts ?? []).map((c) => [c.player_id, c])), [contacts]);

  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox error={error} />;
  const list = (players ?? []).filter((p) => matchesSearch(`${p.name} ${p.nickname ?? ''}`, query));

  return (
    <div>
      <PageTitle
        sub={`${players?.length ?? 0} spelers. Publiek is enkel de naam en bijnaam zichtbaar.`}
        actions={
          <Button size="lg" onClick={() => setAdding(true)}>
            + Nieuwe speler
          </Button>
        }
      >
        Spelers
      </PageTitle>
      <TextInput placeholder="Zoek een speler…" value={query} onChange={(e) => setQuery(e.target.value)} className="mb-4" />
      {list.length === 0 ? (
        <Empty>Geen spelers gevonden.</Empty>
      ) : (
        <div className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
          {list.map((p) => {
            const c = contactOf.get(p.id);
            return (
              <button key={p.id} type="button" onClick={() => setEditing(p)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-stone-50">
                <div>
                  <div className="font-semibold">{displayName(p)}</div>
                  <div className="text-sm text-stone-500">{[c?.email, c?.phone].filter(Boolean).join(' · ') || 'geen contactgegevens'}</div>
                </div>
                <div className="flex gap-1">
                  {!p.active && <Badge>inactief</Badge>}
                  {p.anonymized_at && <Badge tone="amber">geanonimiseerd</Badge>}
                </div>
              </button>
            );
          })}
        </div>
      )}
      <Modal open={adding} onClose={() => setAdding(false)} title="Nieuwe speler">
        <AddPlayerForm onCreated={() => setAdding(false)} />
      </Modal>
      {editing && <EditPlayer player={editing} contact={contactOf.get(editing.id)} players={players ?? []} onClose={() => setEditing(null)} />}
    </div>
  );
}

function EditPlayer({
  player,
  contact,
  players,
  onClose,
}: {
  player: PlayerRow;
  contact?: { email: string | null; phone: string | null };
  players: PlayerRow[];
  onClose: () => void;
}) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState(player.name);
  const [nickname, setNickname] = useState(player.nickname ?? '');
  const [email, setEmail] = useState(contact?.email ?? '');
  const [phone, setPhone] = useState(contact?.phone ?? '');
  const [active, setActive] = useState(player.active);
  const [mergeWith, setMergeWith] = useState('');
  const [confirm, setConfirm] = useState<null | 'merge' | 'anonymize' | 'delete'>(null);
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: keys.players });
    await qc.invalidateQueries({ queryKey: keys.contacts });
  };

  const save = useMutation({
    mutationFn: () => updatePlayer(player.id, { name, nickname, active, email, phone }),
    onSuccess: async () => {
      await refresh();
      onClose();
    },
  });
  const action = useMutation({
    mutationFn: async (kind: 'merge' | 'anonymize' | 'delete') => {
      if (kind === 'merge') await mergePlayers(mergeWith, player.id);
      if (kind === 'anonymize') await anonymizePlayer(player.id);
      if (kind === 'delete') await deletePlayer(player.id);
    },
    onSuccess: async () => {
      setConfirm(null);
      await refresh();
      onClose();
    },
    onError: () => setConfirm(null),
  });
  const target = players.find((p) => p.id === mergeWith);

  return (
    <Modal open onClose={onClose} title={player.name}>
      <div className="space-y-3">
        <Field label="Naam">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Bijnaam">
          <TextInput value={nickname} onChange={(e) => setNickname(e.target.value)} />
        </Field>
        <Field label="E-mail" hint="Niet publiek zichtbaar">
          <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Gsm" hint="Niet publiek zichtbaar">
          <TextInput type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <label className="flex items-center gap-3">
          <input type="checkbox" className="h-6 w-6" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Actieve speler (verschijnt bij het zoeken tijdens de check-in)
        </label>
        {save.error && <ErrorBox error={save.error} />}
        <Button size="lg" block onClick={() => save.mutate()} disabled={save.isPending || !name.trim()}>
          Opslaan
        </Button>

        {isAdmin && (
          <div className="mt-6 space-y-3 border-t border-stone-200 pt-4">
            <h3 className="font-semibold">Beheer (admin)</h3>
            <Field label="Dubbel aangemaakt? Voeg deze speler samen met:" hint="Alle uitslagen gaan naar de gekozen speler; deze fiche verdwijnt.">
              <Select value={mergeWith} onChange={(e) => setMergeWith(e.target.value)}>
                <option value="">Kies een speler…</option>
                {players
                  .filter((p) => p.id !== player.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" disabled={!mergeWith} onClick={() => setConfirm('merge')}>
                Samenvoegen
              </Button>
              <Button variant="secondary" onClick={() => setConfirm('anonymize')}>
                Anonimiseren (GDPR)
              </Button>
              <Button variant="danger" onClick={() => setConfirm('delete')}>
                Verwijderen
              </Button>
            </div>
            {action.error && <ErrorBox error={action.error} />}
          </div>
        )}
      </div>
      <ConfirmModal
        open={confirm !== null}
        title={confirm === 'merge' ? 'Spelers samenvoegen' : confirm === 'anonymize' ? 'Speler anonimiseren' : 'Speler verwijderen'}
        danger={confirm !== 'merge'}
        busy={action.isPending}
        confirmLabel={confirm === 'merge' ? 'Samenvoegen' : confirm === 'anonymize' ? 'Anonimiseren' : 'Verwijderen'}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && action.mutate(confirm)}
      >
        {confirm === 'merge' && (
          <p>
            Alle inschrijvingen, matchen en punten van <b>{player.name}</b> gaan naar <b>{target?.name}</b>. Daarna wordt de fiche “{player.name}” verwijderd.
          </p>
        )}
        {confirm === 'anonymize' && (
          <p>
            De naam wordt vervangen door “Anonieme speler” en contactgegevens worden gewist. De uitslagen blijven (anoniem) bewaard zodat de ranking klopt. Dit kan niet
            ongedaan gemaakt worden.
          </p>
        )}
        {confirm === 'delete' && <p>Verwijderen kan enkel als de speler nog nooit een match speelde. Gebruik anders “Anonimiseren”.</p>}
      </ConfirmModal>
    </Modal>
  );
}
