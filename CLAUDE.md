# CLAUDE.md: Sanapolis Darts

Webapp voor het maandelijkse dartstoernooi in Brasserie 't Oud Sanatorium (Sijsele). Ze leidt de speelavond (check-in → poules → A/B-schema → uitslag), houdt een seizoensranking bij en toont alles publiek. De gebruikers zijn vrijwilligers zonder technische kennis, op gsm, met mogelijk slechte wifi. De volledige UI is in het Nederlands (Vlaams).

## Commando's

| Commando | Wat |
|---|---|
| `npm run dev` | Dev-server (gebruikt `.env.local` voor Supabase) |
| `npm run local:supabase [-- --seed]` | Lokale Supabase-nabootsing op :54321 (PGlite), optioneel met demo-data |
| `npm run dev:local` | Dev-server tegen de lokale nabootsing |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm test` | Vitest: engine (incl. matrix 6–40 spelers × 4–8 borden), data, PGlite-databasetests (±45 s) |
| `npx vitest run src/engine/standings.test.ts` | Eén testbestand |
| `npm run test:e2e` | Playwright: volledige avond door de UI (start zelf de lokale server en Vite) |
| `npm run build` | Productiebuild naar `dist/` |
| `npm run seed` | `supabase/seed.sql` opnieuw genereren (na wijzigingen aan engine of schema) |
| `npm run db:bundle` | `supabase/setup.sql` opnieuw genereren uit de migraties |

Na een wijziging aan migraties: `npm run db:bundle` (en `npm run seed` als het schema van de seed-tabellen wijzigt). Tests controleren dat beide up-to-date zijn.

## Architectuur

```
src/engine/   Pure toernooilogica (geen React/Supabase; afgedwongen via ESLint)
src/data/     Supabase-client, API, queries (TanStack Query), realtime, offline-outbox, eventView
src/ui/       React-schermen (components/, layout/, pages/{public,staff,evening,print})
src/lib/      Tijd (Europe/Brussels, dd/mm/jjjj, "19u00"), namen (dubbels zoeken)
supabase/     migrations/ (bron van waarheid), setup.sql (gebundeld), seed.sql, demo-cleanup.sql
scripts/      seed-generator, migratiebundel, lokale Supabase-nabootsing (scripts/local)
tests/        engine-invarianten + matrix, PGlite-databasetests
e2e/          Playwright
```

### Engine (src/engine)
- `poolLayouts`: indelingsopties (standaard 4 → 5 → 3, plus grotere varianten); `pools`: slangverdeling + round robin.
- `standings`: poulestand (winst → legsaldo → legs → onderling → gemiddelde → barrage → loting); opgegeven spelers onderaan; `barrageNeeds` alleen bij een gelijke stand over de A/B-grens.
- `qualify`: A/B-split; vergelijking over poules heen per poulepositie (win% → saldo/match → legs/match → ranking → lot).
- `bracket`: KO met byes voor topseeds; backtracking voor poulescheiding (niveau 3 = maximaal gespreid, 2 = helften, 1 = geen poulegenoot in ronde 1, 0 = niets).
- `results`: score valideren, doorschuiven, correcties (geweigerd als de volgende match gespeeld is), `autoWalkovers`.
- `scheduler`: **bordplanning is afgeleid, niet opgeslagen.** `replaySchedule` speelt de avond na op servertijdstippen (`finished_at`) + `event_log` (`boards`, `assign`, `hold`, `release`). Elk toestel berekent dus dezelfde "Nu op bord X". `forecastSchedule` rekent verder met verwachte duur. Bewaar nooit een bordtoewijzing in de database; voeg een logregel toe.
- `estimate`: eindtijd vóór de start (virtuele avond) en live (gekalibreerde min/leg); `suggestAdjustments`.
- `placements` / `points` / `ranking`: gedeelde plaatsen per ronde (A dan B), punten van de hoogste plaats in het bereik, beste X van Y (op totaal per avond, deelnamepunten inbegrepen).
- `simulate`: speelt volledige avonden (tests + seed).
- Alle randomness via `createRng(seed)` / `lotValue(seed, …)`; de seed per avond is `events.rng_seed`.

### Database (supabase/migrations)
- De engine draait in de browser; de database bewaakt invarianten: `matches_before_write` leidt de winnaar af uit de legs en valideert; `matches_after_update` schuift spelers door (`private.place_player`) en past walk-overs toe voor opgegeven spelers.
- Rechten: RLS op alle tabellen. Publiek leest spelers (naam/bijnaam), avonden, poules, matchen, uitslagen. `player_contacts`, `registrations`, `event_secrets` alleen staff (`is_staff()` = admin of leider). Interne functies in schema `private` (niet via de API bereikbaar).
- Schrijvers zonder account: `submit_score(p_event_id, p_code, p_pin, …, p_client_id)`. Idempotent via `result_client_id`; conflict bij een andere bestaande uitslag; rem na 20 foute pins per 10 minuten.
- Eerste account wordt automatisch admin (`private.handle_new_user`); volgende accounts zijn `aanvraag` tot een admin ze goedkeurt.
- Audit-log via triggers; `app.skip_audit` / `app.skip_advance` (transactie-lokaal) voor bulkbewerkingen (seed, samenvoegen, anonimiseren).
- Matchcodes (`P1-R2-1`, `A-R1-3`, `P2-BAR-1`) zijn de engine-id's; `src/data/mappers.ts` zet rijen om.

### Data en offline (src/data)
- `eventView.buildEventView(bundle, now)`: alles wat een avondscherm nodig heeft (fase, replay, forecast, stand, eindplaatsen). "Nu" = max(klok, laatste servertijdstip).
- `outbox`: scores en check-in gaan via IndexedDB en worden met retry gesynchroniseerd. `SyncBadge` toont de status. Na een sync werkt `App.tsx` de cache meteen bij.
- Query-cache wordt bewaard in localStorage (offline tonen); `staleTime: 0`, zodat online altijd ververst wordt.
- Realtime: `useEventRealtime` + polling elke 30 s als vangnet.

## Conventies
- Alle tekst voor gebruikers in het Nederlands (Vlaams): datums `dd/mm/jjjj`, uren `19u00`, tijdzone Europe/Brussels (`src/lib/time.ts`). Gebruik nooit `toLocaleString` zonder tijdzone.
- Codecommentaar in het Nederlands; namen van variabelen en functies in het Engels.
- Engine-functies zijn puur en immutabel (geven nieuwe arrays terug). Schrijf tests mee, zeker voor alles in `src/engine`.
- Grote aanraakdoelen (min. ±48 px), één-duimbediening, bevestigingsscherm voor uitslagen.
- Hardcodeer nergens een domein; Supabase-URL en -sleutel komen uit `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
- Privacy: publiek enkel naam en bijnaam. Contactgegevens nooit in publieke queries of logs.

## Fasering
- Fase 1 (klaar): alles hierboven.
- Fase 2: online voorinschrijving (RPC met rem), TV-modus `/tv`, schrijver-suggestie, Elo (seedingbron), extra klassementen, deelbare uitslagafbeelding, double elimination en troostbracket, audit-log-scherm, CSV/JSON-export.
- Fase 3: 501-scorer per beurt, Masters, grafieken, .ics, volwaardige PWA.
