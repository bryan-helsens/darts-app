import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { isNetworkError, preregister, type PreregisterResult } from '../../../data/api';
import { keys, useEvents, usePlayerDirectory } from '../../../data/queries';
import { onlineRegistrationOpen, registrationClosesAt } from '../../../data/registration';
import type { PlayerRow } from '../../../data/rows';
import { findSimilar, matchesSearch } from '../../../lib/names';
import { formatLongDate, formatTime, shortTime } from '../../../lib/time';
import { displayName } from '../../components/players';
import { PushCard } from '../../pwa/PushCard';
import { Button, Card, ConfirmModal, cx, DateTile, Empty, ErrorBox, Field, Icon, InfoBox, List, rowClass, rowHover, SearchInput, Spinner, TextInput } from '../../components/ui';
import { seasonSettings, useCurrentSeason, useNow } from '../../hooks';

const storageKey = (eventId: string) => `sanapolis-darts-ingeschreven-${eventId}`;

function remembered(eventId: string): string | null {
  try {
    return localStorage.getItem(storageKey(eventId));
  } catch {
    return null;
  }
}

function remember(eventId: string, name: string | null) {
  try {
    if (name) localStorage.setItem(storageKey(eventId), name);
    else localStorage.removeItem(storageKey(eventId));
  } catch {
    // geen opslag beschikbaar: enkel voor deze sessie
  }
}

const MESSAGES: Record<Exclude<PreregisterResult['status'], 'ok' | 'already'>, string> = {
  closed: 'De online inschrijving voor deze avond is gesloten. Je kan je nog ter plaatse inschrijven tot het sluitingsuur.',
  locked: 'Er kwamen net heel veel inschrijvingen binnen. Probeer het over enkele minuten opnieuw.',
  invalid: 'Deze inschrijving lukte niet. Kijk je gegevens na.',
};

/** Publiek formulier: vooraf inschrijven voor een speelavond, zonder account. */
export function RegisterPage() {
  const { eventId = '' } = useParams();
  const { data: events, isLoading } = useEvents();
  const { season } = useCurrentSeason();
  const settings = seasonSettings(season);
  const directory = usePlayerDirectory();
  const now = useNow(30_000);
  const qc = useQueryClient();
  const [done, setDone] = useState<string | null>(() => remembered(eventId));
  // Wie zich net inschreef (voor de meldingen; nieuwe spelers zijn pas na de check-in zichtbaar).
  const [doneId, setDoneId] = useState<string | null>(null);
  const [mode, setMode] = useState<'search' | 'new'>('search');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<PlayerRow | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [confirmNew, setConfirmNew] = useState(false);

  const event = events?.find((e) => e.id === eventId);
  const players = useMemo(() => directory.list.filter((p) => p.active && !p.anonymized_at && !p.pending), [directory.list]);
  const matches = query.trim().length >= 2 ? players.filter((p) => matchesSearch(`${p.name} ${p.nickname ?? ''}`, query)).slice(0, 8) : [];
  const similar = name.trim().length >= 3 ? findSimilar(name, players).slice(0, 3) : [];

  const submit = useMutation({
    mutationFn: async (input: { playerId?: string; name?: string; email?: string; phone?: string; label: string }) => {
      const res = await preregister({ eventId, ...input });
      return { res, label: input.label };
    },
    onSuccess: async ({ res, label }) => {
      if (res.status === 'ok' || res.status === 'already') {
        remember(eventId, label);
        setDone(label);
        setDoneId(res.player_id ?? null);
        setPicked(null);
        await qc.invalidateQueries({ queryKey: keys.counts });
      }
    },
  });

  if (isLoading || directory.isLoading) return <Spinner />;
  if (!event) return <ErrorBox>Deze speelavond bestaat niet (meer).</ErrorBox>;

  const open = onlineRegistrationOpen(event, now);
  const failure =
    submit.data && submit.data.res.status !== 'ok' && submit.data.res.status !== 'already'
      ? (submit.data.res.message ?? MESSAGES[submit.data.res.status])
      : submit.error
        ? isNetworkError(submit.error)
          ? 'Geen verbinding. Probeer het opnieuw zodra je internet hebt.'
          : submit.error instanceof Error
            ? submit.error.message
            : String(submit.error)
        : null;

  const header = (
    <div className="mb-3 flex items-start gap-3">
      <DateTile date={event.event_date} />
      <div className="min-w-0">
        <h1 className="text-lg leading-tight font-semibold tracking-tight text-zinc-950">Inschrijven</h1>
        <p className="text-xs text-zinc-500">
          {formatLongDate(event.event_date)} · start {formatTime(shortTime(event.start_time))} · inleg €{settings.entryFee}
        </p>
      </div>
    </div>
  );

  if (done) {
    const known = doneId ? directory.byId.get(doneId) : undefined;
    return (
      <div className="mx-auto max-w-md">
        {header}
        <div className="rounded-lg bg-ink p-4 text-white shadow-xs">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600">
              <Icon name="check" className="h-3.5 w-3.5" />
            </span>
            Je bent ingeschreven
          </div>
          <p className="mt-1 text-[15px] font-semibold">{done}</p>
          <p className="mt-2 text-xs text-zinc-400">
            Kom op {formatLongDate(event.event_date)} vóór {formatTime(registrationClosesAt(event))} langs aan de bar om je aanwezig te melden en de inleg van €
            {settings.entryFee} te betalen. Om {formatTime(shortTime(event.start_time))} wordt er geloot.
          </p>
        </div>
        {known && <PushCard player={known} name={directory.name} className="mt-3" />}
        <div className="mt-3 flex flex-wrap gap-2">
          <Link to="/">
            <Button variant="secondary" size="sm">
              Naar de kalender
            </Button>
          </Link>
          {open && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                remember(eventId, null);
                setDone(null);
                setDoneId(null);
                setMode('search');
                setQuery('');
                setName('');
                setEmail('');
                setPhone('');
                submit.reset();
              }}
            >
              Nog iemand inschrijven
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="mx-auto max-w-md">
        {header}
        <InfoBox>{event.status === 'gepland' ? MESSAGES.closed : 'Deze speelavond is al begonnen of afgelopen.'}</InfoBox>
      </div>
    );
  }

  const registerNew = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return;
    if (similar.length > 0 && !confirmNew) {
      setConfirmNew(true);
      return;
    }
    submit.mutate({ name: name.trim(), email: email.trim() || undefined, phone: phone.trim() || undefined, label: name.trim() });
  };

  return (
    <div className="mx-auto max-w-md">
      {header}
      <p className="mb-3 text-[13px] text-zinc-600">
        Schrijf je vooraf in, dan weten we op wie we mogen rekenen. Betalen en je aanwezig melden doe je ter plaatse, vóór {formatTime(registrationClosesAt(event))}.
      </p>

      {mode === 'search' ? (
        <div className="space-y-2">
          <Field label="Zoek je naam">
            <SearchInput autoFocus placeholder="Bv. Jan Peeters" value={query} onChange={(e) => setQuery(e.target.value)} />
          </Field>
          {query.trim().length >= 2 &&
            (matches.length > 0 ? (
              <List>
                {matches.map((p) => (
                  <button key={p.id} type="button" className={cx(rowClass, rowHover, 'justify-between')} onClick={() => setPicked(p)}>
                    <span className="truncate text-sm font-medium text-zinc-950">{displayName(p)}</span>
                    <span className="text-xs font-medium text-brand-700">Dit ben ik</span>
                  </button>
                ))}
              </List>
            ) : (
              <Empty>Geen speler gevonden met die naam.</Empty>
            ))}
          <Card className="flex items-center justify-between gap-3 p-2.5">
            <span className="text-[13px] text-zinc-600">Nog nooit meegespeeld, of sta je niet in de lijst?</span>
            <Button
              size="sm"
              onClick={() => {
                setMode('new');
                setName(query.trim());
                setConfirmNew(false);
              }}
            >
              Ik ben nieuw
            </Button>
          </Card>
        </div>
      ) : (
        <form className="space-y-3" onSubmit={registerNew}>
          <Field label="Je naam">
            <TextInput
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setConfirmNew(false);
              }}
              autoComplete="name"
              required
              maxLength={60}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Gsm (optioneel)">
              <TextInput type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" maxLength={30} />
            </Field>
            <Field label="E-mail (optioneel)">
              <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={120} />
            </Field>
          </div>
          <p className="text-2xs text-zinc-500">Je gsm-nummer en e-mailadres zijn enkel zichtbaar voor de organisatoren. Publiek staat enkel je naam.</p>
          {similar.length > 0 && (
            <InfoBox tone="amber">
              <p className="font-medium">Sta je hier misschien al tussen?</p>
              <div className="mt-1.5 space-y-1">
                {similar.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">{displayName(p)}</span>
                    <Button size="xs" variant="secondary" onClick={() => setPicked(p)}>
                      Dat ben ik
                    </Button>
                  </div>
                ))}
              </div>
              {confirmNew && <p className="mt-1.5 text-xs">Ben je toch iemand anders? Tik nog eens op “Inschrijven”.</p>}
            </InfoBox>
          )}
          {failure && <ErrorBox>{failure}</ErrorBox>}
          <div className="grid grid-cols-[1fr_2fr] gap-2">
            <Button variant="secondary" size="lg" onClick={() => setMode('search')}>
              Terug
            </Button>
            <Button type="submit" size="lg" disabled={submit.isPending || name.trim().length < 2}>
              {submit.isPending ? 'Even geduld…' : 'Inschrijven'}
            </Button>
          </div>
        </form>
      )}

      {mode === 'search' && failure && (
        <div className="mt-3">
          <ErrorBox>{failure}</ErrorBox>
        </div>
      )}

      <ConfirmModal
        open={picked !== null}
        title="Inschrijven?"
        confirmLabel="Ja, schrijf me in"
        busy={submit.isPending}
        onClose={() => setPicked(null)}
        onConfirm={() => picked && submit.mutate({ playerId: picked.id, label: displayName(picked) })}
      >
        Je schrijft je in als <b className="text-zinc-950">{picked ? displayName(picked) : ''}</b> voor {formatLongDate(event.event_date)}.
      </ConfirmModal>
    </div>
  );
}
