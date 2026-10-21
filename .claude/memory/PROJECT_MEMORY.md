# Project memory: Sanapolis Darts

> Claude's working memory for this project. **Read this first** after a context compaction or in a new session. Then read `CLAUDE.md` (architecture and conventions) and, if needed, `README.md` (user manual and installation).
> Keep it current: update it at every milestone or decision, and when the status changes. Last updated: 2026-10-20.

## 1. Who and what

- **User:** Bryan (GitHub `bryan-helsens`). He plays in, and helps organise, the monthly darts tournament in Brasserie 't Oud Sanatorium (Sanapolis, Sijsele): every 3rd Saturday, registration on site until 18u30, start 19u00, €5 entry, steel darts, 501 double out.
- **Language:**
  - all app UI and user-facing docs (README, PR texts, commit messages) are in **Dutch (Flemish)**;
  - code comments are in Dutch, identifiers in English;
  - Bryan wrote mostly in Dutch, but this request was in English. Answer in the language he writes in.
- **Users of the app:** volunteers without technical knowledge, on phones, with poor wifi. A non-technical successor must be able to maintain it (README).
- **Original brief:** the full prompt Bryan uploaded (roles, features, data model, phasing, standard format). Its essentials are captured in this file, `CLAUDE.md` and `README.md`.
- **How Bryan wants to work:**
  - start in plan mode, ask questions first, build only after approval;
  - work phase by phase; each phase must be deployable;
  - write tests together with the tournament logic.

## 2. Decisions (answered by Bryan; do not re-ask)

| Topic | Decision |
|---|---|
| Participation points vs. "best X of Y" | **Inside** best X: total per evening (placement + participation), best X evenings count. |
| Player counts that don't fit pools of 4/5 (6, 7, 11) | **Both options, the leader chooses.** Standard uses pools of 3 only when needed (6→3+3, 7→4+3, 11→4+4+3); alternatives with fewer, bigger pools (6→1×6, 7→1×7, 11→5+6, 12→6+6, …), always followed by A/B. Single pool → top 4 to A by default. |
| Leader login | **Own account** (e-mail + password); an admin approves the request. |
| Paper results of 2026 | **2026 is a test season**; no historic input. The real first season is 2027. |
| Given in the brief | Boards 4–8, adjustable during the evening. 6–40 players (avg 12, target 30). Standard format: pools + A/B. Default legs and points table as in the brief. Best 8 of 11 on by default. Calendar-year seasons. Masters optional (phase 3, off). 3 admin accounts. No custom domain (Netlify subdomain, never hardcode a domain). |

**Assumptions I made myself** (listed in the PR description and README; Bryan may change them):
- **Withdrawal:** a withdrawn player drops to the bottom of their pool. Remaining matches are walk-overs with max legs for the opponent; already played results stay.
- **More byes than pool winners** (e.g. 20 players): all winners get a bye, then the best runners-up.
- **Cross-pool comparison** for byes and seeding: win% → leg diff per match → legs won per match → ranking → lot.
- **Barrage** only for a full tie across the A/B cut. The leader chooses "barrage (bo1, round robin within the group)" or "loting"; other ties are drawn automatically.
- **Shared places** get the points of the best place in the range.
- **Points table changes** apply immediately to the whole season ranking (recomputed from stored placements).
- **Scheduling:** boards stay occupied rather than giving rest. Back-to-back matches happen only when no rested alternative exists; the UI warns. The A-final waits for everything else and is played on the main board (setting `holdFinal`).
- **Time estimate reality:**
  - 30 players / 6 boards with defaults → ±23u56 (not 23u00); "pools best of 1" → ±22u35;
  - the sim shows pools take ±150 min for 50 matches;
  - the app suggests adjustments itself and calibrates to the measured minutes per leg.

## 3. Status

- **Phase 1 (MVP) is DONE and merged** into `main`: PR bryan-helsens/darts-app#1, merge commit `0e0ff03`, 2026-10-20. CI (GitHub Actions "Tests") was green.
- **Branch:** `claude/new-session-bpbx7g`, restarted from `main` after the merge. After a merge, always restart the branch from `origin/main` for follow-up work; never stack new commits on merged history.
- **2026-10-20: Supabase linked through the GitHub integration, with "Deploy to production" ON** (confirmed by Bryan).
  - On every merge to `main`, Supabase applies the pending files from `supabase/migrations`, compared against `supabase_migrations.schema_migrations`.
  - Consequence: **never edit a migration that is already on `main`**; always add a new, later-timestamped file.
  - Do **not** also paste `supabase/setup.sql` by hand; that is only for the manual route (README §2.1 B).
  - `supabase/config.toml` (generated with `supabase init`, CLI 2.121.0) was added for the integration. Its `[auth]`/`[api]` settings are skipped on production; the seed is never loaded on production (only on preview branches, which are a Pro feature).
  - **The first production deploy SUCCEEDED** after merging PR #3 (`config.toml` added), confirmed by Bryan: the tables exist in the Table Editor. Before that, the merges of PR #1 and #2 deployed nothing because `config.toml` was missing.
  - Supabase project ref: `zlnpxcqccbrkseoutdcj` (project name "darts", free org "bryan-helsens's Org"). A "Supabase Preview" check runs on PRs; it is skipped because preview branches are a Pro feature.
- **Not yet done, by Bryan** (README §2):
  1. ~~create a Supabase project and set up the database~~ → **done**: the database was set up via the GitHub integration (2026-10-20);
  2. Auth → Email: turn **Confirm email OFF** (the free SMTP only mails team members);
  3. ~~link Netlify~~ → **done 2026-10-20**: live at `https://astounding-khapse-32c22d.netlify.app` (renaming the site is suggested). The first signup failed with "Signups not allowed for this instance": "Allow new users to sign up" was OFF in Supabase Auth. Bryan was told to turn it on and to check that "Confirm email" is off. The app now shows Dutch auth errors (`src/lib/authErrors.ts`);
  4. set the GitHub secrets `SUPABASE_URL` + `SUPABASE_ANON_KEY` for the keepalive workflow (free projects pause after 7 days of inactivity);
  5. ~~first account~~ → **done 2026-10-20**: Bryan created his account after enabling signups; as the first account it is admin.
- **First live test evening:** Saturday **21/11/2026** (December: 19/12/2026). The seed contains a planned demo event on 21/11/2026 with pin `1234`.
- **Never verified against a real Supabase project or Netlify:** supabase.com is blocked from the container. Watch for differences between the local emulator and the real PostgREST/Auth/Realtime (see §6).
- **2026-10-20, before phase 2 (Bryan's request):** fake data + redesign + manual score entry. Answers: fake data = **button in Beheer**; theme = **light with black header**; score entry = no preference → I did **both** (legs per player + a Matchen tab).
  - Demo-data button: `DemoDataCard` on the dashboard (admins). Migration `20261020130000_demo_data.sql` adds `has_demo_data()`, `load_demo_data(jsonb)`, `remove_demo_data()`. Dataset built in the browser by `src/demo/demoData.ts` (same builder as `scripts/seed`): "Demoseizoen", 25 players, 6 played evenings on the previous 3rd Saturdays, practice evening today (pin 1234). Only ids starting with `de000000-` are touched.
  - Redesign: light, compact; black header (`ink` #0a0a0b), blue primary (`brand`, #2563eb), red accent (`accent`, #dc2626; live badges); Inter Variable font (only Latin subsets precached). Status tones: gepland = blue, bezig = red, afgelopen = dark. Header scrolls away on phones, sticky from `md`. Sign-out sits in the staff nav. The sync badge shows "Online" on phones (full label as aria-label).
  - Score entry: per player tap the legs won (0…need), "Verder" → confirm. Leader tab **Matchen**: all matches with filters (te spelen / gespeeld / alle) and search; tap to enter or correct. `/score` has "Andere match invoeren".
- **2026-10-20, second redesign (Bryan: "still bulky and large … smaller and compacter … modern"):** design system v2.
  - 14 px body text, `text-2xs` (11 px) token, buttons 36 px default (`h-9`), score buttons 44 px, check-in toggles 36 px; `rounded-md`/`rounded-lg`, `shadow-xs`, page background `canvas` (#f4f4f6).
  - Layout: 48 px black top bar; **bottom tab bar on phones** (public: Kalender, Ranking, Uitslagen, Spelers, Info; staff: Overzicht, Spelers, Seizoenen, Gebruikers, Site); desktop nav in the top bar. Sign-out = icon button top right.
  - Matches render as a two-line **scoreboard** (`MatchLine`) inside **tiles** (`MatchTile` + `TileGrid`, 2 columns on phones); boards are a 2-column grid. Public event page uses tabs. Date tiles (`DateTile`, `dateParts` in `src/lib/time.ts`).
  - Touch-target convention in CLAUDE.md lowered accordingly (was ±48 px).
- **Phase 2 started 2026-10-20** (plan approved; plan file `/root/.claude/plans/zazzy-orbiting-brooks.md`). Decisions: online pre-registration = pick your name or "Ik ben nieuw" (new names `players.pending` until checked in); double elimination with ONE grand final (no reset); plate = all losers of main R1 and R2 when there are byes (else R1 only); default seeding = Elo (leader can switch per evening to ranking/random). Own choices: Elo derived (not stored), per-season Elo settings (start 1500, K 32, newcomer K 48 for 10 matches), seed snapshot stored in TournamentConfig at start, scorer suggestion derived, public sees only the pre-registration count, CSV with `;` + BOM, JSON backup admin-only incl. contacts.
  - Sub-phases, one PR each: **2a** pre-registration + TV + scorer suggestion; **2b** Elo + seeding choice + leaderboards + share image; **2c** audit-log screen + CSV/JSON export; **2d** double elim + plate (engine PR first, then DB+UI; design: `resolveBracket` with symbolic sources, stages W/L/GF and M/P, `isEventFinal`, longest-chain KO priority, `eliminationPlacements`, byte-identical seed.sql as regression check).
  - **2a merged as PR #7** (squash `bd72bb9`): migration `20261020150000_preregistration.sql` (`players.pending`, `registration_attempts`, `preregister` RPC, confirm-on-check-in trigger), `/inschrijven/:eventId`, `src/engine/scorer.ts`, `/tv` (`src/ui/pages/tv`).
  - **2b merged as PR #8** (squash `300ed45`): `src/engine/elo.ts` (+ `SeasonSettings.elo`, `seeding`), `src/engine/leaderboards.ts`, `useElo()`, seeding Segmented in StartPanel with snapshot in TournamentConfig, ranking page tabs (Punten/Elo/180's/Uitgooi/Deelnames/Nieuwkomers), Elo on the player profile, share image `src/ui/share/*`. No DB changes.
  - **2c merged as PR #9** (squash `36fb8a4`, no migration): logbook `/beheer/logboek` (admin; `src/data/audit.ts` `describeAudit`, paged `useAuditLog` with an `id` cursor because `changed_at` is equal within one transaction), "Exporteren" block on the season page (`src/data/exports.ts`: ranking/results/matches CSV + `buildSeasonBackup` JSON; `src/lib/csv.ts` with `;`, decimal comma, BOM, formula guard), `supabase/restore-backup.sql` (SQL Editor restore, only missing events, idempotent; `tests/db/backup.test.ts`). Generic `fetchAll` pagination now also used by `fetchSeasonData` (a full season can exceed 1000 matches).
  - **2d done on the branch** (two commits: engine `8c43a9d`, then migration + UI):
    - engine: `src/engine/elimination.ts` (`resolveBracket` on a symbolic 2^k grid; DE with reversed drop-in in odd drop-in rounds, 2n−2 matches; plate with R1+R2 losers when there are byes, R2 losers get plate byes first, rematch-free first plate match except n=5), `isEventFinal`, chain priority in the scheduler (A/B unchanged: `seed.sql` byte-identical), `eliminationPlacements`/`formatPlacements`, `estimateBracketPlan`/`suggestBracketAdjustments`, `simulateBracketEvening`, format matrix tests;
    - DB: migration `20261021100000_formats.sql` (CHECKs widened, `start_tournament` reads `p_config.format`, `private.require_format` guards, reset → `poules_ab`), `tests/db/formats.test.ts`;
    - UI: format choice in StartPanel (estimated end per format, summary, legs labels per format, warning for DE > 32), tabs without Poules, generic `Bracket` via `bracketLayout`, TV/print/public follow, `e2e/formats.spec.ts` (DE with 6 players) and shared `e2e/helpers.ts`.
- **Next:** PR for 2d (the user decides one PR with both commits or the planned split). Phase 2 is then complete; phase 3 next (501 scorer, Masters, charts, .ics, PWA).

## 4. Phase backlog

- **Phase 1:** done. Players, events, check-in and payment, pools + A/B with seeding and time estimate, boards and queue, legs score entry (+ optional 180s/finish/high score), placements, points, season ranking, public ranking and results, print/PDF fallback, offline outbox, audit triggers.
- **Phase 2:**
  - online pre-registration (public form via an RPC with rate limiting);
  - TV mode `/tv` (fullscreen, dark, rotating schedule / boards / top 20 / highlights, realtime);
  - scorer suggestion (loser of the previous match on that board, or a free player);
  - Elo (start 1500, adjustable K, higher K for new players; seeding source and option for A/B);
  - extra leaderboards (180s, highest finish, best newcomer, most attendances);
  - shareable result image 1080×1080 (Canvas);
  - double elimination and single elimination + consolation (engine already has `loserNext`; formats only `poules_ab` in the DB check);
  - audit-log screen (triggers already exist);
  - CSV and JSON export / backup.
- **Phase 3:** full 501 scorer per visit (averages, checkout suggestions, average as pool tiebreaker), Masters (top 16, optional), charts (ranking/Elo evolution), .ics "Toevoegen aan agenda", full installable PWA.

## 5. Architecture in one breath (details in CLAUDE.md)

- **Stack:** React 19 + Vite 8 + TS 6 (TS 7 is incompatible with typescript-eslint) + Tailwind 4 + React Router 7 + TanStack Query 5 (persisted to localStorage) + supabase-js 2 + idb-keyval + vite-plugin-pwa. Netlify (`netlify.toml`). Supabase free tier.
- **`src/engine`:** pure, tested tournament logic.
  - Board planning is a **deterministic replay** of `matches.finished_at` + `event_log` (boards/assign/hold/release); it is never stored. `buildEventView` uses now = max(clock, latest server timestamp incl. `started_at`).
  - Match ids are codes (`P1-R2-1`, `A-R1-3`, `P2-BAR-1`), stored as `matches.code`, unique per event.
- **DB (`supabase/migrations`, 4 files, bundled into `supabase/setup.sql` via `npm run db:bundle`):**
  - triggers derive the winner from legs, advance players and apply walk-overs for withdrawn players;
  - RLS on all tables; private helpers live in schema `private`;
  - `submit_score` is the PIN RPC: idempotent via `result_client_id`;
  - `match_stats` has `event_id`;
  - the first user becomes admin.
- **Offline:** the outbox (IndexedDB) handles scores and check-in. After a sync, `App.tsx` updates the cache optimistically (prevents flicker or double toggles). `staleTime: 0`. Sensitive queries (contacts, pin, profiles, audit) are not persisted, and the cache is cleared on sign-out.
- **Local dev without Supabase:** `npm run local:supabase [-- --seed]` runs a PGlite-based emulator of PostgREST/RPC/Auth on :54321 with the same migrations. `npm run dev:local` points the app at it. Realtime is not emulated (the app polls every 30 s).

## 6. Gotchas and environment notes

- **Environment:** Node 22. The container has no Docker daemon (no real local Supabase) and cannot reach supabase.com. Use Chromium at `/opt/pw-browsers/chromium`; Playwright picks it up via `playwright.config.ts`. Never run `playwright install` here.
- **Test runtimes:** `npm test` ≈ 60 s (1269 tests incl. 2 format-matrix files: 4 matrix files + PGlite DB tests). `npm run test:e2e` ≈ 30 s on a **Pixel 7 viewport** (one full evening, including an offline scorer, a correction, the logbook and the CSV/JSON export; plus a double-elimination evening in `e2e/formats.spec.ts`). E2e selectors: check-in rows via `[data-player-row]`, legs buttons via `[data-legs-row="1"] button`, pin via `[data-pin]`, sync badge via its accessible name.
- **Generated files are checked by tests.** After changing migrations, run `npm run db:bundle`. After changing the seed schema or engine output, run `npm run seed`.
- **PGlite:** pass `parsers` per query (DATE/TIME as text, TIMESTAMPTZ → ISO, INT8 → number). Script imports from the scratchpad need absolute paths; use `.mjs`/`.mts` for top-level await.
- **E2e lesson:** never `page.goto` right after a click that fires a request; wait for the resulting URL or state (CI is slower).
- **Risks to watch on real Supabase:**
  - supabase-js `.single()`/`.maybeSingle()` semantics;
  - new-style publishable keys (`sb_publishable_…`) work as the anon key;
  - Realtime needs the tables in publication `supabase_realtime` (the migration adds them if the publication exists);
  - anonymous calls to `submit_score` and `check_scorer_pin` rely on default execute grants.
- **CI warning:** `actions/checkout@v4` / `actions/setup-node@v4` target Node 20 (deprecated warning only). Bump to v5 when convenient.
- **Git:** pushing works (an early 403 was fixed when Bryan reconnected GitHub). Commit trailers: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: <session url>`. Open a PR only when asked; never put model names in commits or PRs.

## 7. Change log of this memory

- 2026-10-20: created after phase 1 was merged (PR #1).
- 2026-10-20: Supabase account created and linked to the repo by Bryan (GitHub integration, Deploy to production ON); `supabase/config.toml` added and README/CLAUDE.md adapted (PR #3). The production deploy succeeded and the tables exist.
- 2026-10-20: site live on Netlify, first admin account created, Dutch auth errors (PR #4).
- 2026-10-20: demo-data button, redesign (blue/black/red, compact) and manual score entry (legs per player + Matchen tab) merged as PR #5 (squash `5d3f606`); the demo-data migration deploys to production via the Supabase integration.
- 2026-10-20: second, more compact and modern redesign (design system v2, bottom tab bar, scoreboard tiles) merged as PR #6 (squash `7bdc7f0`); no database changes.
- 2026-10-21: phase 2b merged as PR #8 (squash `300ed45`); phase 2c (logbook, CSV/JSON export, restore script) built on the branch.
- 2026-10-21: phase 2c merged as PR #9 (squash `36fb8a4`); phase 2d (double elimination, knock-out with plate) built on the branch.
