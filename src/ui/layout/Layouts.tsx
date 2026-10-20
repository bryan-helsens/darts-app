import type { ReactNode } from 'react';
import { Navigate, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../data/auth';
import { SyncBadge } from '../components/SyncBadge';
import { Button, cx, Spinner } from '../components/ui';

function Logo({ to = '/' }: { to?: string }) {
  return (
    <NavLink to={to} className="flex items-center gap-2 font-bold text-white">
      <img src="/favicon.svg" alt="" className="h-7 w-7" />
      <span className="text-base leading-none tracking-tight">
        Sanapolis <span className="text-accent-500">Darts</span>
      </span>
    </NavLink>
  );
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  cx(
    'relative px-2.5 py-2.5 text-sm font-medium whitespace-nowrap transition-colors',
    isActive ? 'text-white after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent-500' : 'text-zinc-400 hover:text-white',
  );

function Header({ nav, right, home }: { nav: ReactNode; right?: ReactNode; home?: string }) {
  return (
    // Op gsm scrolt de kop mee weg (meer plaats); vanaf tabletbreedte blijft hij staan.
    <header className="no-print z-40 bg-ink md:sticky md:top-0">
      <div className="mx-auto flex h-12 max-w-5xl items-center justify-between gap-3 px-4 md:h-14">
        <Logo to={home} />
        <nav className="hidden h-full items-center md:flex">{nav}</nav>
        <div className="flex items-center gap-2">{right}</div>
      </div>
      <nav className="mx-auto flex max-w-5xl overflow-x-auto px-2 md:hidden">{nav}</nav>
    </header>
  );
}

export function PublicLayout() {
  const { isStaff } = useAuth();
  return (
    <div className="flex min-h-dvh flex-col">
      <Header
        right={
          isStaff && (
            <NavLink to="/beheer" className="rounded-md bg-white/10 px-2.5 py-1 text-xs font-semibold text-white hover:bg-white/20">
              Beheer
            </NavLink>
          )
        }
        nav={
          <>
            <NavLink to="/" end className={navClass}>
              Kalender
            </NavLink>
            <NavLink to="/ranking" className={navClass}>
              Ranking
            </NavLink>
            <NavLink to="/uitslagen" className={navClass}>
              Uitslagen
            </NavLink>
            <NavLink to="/spelers" className={navClass}>
              Spelers
            </NavLink>
            <NavLink to="/nieuw" className={navClass}>
              Nieuw?
            </NavLink>
            <NavLink to="/reglement" className={navClass}>
              Reglement
            </NavLink>
          </>
        }
      />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-5">
        <Outlet />
      </main>
      <footer className="no-print border-t border-zinc-200 bg-white py-5 text-center text-xs text-zinc-500">
        <p>Brasserie ’t Oud Sanatorium · Sijsele · elke derde zaterdag van de maand</p>
        {!isStaff && (
          <p className="mt-1.5">
            <NavLink to="/login" className="underline hover:text-zinc-800">
              Inloggen voor organisatoren
            </NavLink>
          </p>
        )}
      </footer>
    </div>
  );
}

export function StaffLayout() {
  const { loading, session, isStaff, isAdmin, profile, signOut } = useAuth();
  const navigate = useNavigate();
  if (loading) return <Spinner />;
  if (!session) return <Navigate to="/login" replace />;
  if (!isStaff) {
    return (
      <div className="mx-auto max-w-md p-6">
        <h1 className="mb-2 text-lg font-bold">Nog geen toegang</h1>
        <p className="mb-4 text-sm text-zinc-600">
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
  return (
    <div className="flex min-h-dvh flex-col">
      <Header
        home="/beheer"
        right={<SyncBadge />}
        nav={
          <>
            <NavLink to="/beheer" end className={navClass}>
              Overzicht
            </NavLink>
            <NavLink to="/beheer/spelers" className={navClass}>
              Spelers
            </NavLink>
            <NavLink to="/beheer/seizoenen" className={navClass}>
              Seizoenen
            </NavLink>
            {isAdmin && (
              <NavLink to="/beheer/gebruikers" className={navClass}>
                Gebruikers
              </NavLink>
            )}
            <NavLink to="/" className={navClass}>
              Publieke site
            </NavLink>
            <button type="button" className={navClass({ isActive: false })} onClick={() => void signOut().then(() => navigate('/'))}>
              Afmelden
            </button>
          </>
        }
      />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-5">
        <Outlet />
      </main>
    </div>
  );
}
