/**
 * Bouwstenen van de interface: licht, compact en modern. Blauw als
 * hoofdkleur, rood als accent, zwart voor de kop. Basistekst 14 px;
 * invoervelden 16 px op gsm zodat iOS niet inzoomt.
 */

import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { dateParts } from '../../lib/time';

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success' | 'dark';
type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const variants: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white shadow-xs hover:bg-brand-700 disabled:bg-zinc-200 disabled:text-zinc-400 disabled:shadow-none',
  secondary: 'bg-white text-zinc-800 shadow-xs ring-1 ring-inset ring-zinc-200 hover:bg-zinc-50 disabled:text-zinc-400',
  danger: 'bg-accent-600 text-white shadow-xs hover:bg-accent-700 disabled:bg-zinc-200 disabled:text-zinc-400 disabled:shadow-none',
  ghost: 'bg-transparent text-brand-700 hover:bg-brand-50 disabled:text-zinc-400',
  success: 'bg-brand-600 text-white shadow-xs hover:bg-brand-700 disabled:bg-zinc-200 disabled:text-zinc-400 disabled:shadow-none',
  dark: 'bg-ink text-white hover:bg-zinc-800 disabled:bg-zinc-200 disabled:text-zinc-400',
};
const sizes: Record<Size, string> = {
  xs: 'h-7 px-2 text-xs rounded-md',
  sm: 'h-8 px-2.5 text-[13px] rounded-md',
  md: 'h-9 px-3 text-sm rounded-md',
  lg: 'h-10 px-4 text-sm rounded-lg',
  xl: 'h-11 px-5 text-[15px] rounded-lg',
};

export function Button({
  variant = 'primary',
  size = 'md',
  block,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; block?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        'inline-flex shrink-0 items-center justify-center gap-1.5 font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 active:scale-[0.98] disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        block && 'w-full',
        className,
      )}
    />
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('rounded-lg border border-zinc-200/80 bg-white p-3 shadow-xs', className)}>{children}</div>;
}

/** Lijst met dunne scheidingslijnen (rijen: zie `rowClass`). */
export function List({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('divide-y divide-zinc-100 overflow-hidden rounded-lg border border-zinc-200/80 bg-white shadow-xs', className)}>{children}</div>;
}

/** Standaardrij in een `List`; `rowHover` erbij voor klikbare rijen. */
export const rowClass = 'flex w-full items-center gap-2.5 px-3 py-2 text-left';
export const rowHover = 'transition-colors hover:bg-zinc-50 active:bg-zinc-100';

export function PageTitle({ children, sub, actions }: { children: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div className="min-w-0">
        <h1 className="text-lg leading-tight font-semibold tracking-tight text-zinc-950">{children}</h1>
        {sub && <p className="mt-0.5 text-xs text-zinc-500">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-1.5">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mt-5 mb-1.5 flex items-center justify-between gap-2">
      <h2 className="text-2xs font-semibold tracking-wider text-zinc-500 uppercase">{children}</h2>
      {actions}
    </div>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-600">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-2xs text-zinc-500">{hint}</span>}
      {error && <span className="mt-1 block text-2xs text-accent-700">{error}</span>}
    </label>
  );
}

const inputClass =
  'h-9 w-full rounded-md border border-zinc-300 bg-white px-2.5 text-base text-zinc-900 shadow-xs outline-none placeholder:text-zinc-400 focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15 sm:text-sm';

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputClass, className)} />;
}

/** Zoekveld met vergrootglas. */
export function SearchInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={cx('relative', className)}>
      <Icon name="search" className="pointer-events-none absolute top-2.5 left-2.5 text-zinc-400" />
      <input type="search" {...props} className={cx(inputClass, 'pl-8')} />
    </div>
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputClass, 'pr-7', className)} />;
}

export function Stepper({ value, onChange, min = 0, max = 99, label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; label?: string }) {
  const btn = 'flex h-9 w-9 items-center justify-center text-base text-zinc-600 hover:bg-zinc-50 disabled:text-zinc-300';
  return (
    <div className="inline-flex items-center overflow-hidden rounded-md bg-white shadow-xs ring-1 ring-zinc-300 ring-inset" aria-label={label}>
      <button type="button" className={btn} onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="minder">
        −
      </button>
      <span className="min-w-7 text-center text-sm font-semibold tabular-nums">{value}</span>
      <button type="button" className={btn} onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="meer">
        +
      </button>
    </div>
  );
}

export type Tone = 'stone' | 'red' | 'amber' | 'blue' | 'dark';

export function Badge({ children, tone = 'stone' }: { children: ReactNode; tone?: Tone }) {
  const tones: Record<Tone, string> = {
    stone: 'bg-zinc-100 text-zinc-600',
    red: 'bg-accent-50 text-accent-700 ring-1 ring-inset ring-accent-100',
    amber: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200/70',
    blue: 'bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100',
    dark: 'bg-ink text-white',
  };
  return <span className={cx('inline-flex items-center gap-1 rounded px-1.5 py-px text-2xs font-medium whitespace-nowrap', tones[tone])}>{children}</span>;
}

/** Klein rood "live"-label met pulserend bolletje. */
export function LiveBadge({ children = 'live' }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-accent-600 px-1.5 py-px text-2xs font-semibold whitespace-nowrap text-white uppercase">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
      {children}
    </span>
  );
}

export function Spinner({ label = 'Laden…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-4 text-xs text-zinc-500" role="status">
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-300 border-t-brand-600" />
      {label}
    </div>
  );
}

export function ErrorBox({ error, children }: { error?: unknown; children?: ReactNode }) {
  const msg = children ?? (error instanceof Error ? error.message : error ? String(error) : 'Er ging iets mis.');
  return <div className="rounded-md border border-accent-200 bg-accent-50 px-2.5 py-2 text-[13px] text-accent-800">{msg}</div>;
}

export function InfoBox({ children, tone = 'blue' }: { children: ReactNode; tone?: 'blue' | 'amber' | 'red' | 'dark' }) {
  const tones = {
    blue: 'border-brand-100 bg-brand-50/70 text-zinc-800',
    amber: 'border-amber-200/80 bg-amber-50 text-amber-900',
    red: 'border-accent-200 bg-accent-50 text-accent-900',
    dark: 'border-ink bg-ink text-white',
  };
  return <div className={cx('rounded-md border px-2.5 py-2 text-[13px]', tones[tone])}>{children}</div>;
}

/** Rij kerncijfers in één kaart (bv. aanwezig · betaald · prijzenpot). */
export function Stats({ items, dark }: { items: Array<{ label: ReactNode; value: ReactNode; sub?: ReactNode }>; dark?: boolean }) {
  return (
    <div
      className={cx('grid divide-x rounded-lg text-center', dark ? 'divide-white/10 bg-ink text-white' : 'divide-zinc-100 border border-zinc-200/80 bg-white shadow-xs')}
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((c, i) => (
        <div key={i} className="px-2 py-2">
          <div className={cx('text-lg leading-6 font-semibold tabular-nums', !dark && 'text-zinc-950')}>{c.value}</div>
          <div className={cx('text-2xs', dark ? 'text-zinc-400' : 'text-zinc-500')}>{c.label}</div>
          {c.sub && <div className={cx('text-2xs', dark ? 'text-zinc-500' : 'text-zinc-400')}>{c.sub}</div>}
        </div>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-zinc-300 px-3 py-5 text-center text-[13px] text-zinc-500">{children}</p>;
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/50 backdrop-blur-[2px] sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="safe-bottom max-h-[92dvh] w-full overflow-y-auto rounded-t-xl bg-white px-4 pt-2 shadow-xl sm:max-w-md sm:rounded-xl sm:pt-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-zinc-200 sm:hidden" />
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="truncate text-base font-semibold text-zinc-950">{title}</h2>
          <button
            type="button"
            className="-mr-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
            onClick={onClose}
            aria-label="Sluiten"
          >
            <Icon name="x" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmModal({
  open,
  title,
  children,
  confirmLabel = 'Bevestigen',
  danger,
  busy,
  disabled,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  disabled?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        <div className="text-[13px] text-zinc-600">{children}</div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
          <Button variant="secondary" size="lg" onClick={onClose}>
            Annuleren
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} size="lg" onClick={onConfirm} disabled={busy || disabled}>
            {busy ? 'Even geduld…' : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: Array<{ id: T; label: ReactNode }> }) {
  return (
    <div className="no-print -mx-3 mb-3 overflow-x-auto border-b border-zinc-200 px-3 [scrollbar-width:none] sm:mx-0 sm:px-0">
      <div className="flex min-w-max gap-0.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={cx(
              '-mb-px border-b-2 px-2.5 py-2 text-[13px] font-medium whitespace-nowrap transition-colors',
              t.id === value ? 'border-brand-600 text-zinc-950' : 'border-transparent text-zinc-500 hover:text-zinc-900',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Gesegmenteerde keuze (bv. filters of inloggen/aanvragen). */
export function Segmented<T extends string>({ value, onChange, options, block }: { value: T; onChange: (v: T) => void; options: Array<{ id: T; label: ReactNode }>; block?: boolean }) {
  return (
    <div
      className={cx('rounded-md bg-zinc-200/60 p-0.5', block ? 'grid' : 'inline-flex')}
      style={block ? { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` } : undefined}
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={o.id === value}
          onClick={() => onChange(o.id)}
          className={cx(
            'h-7 rounded-[5px] px-2.5 text-xs font-medium whitespace-nowrap transition-colors',
            o.id === value ? 'bg-white text-zinc-950 shadow-xs' : 'text-zinc-500 hover:text-zinc-900',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Datumtegeltje zoals op een kalender: maand boven, dag eronder. */
export function DateTile({ date, tone = 'light' }: { date: string; tone?: 'light' | 'dark' | 'muted' }) {
  const { day, month } = dateParts(date);
  return (
    <span
      className={cx(
        'flex w-10 shrink-0 flex-col items-center self-start rounded-md py-1 leading-none',
        tone === 'dark' ? 'bg-white/10 text-white' : tone === 'muted' ? 'bg-zinc-100 text-zinc-400' : 'bg-brand-50 text-brand-700',
      )}
    >
      <span className="text-[10px] font-semibold uppercase">{month}</span>
      <span className="mt-0.5 text-base font-semibold tabular-nums">{day}</span>
    </span>
  );
}

/** Kleine pictogrammen (lijnstijl), zonder externe bibliotheek. */
const ICONS = {
  calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  clock: 'M12 7v5l3 2M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z',
  euro: 'M18 7a7 7 0 1 0 0 10M4 10h10M4 14h10',
  pin: 'M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  target: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3',
  note: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5',
  chevron: 'M9 18l6-6-6-6',
  back: 'M15 18l-6-6 6-6',
  print: 'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  chart: 'M3 3v18h18M7 16v-4M12 16V8M17 16v-7',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  check: 'M20 6 9 17l-5-5',
  plus: 'M12 5v14M5 12h14',
  x: 'M18 6 6 18M6 6l12 12',
  external: 'M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  undo: 'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={cx('h-4 w-4 shrink-0', className)} aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

export { cx };
