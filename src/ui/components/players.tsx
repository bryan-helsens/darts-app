import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { createPlayer } from '../../data/api';
import { keys, usePlayers } from '../../data/queries';
import type { PlayerRow } from '../../data/rows';
import { findSimilar } from '../../lib/names';
import { Button, ErrorBox, Field, InfoBox, TextInput } from './ui';

/**
 * Snel een speler toevoegen: enkel de naam is verplicht. Bij een gelijkaardige
 * naam vragen we eerst of het niet om dezelfde persoon gaat.
 */
export function AddPlayerForm({
  initialName = '',
  onCreated,
  onPickExisting,
  submitLabel = 'Speler toevoegen',
}: {
  initialName?: string;
  onCreated: (player: PlayerRow) => void;
  onPickExisting?: (player: PlayerRow) => void;
  submitLabel?: string;
}) {
  const qc = useQueryClient();
  const { data: players = [] } = usePlayers();
  const [name, setName] = useState(initialName);
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [more, setMore] = useState(false);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const similar = name.trim().length >= 3 ? findSimilar(name, players).slice(0, 4) : [];

  const create = useMutation({
    mutationFn: () => createPlayer({ name, nickname, email, phone }),
    onSuccess: async (player) => {
      await qc.invalidateQueries({ queryKey: keys.players });
      await qc.invalidateQueries({ queryKey: keys.contacts });
      setName('');
      setNickname('');
      setEmail('');
      setPhone('');
      setConfirmDuplicate(false);
      onCreated(player);
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (similar.length > 0 && !confirmDuplicate) {
      setConfirmDuplicate(true);
      return;
    }
    create.mutate();
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Naam">
        <TextInput
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setConfirmDuplicate(false);
          }}
          placeholder="Voornaam Achternaam"
          autoComplete="off"
          required
        />
      </Field>
      {similar.length > 0 && (
        <InfoBox tone="amber">
          <p className="font-semibold">Bestaat deze speler al?</p>
          <ul className="mt-2 space-y-1">
            {similar.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2">
                <span>
                  {p.name}
                  {p.nickname && <span className="text-zinc-500"> “{p.nickname}”</span>}
                </span>
                {onPickExisting && (
                  <Button size="sm" variant="secondary" onClick={() => onPickExisting(p)}>
                    Deze speler
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {confirmDuplicate && <p className="mt-2 text-sm">Druk nog eens op “{submitLabel}” als het toch om een nieuwe speler gaat.</p>}
        </InfoBox>
      )}
      {more ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Bijnaam (optioneel)">
            <TextInput value={nickname} onChange={(e) => setNickname(e.target.value)} />
          </Field>
          <Field label="E-mail (optioneel)" hint="Niet publiek zichtbaar">
            <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Gsm (optioneel)" hint="Niet publiek zichtbaar">
            <TextInput type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
        </div>
      ) : (
        <button type="button" className="text-sm text-brand-700 underline" onClick={() => setMore(true)}>
          + bijnaam, e-mail of gsm
        </button>
      )}
      {create.error && <ErrorBox error={create.error} />}
      <Button type="submit" size="lg" block disabled={create.isPending || !name.trim()}>
        {create.isPending ? 'Bezig…' : submitLabel}
      </Button>
    </form>
  );
}

export function displayName(p: Pick<PlayerRow, 'name' | 'nickname'> | undefined): string {
  if (!p) return '?';
  return p.nickname ? `${p.name} “${p.nickname}”` : p.name;
}
