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
  - Whether the first deploy has already run (and succeeded) still has to be checked by Bryan in the Table Editor.
  - The merges of PR #1 and #2 may have happened before the link; `config.toml` was missing until the follow-up change.
- **Not yet done, by Bryan** (README §2):
  1. ~~create a Supabase project and run `supabase/setup.sql`~~ → the project exists; the database is set up via the GitHub integration (check that the tables exist);
  2. Auth → Email: turn **Confirm email OFF** (the free SMTP only mails team members);
  3. link Netlify to the repo and set `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`;
  4. set the GitHub secrets `SUPABASE_URL` + `SUPABASE_ANON_KEY` for the keepalive workflow (free projects pause after 7 days of inactivity);
  5. the first account created becomes admin automatically.
- **First live test evening:** Saturday **21/11/2026** (December: 19/12/2026). The seed contains a planned demo event on 21/11/2026 with pin `1234`.
- **Never verified against a real Supabase project or Netlify:** supabase.com is blocked from the container. Watch for differences between the local emulator and the real PostgREST/Auth/Realtime (see §6).
- **Open question to Bryan:** guide the installation step by step, or start phase 2?

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
- **DB (`supabase/migrations`, 3 files, bundled into `supabase/setup.sql` via `npm run db:bundle`):**
  - triggers derive the winner from legs, advance players and apply walk-overs for withdrawn players;
  - RLS on all tables; private helpers live in schema `private`;
  - `submit_score` is the PIN RPC: idempotent via `result_client_id`;
  - `match_stats` has `event_id`;
  - the first user becomes admin.
- **Offline:** the outbox (IndexedDB) handles scores and check-in. After a sync, `App.tsx` updates the cache optimistically (prevents flicker or double toggles). `staleTime: 0`. Sensitive queries (contacts, pin, profiles, audit) are not persisted, and the cache is cleared on sign-out.
- **Local dev without Supabase:** `npm run local:supabase [-- --seed]` runs a PGlite-based emulator of PostgREST/RPC/Auth on :54321 with the same migrations. `npm run dev:local` points the app at it. Realtime is not emulated (the app polls every 30 s).

## 6. Gotchas and environment notes

- **Environment:** Node 22. The container has no Docker daemon (no real local Supabase) and cannot reach supabase.com. Use Chromium at `/opt/pw-browsers/chromium`; Playwright picks it up via `playwright.config.ts`. Never run `playwright install` here.
- **Test runtimes:** `npm test` ≈ 45 s (484 tests: 4 matrix files + PGlite DB tests). `npm run test:e2e` ≈ 30 s (one full evening, including an offline scorer).
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
- 2026-10-20: Supabase account created and linked to the repo by Bryan (GitHub integration, Deploy to production ON); `supabase/config.toml` added and README/CLAUDE.md adapted.
