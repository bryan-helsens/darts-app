import { useEffect, useState } from 'react';
import { isNetworkError } from '../../data/api';
import { PUSH_KINDS, type PushKind } from '../../data/push';
import { Button, cx, ErrorBox, Icon } from '../components/ui';
import { devicePushState, disablePush, enablePush, pushSupport, type DevicePushState } from './push';

const KIND_LABELS: Record<PushKind, string> = {
  start: 'Mijn match begint (met het bord)',
  next: 'Mijn match komt eraan',
  scorer: 'Ik moet schrijven',
  reminder: 'Herinnering op de dag van een speelavond',
};

/**
 * Pushmeldingen aanzetten op het spelersprofiel: één keer op je eigen gsm,
 * daarna voor alle avonden. Eén toestel krijgt meldingen voor één speler.
 */
export function PushCard({ player, name, className }: { player: { id: string; name: string }; name: (id: string) => string; className?: string }) {
  const support = pushSupport();
  const [state, setState] = useState<DevicePushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (support !== 'ok') return;
    let alive = true;
    devicePushState()
      .then((s) => alive && setState(s))
      .catch(() => alive && setState({ permission: Notification.permission, status: null }));
    return () => {
      alive = false;
    };
  }, [support]);

  if (support === 'disabled' || support === 'unsupported') return null;

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      setState(await devicePushState());
    } catch (e) {
      setError(isNetworkError(e) ? 'Geen verbinding. Probeer het opnieuw zodra je internet hebt.' : e instanceof Error ? e.message : String(e));
      // Terug naar wat er echt bewaard is (bv. na een vinkje dat niet doorkwam).
      setState(await devicePushState().catch(() => state));
    } finally {
      setBusy(false);
    }
  };

  const mine = state?.status?.player_id === player.id ? state.status : null;
  const other = state?.status && !mine ? state.status.player_id : null;

  let body;
  if (support === 'install') {
    body = <p className="text-xs text-zinc-600">Op een iPhone: zet eerst de app op je beginscherm (Safari → Deel → Zet op beginscherm), open ze daar en zet hier de meldingen aan.</p>;
  } else if (!state) {
    return null;
  } else if (state.permission === 'denied') {
    body = <p className="text-xs text-zinc-600">Meldingen zijn geblokkeerd voor deze site. Zet ze aan in de instellingen van je browser (of van de app) en kom dan terug.</p>;
  } else if (mine) {
    const toggle = (kind: PushKind, on: boolean) => {
      const kinds = PUSH_KINDS.filter((k) => (k === kind ? on : mine.kinds.includes(k)));
      // Het vinkje meteen tonen; de server volgt.
      setState({ ...state, status: { ...mine, kinds } });
      void run(() => (kinds.length > 0 ? enablePush(player.id, kinds) : disablePush()));
    };
    body = (
      <>
        <p className="text-xs text-zinc-600">Staan aan op dit toestel. Je krijgt een melding als:</p>
        <div className="mt-1.5 space-y-1">
          {PUSH_KINDS.map((kind) => (
            <label key={kind} className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={mine.kinds.includes(kind)} disabled={busy} onChange={(e) => toggle(kind, e.target.checked)} />
              {KIND_LABELS[kind]}
            </label>
          ))}
        </div>
        <Button variant="ghost" size="sm" className="mt-2 -ml-2" disabled={busy} onClick={() => void run(disablePush)}>
          Meldingen uitzetten
        </Button>
      </>
    );
  } else if (other) {
    body = (
      <>
        <p className="text-xs text-zinc-600">Dit toestel krijgt meldingen voor {name(other)}. Een toestel krijgt meldingen voor één speler.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} onClick={() => void run(() => enablePush(player.id, state.status?.kinds ?? PUSH_KINDS))}>
            Meldingen voor {player.name}
          </Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => void run(disablePush)}>
            Uitzetten
          </Button>
        </div>
      </>
    );
  } else {
    body = (
      <>
        <p className="text-xs text-zinc-600">Ben jij {player.name}? Krijg op deze gsm een melding als je match begint, als je moet schrijven en op de dag van een speelavond.</p>
        <Button size="sm" className="mt-2" disabled={busy} onClick={() => void run(() => enablePush(player.id, PUSH_KINDS))}>
          Meldingen aanzetten
        </Button>
      </>
    );
  }

  return (
    <div data-push-card className={cx('flex items-start gap-3 rounded-lg border border-zinc-200/80 bg-white p-3 shadow-xs', className)}>
      <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', mine ? 'bg-brand-600 text-white' : 'bg-zinc-100 text-zinc-500')}>
        <Icon name="bell" className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-zinc-950">Meldingen op je gsm</div>
        {body}
        {error && (
          <div className="mt-2">
            <ErrorBox>{error}</ErrorBox>
          </div>
        )}
      </div>
    </div>
  );
}
