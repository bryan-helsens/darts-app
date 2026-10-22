# CLAUDE.md: Sanapolis Darts

> **Eerst lezen:** [`.claude/memory/PROJECT_MEMORY.md`](.claude/memory/PROJECT_MEMORY.md) bevat de status, de genomen beslissingen, de aannames en de volgende stappen van dit project. Werk dat bestand bij bij elke mijlpaal of beslissing.

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
| `npm run vapid` | Eenmalig een VAPID-sleutelpaar voor de pushmeldingen (nooit committen) |

Na een wijziging aan migraties: `npm run db:bundle` (en `npm run seed` als het schema van de seed-tabellen wijzigt). Tests controleren dat beide up-to-date zijn.

**Migraties gaan automatisch naar productie.** De Supabase GitHub-integratie staat aan met *Deploy to production*: bij elke merge naar `main` past Supabase de nog niet toegepaste bestanden uit `supabase/migrations` toe. Daaruit volgt:
- Wijzig **nooit** een migratiebestand dat al op `main` staat. Voeg altijd een nieuw bestand toe met een latere tijdstempel (`jjjjmmdduummss_naam.sql`).
- Een migratie moet slagen op een database met echte gegevens: geen destructieve wijzigingen zonder datamigratie.
- `supabase/config.toml` is nodig voor de integratie. De `[auth]`/`[api]`-instellingen daarin gelden enkel lokaal en voor previewbranches, niet voor productie. De seed wordt nooit op productie geladen.

## Architectuur

```
src/engine/   Pure toernooilogica (geen React/Supabase; afgedwongen via ESLint)
src/data/     Supabase-client, API, queries (TanStack Query), realtime, offline-outbox, eventView
src/ui/       React-schermen (components/, layout/, pages/{public,staff,evening,print})
src/lib/      Tijd (Europe/Brussels, dd/mm/jjjj, "19u00"), namen (dubbels zoeken), CSV (`toCsv`)
src/demo/     Demo-dataset (gedeeld door de knop "Demo-data laden" en scripts/seed)
supabase/     migrations/ (bron van waarheid), config.toml, setup.sql (gebundeld), seed.sql, demo-cleanup.sql, restore-backup.sql
netlify/      functions/kalender.mts: abonneerbare kalender /kalender.ics (rewrite in netlify.toml, vóór de SPA-regel); functions/meldingen.mts: pushmeldingen (scheduled, elke minuut)
scripts/      seed-generator, migratiebundel, lokale Supabase-nabootsing (scripts/local), generate-icons (PWA-iconen uit favicon.svg), backup (nachtelijke back-up)
tests/        engine-invarianten + matrix, PGlite-databasetests
e2e/          Playwright
```

### Engine (src/engine)
- `poolLayouts`: indelingsopties (standaard 4 → 5 → 3, plus grotere varianten); `pools`: slangverdeling + round robin.
- `standings`: poulestand (winst → legsaldo → legs → onderling → gemiddelde → barrage → loting); opgegeven spelers onderaan; `barrageNeeds` alleen bij een gelijke stand over de A/B-grens.
- `qualify`: A/B-split; vergelijking over poules heen per poulepositie (win% → saldo/match → legs/match → ranking → lot).
- `bracket`: KO met byes voor topseeds; backtracking voor poulescheiding (niveau 3 = maximaal gespreid, 2 = helften, 1 = geen poulegenoot in ronde 1, 0 = niets).
- `elimination`: schema-formats zonder poules (`TournamentFormat`: `poules_ab` | `double_elim` | `single_elim_plate`; stages W/L/GF en M/P). Symbolisch raster (bron: speler, bye, winnaar, verliezer) → `resolveBracket` maakt echte matchen, doorgeefmatchen (byes) of laat knopen wegvallen. `buildElimination(format, seeds, legs)` is deterministisch uit de seedlijst (bewaard in `settings.tournament.seeds`); `startBracket` seedt zoals de poules. `isEventFinal` = A-finale, grote finale of hoofdfinale.
- `results`: score valideren, doorschuiven, correcties (geweigerd als de volgende match gespeeld is), `autoWalkovers`.
- `scheduler`: **bordplanning is afgeleid, niet opgeslagen.** `replaySchedule` speelt de avond na op servertijdstippen (`finished_at`) + `event_log` (`boards`, `assign`, `hold`, `release`). Elk toestel berekent dus dezelfde "Nu op bord X". `forecastSchedule` rekent verder met verwachte duur. Bewaar nooit een bordtoewijzing in de database; voeg een logregel toe.
- `estimate`: eindtijd vóór de start (virtuele avond) en live (gekalibreerde min/leg); `suggestAdjustments`.
- `placements` / `points` / `ranking`: gedeelde plaatsen per ronde (A dan B; schema-formats: per ronde waarin iemand definitief uitgeschakeld wordt, `eliminationPlacements`/`formatPlacements`), punten van de hoogste plaats in het bereik, beste X van Y (op totaal per avond, deelnamepunten inbegrepen).
- `simulate`: speelt volledige avonden (tests + seed); `simulateBracketEvening` voor de schema-formats.
- Planning van schema's: KO-prioriteit = langste resterende keten via `next` én `loserNext` (bij A/B gelijk aan "vroegste ronde eerst"). Wijzigingen aan de planner: `seed.sql` moet byte-identiek blijven (`npm run seed` + `git diff`).
- `elo`: Elo afgeleid uit alle gespeelde matchen (niet opgeslagen), chronologisch; per match de Elo-instellingen van haar seizoen (`SeasonSettings.elo`); walk-overs tellen niet. `eloSeedRanks` voor de loting.
- `leaderboards`: extra klassementen (180's, hoogste uitgooi, deelnames, beste nieuwkomer).
- `progress`: verloop voor de spelersgrafieken (`rankingProgress` = plaats na elke avond via `seasonRanking` per prefix; `eloProgress` = Elo na elke avond).
- `checkout` / `x01` / `x01Sim`: 501 double out per beurt. `checkoutSuggestion` zoekt alle routes (minste darts, dan voorkeur D16/D20/D8 en T20/T19); `applyVisit` herkent busts zelf en vraagt het aantal darts bij een uitgooi als dat niet vastligt (`needs-darts`); een bust = 0 punten en 3 darts; gemiddelde = punten / darts × 3 (`threeDartAverage`). `poolAverages` geeft enkel een gemiddelde als *alle* poulematchen van die speler per beurt gescoord werden. De database volgt dezelfde regels (`private.leg_totals`, `private.checkout_min_darts`; pariteit getest).
- `masters`: `mastersField(ranking, aanwezig, size)` = de top N van de aanwezigen volgens de ranking (+ geplaatsten die afwezig zijn, vervangers, reserves). `SeasonSettings.masters = { enabled, size }` (standaard uit, 16).
- `headToHead`: onderlinge duels per tegenstander (walk-overs tellen niet); `x01Stats`: `x01PlayerStats(legs)` over meerdere matchen (gemiddelde, eerste 9 = eerste drie beurten per leg, 100+/140+/180, beste leg, hoogste uitgooi).
- `scorer`: schrijver-suggestie per bord, afgeleid (niet opgeslagen): verliezer van de vorige match op dat bord, anders wie het langst vrij is; nooit wie speelt of de volgende match op dat bord heeft.
- Alle randomness via `createRng(seed)` / `lotValue(seed, …)`; de seed per avond is `events.rng_seed`.

### Database (supabase/migrations)
- De engine draait in de browser; de database bewaakt invarianten: `matches_before_write` leidt de winnaar af uit de legs en valideert; `matches_after_update` schuift spelers door (`private.place_player`) en past walk-overs toe voor opgegeven spelers.
- Rechten: RLS op alle tabellen. Publiek leest spelers (naam/bijnaam), avonden, poules, matchen, uitslagen. `player_contacts`, `registrations`, `event_secrets` alleen staff (`is_staff()` = admin of leider). Interne functies in schema `private` (niet via de API bereikbaar).
- Schrijvers zonder account: `submit_score(p_event_id, p_code, p_pin, …, p_client_id)`. Idempotent via `result_client_id`; conflict bij een andere bestaande uitslag; rem na 20 foute pins per 10 minuten.
- 501 per beurt: `match_legs` (beurten als `smallint[]`, null = bust; de trigger controleert de leg en leidt winnaar, darts en punten af). `submit_legs(…, p_player1, p_player2, p_legs, p_final, p_session, p_client_id, p_board)` krijgt telkens alle afgewerkte legs (momentopname); `stale` als de spelers veranderden, `conflict` voor een ander toestel (staff mag overnemen); `p_final` zet in dezelfde transactie de uitslag en `match_stats` (darts, punten, 180's, hoogste score, uitgooi ≥ 100). Regel: **beurten bestaan enkel als ze bij de uitslag passen** (`matches_clear_leg_detail` wist ze bij een andere wijziging van uitslag of spelers, behalve onder `app.skip_advance`).
- Eerste account wordt automatisch admin (`private.handle_new_user`); volgende accounts zijn `aanvraag` tot een admin ze goedkeurt.
- Audit-log via triggers; `app.skip_audit` / `app.skip_advance` (transactie-lokaal) voor bulkbewerkingen (seed, samenvoegen, anonimiseren). `app.actor` labelt wie zonder account schreef (`score-pin`, `online-inschrijving`).
- Nachtelijke back-up: `.github/workflows/backup.yml` + `scripts/backup.ts` (`scripts/backup/collect.ts`: per seizoen `buildSeasonBackup` + `alle-spelers.json`, via de REST-API met de service-sleutel, per 1000 rijen). Versleuteld met 7-Zip (`BACKUP_PASSWORD`, ook de bestandsnamen) en enkel zo als artifact bewaard: de repository is **publiek**.
- Pushmeldingen: `push_subscriptions` (een toestel = een `endpoint` = één speler; `kinds` ⊆ start/next/scorer/reminder) en `push_sent` (`(event_id, key)`: elke melding vertrekt één keer). Beide zonder policies: enkel via `subscribe_push` / `unsubscribe_push` / `push_status` (anon, wie het endpoint kent, bezit het toestel) en de service-sleutel. Anonimiseren wist de abonnementen (`players_drop_push`).
- Back-up terugzetten: `supabase/restore-backup.sql` (SQL Editor; enkel ontbrekende avonden, idempotent; getest in `tests/db/backup.test.ts`).
- Matchcodes (`P1-R2-1`, `A-R1-3`, `P2-BAR-1`, `W-R2-1`, `L-R3-2`, `GF-R1-1`, `M-R1-4`, `P-R2-1`) zijn de engine-id's; `src/data/mappers.ts` zet rijen om.
- Formats: `events.format` (CHECK) wordt gezet door `start_tournament` uit `p_config.format`; per format enkel de juiste stages (`matches_stage_check`). `add_barrages`/`generate_knockout`/`undo_knockout` enkel bij `poules_ab` (`private.require_format`); `reset_tournament` zet `poules_ab` terug.
- Online inschrijven: `preregister(p_event_id, p_player_id | p_name, p_email, p_phone)` (anon, rem 40 pogingen per avond per 10 min via `registration_attempts`). Nieuwe namen worden spelers met `pending = true`: onzichtbaar voor anon (RLS) tot ze bij de check-in aanwezig gezet worden (trigger `registrations_confirm_player`).
- Masters: `events.kind` (`regulier` | `masters`, CHECK) met een unieke index per seizoen voor `masters`; `preregister` weigert een Masters (`closed`). `finalize_event` is ongewijzigd: de app stuurt de plaatsen met 0 punten.
- Demo-data: `load_demo_data(jsonb)` / `remove_demo_data()` / `has_demo_data()` (admin). Alle demo-id's beginnen met `de000000-`; enkel die rijen worden geladen of verwijderd. De dataset bouwt `src/demo/demoData.ts` in de browser (zelfde bouwer als de seed).

### Data en offline (src/data)
- `eventView.buildEventView(bundle, now)`: alles wat een avondscherm nodig heeft (format, fase, replay, forecast, stand, eindplaatsen, schrijver per bord). `SCHEMA_STAGES[format]` = de schema's om te tonen; schema-formats hebben geen poulestatus en fase `schema`.
- `registration`: tot wanneer online inschrijven kan (`onlineRegistrationOpen`).
- `audit`: `describeAudit(row, ctx)` maakt van een audit-rij een Vlaamse zin (logboek `/beheer/logboek`, admin). `fetchAuditLog` pagineert met een cursor op `id` (niet `changed_at`: dat is per transactie gelijk); filters per tabel via `AUDIT_TABLES`.
- `exports`: `rankingCsv`, `resultsCsv`, `matchesCsv` en `buildSeasonBackup` (JSON, contacten enkel voor admins). Seizoenstabellen haal je op met `fetchAll` (per 1000 rijen, met vaste volgorde): PostgREST geeft nooit meer dan 1000 rijen per verzoek.
- Elo: `fetchEloMatches` haalt alle gespeelde matchen op (via `fetchAll`); `useElo()` (src/ui/hooks.ts) rekent ze om. Bij de start bewaart `TournamentConfig` de gekozen seedingbron en een momentopname `seedRanks` (ook gebruikt voor de KO). "Nu" = max(klok, laatste servertijdstip).
- `outbox`: scores, legs (501) en check-in gaan via IndexedDB en worden met retry gesynchroniseerd. Een nieuwere legs-momentopname van dezelfde match en hetzelfde toestel vervangt een oudere. `SyncBadge` toont de status. Na een sync werkt `App.tsx` de cache meteen bij.
- `x01Sessions`: de lopende 501-match per toestel in IndexedDB (`sanapolis-darts-x01`); sessie-id = toestel-id. `eventView` geeft `liveLegs` (legstand van lopende matchen), `dartsTotals`, `averages` en `averagesFor(view, filter)`; het gemiddelde telt als poule-tiebreak enkel als `TournamentConfig.scoring.averageTiebreak` bij de start zo vastgelegd werd.
- 501 per seizoen: `fetchLegsForEvents` + `useSeasonLegs`, `x01LegInputs` (mappers) en `useSeasonX01(season)` (hooks; zonder de Masters). Ranking-tab "Gemiddelde", blok "501 per beurt" en `HeadToHead` op het spelersprofiel; Masters-grens in de ranking (`data-masters-cut`) en op de tv.
- `masters`: `isMasters(event)` en `withoutMasters(seasonData)`. `useSeasonRanking` geeft de seizoensgegevens **zonder** de Masters terug: ranking, klassementen, tv-ranking, seeding en seizoensexports negeren haar. Elo (`fetchEloMatches`) rekent wel met alle matchen. Check-in van een Masters: `MastersCheckIn`; `EveningPage` geeft `StartPanel` enkel het veld (`masters` = standaard double elimination en seeding op de ranking).
- Query-cache wordt bewaard in localStorage (offline tonen); `staleTime: 0`, zodat online altijd ververst wordt.
- Realtime: `useEventRealtime` + polling elke 30 s als vangnet.

## Conventies
- Alle tekst voor gebruikers in het Nederlands (Vlaams): datums `dd/mm/jjjj`, uren `19u00`, tijdzone Europe/Brussels (`src/lib/time.ts`). Gebruik nooit `toLocaleString` zonder tijdzone.
- Codecommentaar in het Nederlands; namen van variabelen en functies in het Engels.
- Engine-functies zijn puur en immutabel (geven nieuwe arrays terug). Schrijf tests mee, zeker voor alles in `src/engine`.
- Compact maar duimvriendelijk: knoppen standaard 36 px (`h-9`); scoreknoppen 44 px, check-inknoppen 36 px over een volle rij. Eén-duimbediening, bevestigingsscherm voor uitslagen.
- Huisstijl: licht, compact en modern. Basistekst 14 px (`text-sm`), meta 12 px, labels 11 px (`text-2xs`, eigen token); invoervelden 16 px op gsm (`text-base sm:text-sm`, anders zoomt iOS in). Zwarte kop (`bg-ink`, 48 px), blauw als hoofdkleur (`brand-*`), rood als accent (`accent-*`, ook voor "live"), lettertype Inter, afgeronde hoeken `rounded-md`/`rounded-lg`. Kleuren en tokens in `src/index.css` (`@theme`); bouwstenen in `src/ui/components/ui.tsx` (Button, Card, List + `rowClass`, Badge, Stats, Segmented, SearchInput, DateTile, Icon, …). Geen emerald/groen.
- Deelbare uitslag (`src/ui/share`): `resultImageData` (puur, getest) + `drawResultImage` (canvas 1080×1080) + `ShareResultButton` (Web Share of download).
- TV-modus (`src/ui/pages/tv`): eigen donkere componenten; `TvPage` schaalt de rem mee met de schermbreedte en houdt het scherm wakker. `?toon=<scherm>` zet één scherm vast.
- Schema's tonen: `Bracket` (licht), `TvBracket`, `PrintBracket` gebruiken allemaal `bracketLayout(stage, matches)` (`src/ui/components/bracketLayout.ts`): plaatsen per ronde, ook voor het verliezersschema; lege kolommen vallen weg.
- Indeling (`src/ui/layout/Layouts.tsx`): op gsm een tabbalk onderaan (zoals een app), vanaf `md` de navigatie in de kop. Matchen tonen als scorebord (`MatchLine`: twee regels, legs rechts) en in rasters van tegeltjes (`MatchTile` + `TileGrid`, 2 kolommen op gsm).
- Scores invoeren: per speler het aantal gewonnen legs (`ScoreEntry`, rijen met `data-legs-row`), of per beurt (`X01Start` + `X01Scorer`, volledig scherm, `data-x01-*`; standaard volgens `SeasonSettings.scoring.defaultMode`). `/score/:eventId?match=CODE` opent een match rechtstreeks. Het tabblad **Matchen** (`MatchesPanel`) laat de leider elke match achteraf invoeren of corrigeren; `MatchModal` toont gemiddelden en `LegsDetail` ("Beurten bekijken").
- Getallen met decimalen via `formatDecimal` (`src/lib/format.ts`, komma).
- Pushmeldingen: `src/data/push.ts` (puur: `eventMessages(view, name)` = start/schrijver per bord zolang de match < 10 min bezig is + "straks" op bezette borden via `upcomingByBoard`; `reminderMessage` vanaf 12u00 tot het sluitingsuur, niet voor de Masters), `src/data/pushJob.ts` (`runPushJob(deps)`: ophalen, `buildEventView`, enkel ontvangers per soort, `claim` in `push_sent` met ignore-duplicates, versturen, 404/410 opruimen) en `netlify/functions/meldingen.mts` (`web-push`, env `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `URL`; ontbreekt er een: niets doen). De functie mag geen React of Supabase-client importeren (titels: `src/data/titles.ts`). Client: `src/ui/pwa/push.ts` (`pushSupport`, `enablePush`, `disablePush`, `onPushNavigate`) + `PushCard` (spelersprofiel en na het inschrijven); de service worker laadt `public/push-sw.js` (`workbox.importScripts`). Zonder `VITE_VAPID_PUBLIC_KEY` verschijnt er niets. E2e bootst `serviceWorker.ready`/`pushManager` na.
- PWA (`vite.config.ts`, `src/ui/pwa`): `registerType: 'prompt'` + `UpdateBanner` (nooit vanzelf herladen, behalve op `/tv`), `InstallCard` (`beforeinstallprompt` wordt vroeg opgevangen in `install.ts`, geïmporteerd in `main.tsx`; iOS-uitleg). PNG-iconen in `public/` (opnieuw maken: `npx tsx scripts/generate-icons.ts`). De service worker laat `/kalender.ics` met rust (`navigateFallbackDenylist`).
- Agenda: `src/lib/ics.ts` (`buildCalendar`, UTC, escapen, vouwen op 75 bytes) + `src/data/calendar.ts` (`toCalendarEvents`, zonder Supabase-client: ook gebruikt door de Netlify-functie). Knop `AddToCalendarButton`, abonnement `CalendarSubscribe` (`webcal://`).
- Grafieken: `LineChart` (SVG, geen bibliotheek) met de pure `chartGeometry`.
- Exports: CSV met `;`, komma als decimaalteken, UTF-8 BOM en formule-bescherming (`src/lib/csv.ts`); downloaden via `downloadFile` (`src/ui/export`).
- Hardcodeer nergens een domein; Supabase-URL en -sleutel komen uit `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
- Privacy: publiek enkel naam en bijnaam. Contactgegevens nooit in publieke queries of logs.

## Fasering
- Fase 1 (klaar): alles hierboven.
- Fase 2 (klaar, PR #7–#10): online voorinschrijving (RPC met rem), TV-modus `/tv`, schrijver-suggestie, Elo (seedingbron), extra klassementen, deelbare uitslagafbeelding, double elimination en knock-out met plate, logboek, CSV/JSON-export.
- Fase 3 (klaar, PR #11–#13): PWA, .ics en grafieken; 501-scorer per beurt met gemiddelden; Masters.
- Fase 4 (klaar, PR #15): onderlinge duels, Masters-grens, 501-statistieken per seizoen, nachtelijke versleutelde back-up, pushmeldingen. Status en vervolg: zie `.claude/memory/PROJECT_MEMORY.md`.
