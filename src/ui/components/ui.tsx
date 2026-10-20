/** Eenvoudige, grote bouwstenen (mobile-first, met één duim te bedienen). */

import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
type Size = 'sm' | 'md' | 'lg' | 'xl';

const variants: Record<Variant, string> = {
  primary: 'bg-brand-800 text-white hover:bg-brand-900 disabled:bg-stone-300',
  secondary: 'bg-white text-stone-900 border border-stone-300 hover:bg-stone-100 disabled:text-stone-400',
  danger: 'bg-red-700 text-white hover:bg-red-800 disabled:bg-stone-300',
  ghost: 'bg-transparent text-brand-800 hover:bg-brand-50 disabled:text-stone-400',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-stone-300',
};
const sizes: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm rounded-lg',
  md: 'px-4 py-2.5 text-base rounded-xl',
  lg: 'px-5 py-3.5 text-lg rounded-xl',
  xl: 'px-6 py-5 text-2xl rounded-2xl',
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
        'inline-flex items-center justify-center gap-2 font-semibold transition-colors active:scale-[0.98] disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        block && 'w-full',
        className,
      )}
    />
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('rounded-2xl border border-stone-200 bg-white p-4 shadow-sm', className)}>{children}</div>;
}

export function PageTitle({ children, sub, actions }: { children: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-brand-900">{children}</h1>
        {sub && <p className="mt-1 text-stone-600">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mt-6 mb-2 flex items-center justify-between gap-2">
      <h2 className="text-lg font-semibold text-stone-800">{children}</h2>
      {actions}
    </div>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-stone-700">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-sm text-stone-500">{hint}</span>}
      {error && <span className="mt-1 block text-sm text-red-700">{error}</span>}
    </label>
  );
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        'w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-700 focus:ring-2 focus:ring-brand-100',
        className,
      )}
    />
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cx('w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-700', className)}
    />
  );
}

export function Stepper({ value, onChange, min = 0, max = 99, label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; label?: string }) {
  return (
    <div className="inline-flex items-center gap-2" aria-label={label}>
      <Button variant="secondary" size="md" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="minder">
        −
      </Button>
      <span className="min-w-8 text-center text-xl font-bold tabular-nums">{value}</span>
      <Button variant="secondary" size="md" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="meer">
        +
      </Button>
    </div>
  );
}

export function Badge({ children, tone = 'stone' }: { children: ReactNode; tone?: 'stone' | 'green' | 'red' | 'amber' | 'blue' }) {
  const tones = {
    stone: 'bg-stone-100 text-stone-700',
    green: 'bg-emerald-100 text-emerald-800',
    red: 'bg-red-100 text-red-800',
    amber: 'bg-amber-100 text-amber-900',
    blue: 'bg-sky-100 text-sky-800',
  };
  return <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-medium', tones[tone])}>{children}</span>;
}

export function Spinner({ label = 'Laden…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-8 text-stone-500" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-brand-700" />
      {label}
    </div>
  );
}

export function ErrorBox({ error, children }: { error?: unknown; children?: ReactNode }) {
  const msg = children ?? (error instanceof Error ? error.message : error ? String(error) : 'Er ging iets mis.');
  return <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">{msg}</div>;
}

export function InfoBox({ children, tone = 'blue' }: { children: ReactNode; tone?: 'blue' | 'amber' | 'green' }) {
  const tones = {
    blue: 'border-sky-200 bg-sky-50 text-sky-900',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  };
  return <div className={cx('rounded-xl border p-3', tones[tone])}>{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-stone-500">{children}</p>;
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl sm:max-w-lg sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-xl font-bold text-brand-900">{title}</h2>
          <button type="button" className="text-2xl leading-none text-stone-400 hover:text-stone-700" onClick={onClose} aria-label="Sluiten">
            ×
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
        <div className="text-stone-700">{children}</div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
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
    <div className="no-print -mx-4 mb-4 overflow-x-auto px-4">
      <div className="flex min-w-max gap-1 rounded-2xl bg-stone-200/70 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={cx(
              'rounded-xl px-4 py-2.5 text-base font-semibold whitespace-nowrap',
              t.id === value ? 'bg-white text-brand-900 shadow' : 'text-stone-600 hover:text-stone-900',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export { cx };
