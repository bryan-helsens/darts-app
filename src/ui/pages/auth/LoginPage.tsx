import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../../data/auth';
import { supabase } from '../../../data/supabase';
import { authErrorMessage } from '../../../lib/authErrors';
import { Button, Card, ErrorBox, Field, InfoBox, Segmented, TextInput } from '../../components/ui';

export function LoginPage() {
  const { session, isStaff, refreshProfile } = useAuth();
  const [mode, setMode] = useState<'login' | 'aanvraag'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (session && isStaff) return <Navigate to="/beheer" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (err) throw new Error(authErrorMessage(err));
        await refreshProfile();
      } else {
        if (password.length < 8) throw new Error('Kies een wachtwoord van minstens 8 tekens.');
        const { error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: name.trim() } },
        });
        if (err) throw new Error(authErrorMessage(err));
        setDone(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-sm pt-2 sm:pt-6">
      <h1 className="text-xl font-bold tracking-tight text-zinc-950 sm:text-2xl">Voor organisatoren</h1>
      <p className="mb-4 text-sm text-zinc-500">Wedstrijdleiders en beheerders loggen hier in.</p>
      <div className="mb-3">
        <Segmented
          block
          value={mode}
          onChange={(m) => {
            setMode(m);
            setError(null);
          }}
          options={[
            { id: 'login', label: 'Inloggen' },
            { id: 'aanvraag', label: 'Account aanvragen' },
          ]}
        />
      </div>
      <Card>
        {done ? (
          <InfoBox>
            Je account is aangemaakt. Een beheerder moet je aanvraag nog goedkeuren; daarna kan je inloggen. Werd er een e-mail verstuurd? Bevestig dan eerst je
            e-mailadres.
          </InfoBox>
        ) : (
          <form className="space-y-3" onSubmit={submit}>
            {mode === 'aanvraag' && (
              <Field label="Je naam">
                <TextInput value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
              </Field>
            )}
            <Field label="E-mailadres">
              <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </Field>
            <Field label="Wachtwoord" hint={mode === 'aanvraag' ? 'Minstens 8 tekens.' : undefined}>
              <TextInput
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </Field>
            {error && <ErrorBox>{error}</ErrorBox>}
            <Button type="submit" size="lg" block disabled={busy}>
              {busy ? 'Even geduld…' : mode === 'login' ? 'Inloggen' : 'Account aanvragen'}
            </Button>
            {mode === 'login' && <p className="text-center text-xs text-zinc-500">Je blijft ingelogd op dit toestel tot je afmeldt.</p>}
          </form>
        )}
      </Card>
      {session && !isStaff && (
        <p className="mt-4 text-sm text-zinc-600">Je bent ingelogd, maar je account is nog niet goedgekeurd door een beheerder.</p>
      )}
    </div>
  );
}
