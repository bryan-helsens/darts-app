import type { ReactNode } from 'react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../data/auth';
import { SyncBadge } from '../components/SyncBadge';
import { Button, cx, Icon, Spinner, type IconName } from '../components/ui';

/**
 * Indeling: een smalle zwarte kop bovenaan. Op gsm staat de navigatie in een
 * tabbalk onderaan (zoals een app); vanaf tabletbreedte in de kop zelf.
 */

interface NavItem {
  to: string;
  label: string;
  /** Korter label voor de tabbalk onderaan. */
  short?: string;
  icon: IconName;
  end?: boolean;
  /** Extra paden waarvoor dit item actief is. */
  also?: string[];
  /** Enkel in de kop (desktop), niet in de tabbalk. */
  desktopOnly?: boolean;
}

function Logo({ to = '/' }: { to?: string }) {
  return (
    <NavLink to={to} className="flex items-center gap-2 font-semibold text-white">
      <img src="/favicon.svg" alt="" className="h-6 w-6" />
      <span className="text-[15px] leading-none tracking-tight">
        Sanapolis <span className="text-accent-500">Darts</span>
      </span>
    </NavLink>
  );
}

function isActive(item: NavItem, pathname: string) {
  const match = (p: string) => (item.end ? pathname === p : pathname === p || pathname.startsWith(`${p}/`));
  return match(item.to) || (item.also ?? []).some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function TopNav({ items }: { items: NavItem[] }) {
  const { pathname } = useLocation();
  return (
    <nav className="hidden h-full items-center gap-0.5 md:flex">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={cx(
            'rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors',
            isActive(item, pathname) ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white',
          )}
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

function TabBar({ items }: { items: NavItem[] }) {
  const { pathname } = useLocation();
  const visible = items.filter((i) => !i.desktopOnly);
  return (
    <nav
      className="no-print fixed inset-x-0 bottom-0 z-40 grid border-t border-zinc-200 bg-white/95 pt-1 backdrop-blur md:hidden"
      style={{ gridTemplateColumns: `repeat(${visible.length}, minmax(0, 1fr))`, paddingBottom: 'max(0.25rem, env(safe-area-inset-bottom))' }}
    >
      {visible.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={cx('flex h-12 flex-col items-center justify-center gap-0.5 text-[10px] font-medium', isActive(item, pathname) ? 'text-brand-600' : 'text-zinc-500')}
        >
          <Icon name={item.icon} className="h-5 w-5" />
          {item.short ?? item.label}
        </NavLink>
      ))}
    </nav>
  );
}

function Shell({ home, items, right, children }: { home?: string; items: NavItem[]; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col pb-tabbar md:pb-0">
      <header className="no-print sticky top-0 z-40 bg-ink">
        <div className="mx-auto flex h-12 max-w-5xl items-center justify-between gap-3 px-3 sm:px-4">
          <div className="flex items-center gap-5">
            <Logo to={home} />
            <TopNav items={items} />
          </div>
          <div className="flex items-center gap-1.5">{right}</div>
        </div>
      </header>
      {children}
      <TabBar items={items} />
    </div>
  );
}

const PUBLIC_NAV: NavItem[] = [
  { to: '/', label: 'Kalender', icon: 'calendar', end: true },
  { to: '/ranking', label: 'Ranking', icon: 'chart' },
  { to: '/uitslagen', label: 'Uitslagen', icon: 'trophy', also: ['/avond'] },
  { to: '/spelers', label: 'Spelers', icon: 'users' },
  { to: '/nieuw', label: 'Nieuw?', short: 'Info', icon: 'info', also: ['/reglement'] },
  { to: '/reglement', label: 'Reglement', icon: 'note', desktopOnly: true },
];

export function PublicLayout() {
  const { isStaff } = useAuth();
  return (
    <Shell
      items={PUBLIC_NAV}
      right={
        isStaff && (
          <NavLink to="/beheer" className="rounded-md bg-white/10 px-2 py-1 text-xs font-medium text-white hover:bg-white/20">
            Beheer
          </NavLink>
        )
      }
    >
      <main className="mx-auto w-full max-w-5xl flex-1 px-3 py-4 sm:px-4">
        <Outlet />
      </main>
      <footer className="no-print border-t border-zinc-200 py-4 text-center text-2xs text-zinc-500">
        <p>Brasserie ’t Oud Sanatorium · Sijsele · elke derde zaterdag van de maand</p>
        {!isStaff && (
          <p className="mt-1">
            <NavLink to="/login" className="underline hover:text-zinc-800">
              Inloggen voor organisatoren
            </NavLink>
          </p>
        )}
      </footer>
    </Shell>
  );
}

export function StaffLayout() {
  const { loading, session, isStaff, isAdmin, profile, signOut } = useAuth();
  const navigate = useNavigate();
  if (loading) return <Spinner />;
  if (!session) return <Navigate to="/login" replace />;
  if (!isStaff) {
    return (
      <div className="mx-auto max-w-sm p-6">
        <h1 className="mb-1 text-base font-semibold">Nog geen toegang</h1>
        <p className="mb-4 text-[13px] text-zinc-600">
          {profile?.role === 'geweigerd'
            ? 'Je aanvraag werd geweigerd. Neem contact op met een organisator.'
            : 'Je account is aangemaakt. Een beheerder moet je aanvraag nog goedkeuren.'}
        </p>
        <Button variant="secondary" onClick={() => void signOut()}>
          Afmelden
        </Button>
      </div>
    );
  }
  const items: NavItem[] = [
    { to: '/beheer', label: 'Overzicht', icon: 'home', end: true, also: ['/beheer/avond'] },
    { to: '/beheer/spelers', label: 'Spelers', icon: 'users' },
    { to: '/beheer/seizoenen', label: 'Seizoenen', icon: 'calendar' },
    ...(isAdmin ? [{ to: '/beheer/gebruikers', label: 'Gebruikers', icon: 'shield' } as NavItem] : []),
    { to: '/', label: 'Publieke site', short: 'Site', icon: 'globe', end: true },
  ];
  return (
    <Shell
      home="/beheer"
      items={items}
      right={
        <>
          <SyncBadge />
          <button
            type="button"
            aria-label="Afmelden"
            title="Afmelden"
            className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 hover:bg-white/10 hover:text-white"
            onClick={() => void signOut().then(() => navigate('/'))}
          >
            <Icon name="logout" />
          </button>
        </>
      }
    >
      <main className="mx-auto w-full max-w-5xl flex-1 px-3 py-4 sm:px-4">
        <Outlet />
      </main>
    </Shell>
  );
}
