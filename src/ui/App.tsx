import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useEffect } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { isNetworkError, type EventBundle } from '../data/api';
import { AuthProvider } from '../data/auth';
import { outbox } from '../data/outbox';
import { keys } from '../data/queries';
import type { RegistrationRow } from '../data/rows';
import { isConfigured } from '../data/supabase';
import { PublicLayout, StaffLayout } from './layout/Layouts';
import { LoginPage } from './pages/auth/LoginPage';
import { EveningPage } from './pages/evening/EveningPage';
import { PrintPage } from './pages/print/PrintPage';
import { NewcomersPage, RulesPage } from './pages/public/InfoPages';
import { EventPublicPage, HomePage, PlayerPage, PlayersPage, RankingPage, ResultsPage } from './pages/public/PublicPages';
import { RegisterPage } from './pages/public/RegisterPage';
import { ScorePage } from './pages/ScorePage';
import { SetupPage } from './pages/SetupPage';
import { TvPage } from './pages/tv/TvPage';
import { AuditPage } from './pages/staff/AuditPage';
import { DashboardPage } from './pages/staff/DashboardPage';
import { PlayersAdminPage } from './pages/staff/PlayersAdminPage';
import { SeasonDetailPage, SeasonsPage } from './pages/staff/SeasonsPage';
import { UsersPage } from './pages/staff/UsersPage';
import { UpdateBanner } from './pwa/UpdateBanner';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Altijd verversen bij het openen van een scherm; de bewaarde cache dient enkel om offline iets te tonen.
      staleTime: 0,
      gcTime: 7 * 24 * 60 * 60 * 1000,
      networkMode: 'offlineFirst',
      retry: (count, error) => !isNetworkError(error) && count < 2,
    },
    mutations: { networkMode: 'always' },
  },
});

const persister = createSyncStoragePersister({
  storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  key: 'sanapolis-darts-cache',
  throttleTime: 2000,
});

const PRIVATE_KEYS = new Set(['contacts', 'pin', 'profiles', 'audit']);

const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/avond/:eventId', element: <EventPublicPage /> },
      { path: '/uitslagen', element: <ResultsPage /> },
      { path: '/ranking', element: <RankingPage /> },
      { path: '/ranking/:seasonId', element: <RankingPage /> },
      { path: '/spelers', element: <PlayersPage /> },
      { path: '/spelers/:playerId', element: <PlayerPage /> },
      { path: '/reglement', element: <RulesPage /> },
      { path: '/nieuw', element: <NewcomersPage /> },
      { path: '/inschrijven/:eventId', element: <RegisterPage /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/score', element: <ScorePage /> },
      { path: '/score/:eventId', element: <ScorePage /> },
    ],
  },
  {
    path: '/beheer',
    element: <StaffLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'spelers', element: <PlayersAdminPage /> },
      { path: 'seizoenen', element: <SeasonsPage /> },
      { path: 'seizoenen/:seasonId', element: <SeasonDetailPage /> },
      { path: 'gebruikers', element: <UsersPage /> },
      { path: 'logboek', element: <AuditPage /> },
      { path: 'avond/:eventId', element: <EveningPage /> },
    ],
  },
  { path: '/print/avond/:eventId', element: <PrintPage /> },
  { path: '/tv', element: <TvPage /> },
  { path: '*', element: <Navigate to="/" replace /> },
]);

/**
 * Na elke gesynchroniseerde wijziging: de cache meteen bijwerken (zodat het
 * scherm niet even terugvalt op de oude toestand) en daarna verversen.
 */
function OutboxRefresher() {
  useEffect(
    () =>
      outbox.onSynced((item) => {
        const eventId = item.data.eventId;
        if (item.kind === 'registration') {
          queryClient.setQueryData<RegistrationRow[]>(keys.registrations(eventId), (rows) => {
            if (!rows) return rows;
            const existing = rows.find((r) => r.player_id === item.data.playerId);
            if (existing) return rows.map((r) => (r === existing ? { ...r, ...item.data.patch } : r));
            const now = new Date().toISOString();
            return [
              ...rows,
              { event_id: eventId, player_id: item.data.playerId, preregistered: false, present: false, paid: false, withdrawn_at: null, created_at: now, updated_at: now, ...item.data.patch },
            ];
          });
        } else {
          const { code, legs1, legs2 } = item.data;
          queryClient.setQueryData<EventBundle>(keys.event(eventId), (bundle) =>
            bundle
              ? {
                  ...bundle,
                  matches: bundle.matches.map((m) =>
                    m.code === code && m.winner_id === null
                      ? { ...m, legs1, legs2, winner_id: legs1 > legs2 ? m.player1_id : m.player2_id, finished_at: new Date().toISOString() }
                      : m,
                  ),
                }
              : bundle,
          );
        }
        void queryClient.invalidateQueries({ queryKey: keys.event(eventId) });
        void queryClient.invalidateQueries({ queryKey: keys.registrations(eventId) });
        void queryClient.invalidateQueries({ queryKey: keys.counts });
      }),
    [],
  );
  return null;
}

export function App() {
  if (!isConfigured) return <SetupPage />;
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        buster: 'v1',
        // Gevoelige gegevens (contactgegevens, pincode, gebruikers, audit) nooit op het toestel bewaren.
        dehydrateOptions: { shouldDehydrateQuery: (q) => q.state.status === 'success' && !PRIVATE_KEYS.has(String(q.queryKey[0])) },
      }}
    >
      <AuthProvider>
        <OutboxRefresher />
        <RouterProvider router={router} />
        <UpdateBanner />
      </AuthProvider>
    </PersistQueryClientProvider>
  );
}
