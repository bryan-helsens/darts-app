import { Navigate, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../data/auth';
import { SyncBadge } from '../components/SyncBadge';
import { Button, cx, Spinner } from '../components/ui';

function Logo() {
  return (
    <NavLink to="/" className="flex items-center gap-2 font-bold text-white">
      <img src="/favicon.svg" alt="" className="h-8 w-8" />
      <span className="text-lg leading-tight">Sanapolis Darts</span>
    </NavLink>
  );
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  cx('rounded-lg px-3 py-2 text-sm font-semibold whitespace-nowrap', isActive ? 'bg-white/20 text-white' : 'text-white/80 hover:text-white');

export function PublicLayout() {
  const { isStaff } = useAuth();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="no-print bg-brand-900">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <Logo />
          {isStaff && (
            <NavLink to="/beheer" className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-brand-900">
              Beheer
            </NavLink>
          )}
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-3 pb-2">
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
            Nieuw? Zo werkt het
          </NavLink>
          <NavLink to="/reglement" className={navClass}>
            Reglement
          </NavLink>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <Outlet />
      </main>
      <footer className="no-print border-t border-stone-200 py-6 text-center text-sm text-stone-500">
        <p>Brasserie ’t Oud Sanatorium · Sijsele · elke derde zaterdag van de maand</p>
        {!isStaff && (
          <p className="mt-2">
            <NavLink to="/login" className="underline">
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
        <h1 className="mb-2 text-xl font-bold">Nog geen toegang</h1>
        <p className="mb-4 text-stone-600">
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
      <header className="no-print bg-brand-900">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <Logo />
          <div className="flex items-center gap-2">
            <SyncBadge />
            <button type="button" className="text-sm text-white/80 underline" onClick={() => void signOut().then(() => navigate('/'))}>
              Afmelden
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-3 pb-2">
          <NavLink to="/beheer" end className={navClass}>
            Overzicht
          </NavLink>
          <NavLink to="/beheer/spelers" className={navClass}>
            Spelers
          </NavLink>
          <NavLink to="/beheer/seizoenen" className={navClass}>
            Seizoenen & avonden
          </NavLink>
          {isAdmin && (
            <NavLink to="/beheer/gebruikers" className={navClass}>
              Gebruikers
            </NavLink>
          )}
          <NavLink to="/" className={navClass}>
            Publieke site
          </NavLink>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
