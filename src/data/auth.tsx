import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ProfileRow, Role } from './rows';
import { isConfigured, supabase } from './supabase';

interface AuthState {
  loading: boolean;
  session: Session | null;
  profile: ProfileRow | null;
  role: Role | null;
  isStaff: boolean;
  isAdmin: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(isConfigured);

  const loadProfile = async (s: Session | null) => {
    if (!s) {
      setProfile(null);
      return;
    }
    const { data } = await supabase.from('profiles').select('*').eq('user_id', s.user.id).maybeSingle();
    if (data) {
      setProfile(data as ProfileRow);
      try {
        localStorage.setItem('sanapolis-darts-profile', JSON.stringify(data));
      } catch {
        // geen opslag beschikbaar
      }
    } else {
      // Offline: laatst gekende profiel gebruiken, zodat de wedstrijdleider kan blijven werken.
      try {
        const cached = JSON.parse(localStorage.getItem('sanapolis-darts-profile') ?? 'null') as ProfileRow | null;
        setProfile(cached?.user_id === s.user.id ? cached : null);
      } catch {
        setProfile(null);
      }
    }
  };

  useEffect(() => {
    if (!isConfigured) return;
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadProfile(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      void loadProfile(s);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(() => {
    const role = profile?.role ?? null;
    return {
      loading,
      session,
      profile,
      role,
      isStaff: role === 'admin' || role === 'leider',
      isAdmin: role === 'admin',
      refreshProfile: () => loadProfile(session),
      signOut: async () => {
        await supabase.auth.signOut();
        setProfile(null);
      },
    };
  }, [loading, session, profile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth buiten AuthProvider');
  return ctx;
}
