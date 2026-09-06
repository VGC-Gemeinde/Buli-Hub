# Buli Hub — Project Context

AI-assisted development context file. Read this before making any technical decisions or writing code.

## What this project is

Buli Hub is the tournament platform for the **VGC Bundesliga**, an online league run by the VGC Gemeinde (the largest German-speaking VGC / Pokémon community). Users are players and admins/organizers. Community coordination happens on Discord; the web UI is the primary interface.

**All domain decisions (league structure, match formats, rules, data model) are made during feature planning — never in this file.** This file covers the technical base only.

## Architecture (pinned — do not change without discussion)

One deployable: a full-stack **Next.js** app. No separate backend service, no persistent Discord bot process.

- **Next.js (App Router) + TypeScript** — frontend and backend in one app
  - Server Components for data-driven pages
  - Server Actions for mutations
  - Route Handlers only where an HTTP URL is required (e.g. Cloud Scheduler targets)
- **Supabase** — Postgres, Auth, Storage
  - Auth via **Discord OAuth provider** (all users have Discord accounts; Discord ID lives in user metadata)
  - Local development runs against **Supabase CLI** (`supabase start`, Dockerized local stack)
- **Drizzle ORM** (pinned) — schema defined in TypeScript (`schema.ts`), SQL migrations generated and committed to the repo. Drizzle connects directly to Postgres, so **RLS is bypassed for app queries: authorization checks live in server code (Server Actions)**. RLS policies are still defined as a defense-in-depth safety net.
- **Zod** — validation, schemas shared between server and forms
- **Tailwind CSS + shadcn/ui** — UI layer
- **Team sheets** — the league runs **Pokémon Champions**; teams are built in Showdown. The hub is its own paste service: every reported sheet is parsed, validated as a complete open team sheet, stripped of stats and published at `/pastes/<uuid>` (`src/features/teamsheets/`). Parsing/serialising is `@pkmn/sets` (no game data, so it cannot go stale); `@pkmn/dex` and `@pkmn/img` are display-only (mega resolution, sprite ids, nature arrows), so a dex gap can never reject a submission. Sprites come from a public GCS bucket with a Showdown-CDN fallback. Details: `docs/plans/teamsheet-pastes.md`.
- **Usage statistics** — the hub counts its own page loads (`src/features/usage/`, page at `/staff/nutzung` for admin+): the root layout renders `<CountPageLoad />`, which turns the request into a per-period salted hash folded into a HyperLogLog sketch and a counter in Postgres. Aggregates only, no per-request rows, no identifiers stored; `src/proxy.ts` passes the pathname along as `x-pathname` for it. History before the feature shipped is replayed once from Cloud Run logs (`npm run usage:backfill`). Details: `docs/plans/usage-stats.md`.
- **Discord integration** — no bot service. The Next.js backend calls the **Discord REST API directly with a bot token** (messages, embeds, threads, and since the season setup also roles, channels and permission overwrites). Token comes from secret management, never from client code. Season-scoped Discord objects the hub creates are tracked by id in `discord_season_resources` (`src/features/discord-season/`), and the server is kept converged onto the season by a periodic sync rather than by hooks in every action.
- **Scheduled jobs** — Google **Cloud Scheduler** invoking route handlers under `src/app/api/jobs/`, authorized by a shared secret (`Authorization: Bearer <JOBS_SECRET>`, checked by `authorizeJob` in `src/lib/jobs.ts`; 503 without a configured secret). Jobs are idempotent converges, so an overlapping or repeated run is harmless. The first one is the Discord season sync (`docs/plans/discord-season-setup.md`); per-environment job setup lives in `docs/deployment.md` §8.
- **Hosting** — Docker container on **Google Cloud Run**, scale-to-zero
- **Tooling** — **npm** (package manager), **Biome** (lint + format)
- **Dependencies** — **exact version pinning** (`save-exact=true` in `.npmrc`, no `^`/`~` ranges), committed lockfile. Automated updates via **Renovate** (`renovate.json`, weekly, grouped minor/patch), gated by CI.
- **Three environments** — local (Supabase CLI), **staging** (`buli-hub-staging` on Cloud Run + its own Supabase project, deployed from `dev`), and production (deployed from `main`). Staging exists to meet production-shaped data and rehearse migrations before production does; its database is refreshed on demand from production, never automatically. Full runbook: `docs/deployment.md` §7.
- **CI/CD** — `.github/workflows/ci.yml`: every push/PR runs Biome, typecheck, the full test suite against a Supabase CLI stack, and a production build. Pushes to `main` **and** `dev` then build the image, apply migrations (`drizzle-kit migrate`) and deploy — the same job, with `environment:` selecting `PROD` or `STAGING`, so the two cannot drift. Every `main` commit ships to production. `.github/workflows/staging-refresh.yml` clones production into staging, manual trigger only. One-time infrastructure setup lives in `docs/deployment.md`.

## Architectural principles

- **All business logic lives in the web app / database layer.** Discord integration is a thin output channel: it posts and notifies, it never decides.
- **Domain logic is pure functions.** Any rule or computation logic must be written as pure TypeScript functions, separated from database access, so it is exhaustively unit-testable.
- **Keep UI components dumb.** Logic belongs in tested functions and server actions; components only display. This is the explicit tradeoff that made cutting E2E tests safe.
- **Schema is code.** The Drizzle schema and committed SQL migrations are the source of truth for the data model. Any schema change goes through generate → review SQL → migrate.
- **Boring, well-documented tools over clever ones — this is a lesson learned, not a preference.** A previous iteration of this project failed on obscure tooling: AI assistance produced confidently wrong code for niche tools, and time went into fighting the toolchain instead of building features. The stack was chosen for AI-assisted development: one language end-to-end, types flowing DB → API → UI, everything visible in the repo, massive training/community representation for every tool. Do not introduce niche or exciting libraries without explicit discussion.
- **Feature-first folder structure.** Code is organized by feature (vertical slice), not by layer:

  ```
  src/
    features/
      <feature-name>/   # components, actions, logic, tests for this feature
      ...
    lib/                # genuinely shared: db client, discord.ts, auth helpers
    db/
      schema.ts         # Drizzle schema stays central (tables cross features)
    app/                # Next.js routes — thin wrappers importing from features/
  scripts/              # maintenance entry points, run via `node scripts/<x>.ts`
  ```

  `scripts/` holds orchestration only (spawning `pg_dump`, `psql`, `drizzle-kit`). Anything with logic worth testing lives under `src/features/` as a pure function and is imported from there — Node 24 runs TypeScript directly, so scripts need no build step and no extra dependency. Node does not resolve the `@/` alias or extension-less imports on its own, so a script that imports feature code which in turn imports `@/lib/db` or `@/db/schema` runs with `--import ./scripts/load-env.mjs --import ./scripts/src-alias.register.mjs` (`.env` loaded before any module evaluates, plus a 30-line resolve hook; see `usage:backfill` in `package.json`). A script's own `process.loadEnvFile` is too late for modules with import-time env guards such as `src/lib/db.ts`. Import-free pure modules, like the clone helpers, need nothing.

## Testing strategy (pinned)

- **Vitest unit tests** — the priority. Cover all domain logic (the pure functions). Correctness of computed results is critical to community trust; test exhaustively.
- **Vitest integration tests against real local Postgres** — run against the Supabase CLI stack. Test RLS policies, constraints, and multi-step flows. Clean state per test file via `supabase db reset` or truncation; shared seed helpers provide fixtures.
- **The suite refuses to run against a non-local `DATABASE_URL`** (`src/test/local-database.ts`, enforced from `src/test/setup.ts`). The integration tests delete and truncate on startup against whatever that variable points at, so a pasted production string would destroy live data — this is the only thing standing in the way. Override deliberately with `ALLOW_NONLOCAL_TEST_DATABASE=true`.
- **A test run wipes a `db:clone-prod` fixture**, for the same reason. Re-clone afterwards.
- **No E2E tests** — deliberate decision. Do not add Playwright or similar.
- Do not test: UI snapshots, styling, shadcn internals.

## Commands

### One-time setup
```bash
npm config set save-exact=true --location=project   # writes .npmrc: exact version pinning
npm install          # install dependencies
supabase init        # create supabase/ config (once per repo)
supabase start       # start local Postgres + Auth (Docker); prints URLs/keys for .env
```

### Daily development
```bash
supabase start       # if not already running
npm run dev          # Next.js dev server with hot reload (Fast Refresh) → localhost:3000
```

### Database & schema changes
```bash
npx drizzle-kit generate   # diff schema.ts → new SQL migration file
npx drizzle-kit migrate    # apply migrations to local DB
npx drizzle-kit studio     # browser GUI to inspect data
supabase db reset          # wipe local DB, re-run all migrations + seed
npm run db:clone-prod      # replace the local DB with production-shaped data
```
`db:clone-prod` is the migration rehearsal: it copies production (including the drizzle journal) into the local stack, optionally shifts every date by one interval, then runs `drizzle-kit migrate` — so pending migrations meet real data before production does. Needs `pg_dump`/`psql` ≥ 17 and `PROD_DATABASE_URL`. Details, flags and the scrub-vs-no-scrub privacy rule: `docs/deployment.md` §6.

Workflow: edit `schema.ts` → `generate` → review generated SQL → `migrate`. Migrations are committed and versioned. SQL that `schema.ts` cannot express (RLS policies, FKs into `auth.users`, grants) goes in a **custom** migration authored with `npx drizzle-kit generate --custom --name <x>` — this writes the file *and* its journal/snapshot entry; a hand-written `.sql` file is silently skipped by `migrate`. Migrations are per-feature and **append-only** — the pre-launch chain was squashed into a baseline at go-live (see `docs/decisions/migrations-squash-at-launch.md`); the deploy workflow applies new migrations to production with each release.

### Testing
```bash
npm test                   # Vitest in watch mode
npm test -- --run          # single run (CI style)
```
Integration tests require the local Supabase stack to be running.

### Code quality
```bash
npx biome check --write .  # lint + format with auto-fix
npx tsc --noEmit           # typecheck without building
```

### Occasionally
```bash
supabase stop              # shut down local stack
npm run build && npm start # production build, verify locally
npx drizzle-kit migrate    # against prod DB URL when deploying schema changes
```

## Working method (pinned)

- **Features are vertical slices.** A feature is the complete cross-section needed to realize a piece of functionality: view + server actions/routes + schema changes/migration + Discord calls + tests. A backend route alone is not a feature. Work is planned, implemented, and committed as whole slices.
- **Commits only after maintainer approval.** Present the finished, verified work first; commit (or amend) only when the maintainer explicitly approves. This applies to every commit, including small fixups.
- **One commit per feature on main.** This is a forcing function for scope discipline: if a feature doesn't fit a reviewable commit, it's too big — split it into smaller features. Migrations ship in the same commit as the code using them, so a revert takes both. Escape hatch: commit freely on a feature branch, squash-merge to main.
- **`dev` is where work happens; `main` is the release branch.** Default to `dev` — commit there freely, push as often as you like, and every push deploys to staging. Production only ever changes by promoting `dev` into `main`, always through a pull request. **Direct pushes to `main` are rejected server-side** by the `main-protection` ruleset: a PR is required, the `checks` job must pass, only squash merges are allowed, and there are no bypass actors, so it applies to admins too. `.githooks/pre-push` refuses the same push locally with a more useful message; enable it once per clone with `git config core.hooksPath .githooks`. Because the ruleset is authoritative, `--no-verify` will not get past it: an emergency means disabling the ruleset in Settings → Rules, pushing, and re-enabling it.

  ```bash
  # work
  git checkout dev && …                      # commit freely; each push → staging
  # promote, once staging looks right
  gh pr create --base main --head dev --title "<feature>"
  gh pr merge --squash --delete-branch=false  # one commit on main → production
  # REQUIRED afterwards, see below
  git checkout dev && git fetch origin && git reset --hard origin/main && git push --force-with-lease
  ```

  **The reset is not optional.** A squash-merge puts one new commit on `main` while `dev` keeps the originals — same tree, divergent history. Skip the reset and the *next* promotion takes the old merge base, replays commits already on `main`, and conflicts. Resetting `dev` onto `main` after every promotion keeps them a single line. (Merge commits would avoid the reset but put every intermediate commit on `main`, breaking one-commit-per-feature.)

  Corollaries: never let work exist only on `dev` for long — it is promoted or discarded. A production hotfix that cannot wait for `dev` goes on a branch off `main` and straight into a PR to `main`, then `dev` is reset onto it.
  - **Staging is not a substitute for the local loop.** Push to `dev` when something genuinely needs a real deployment — hosted Supabase, the Discord OAuth round-trip, Cloud Run behaviour, a migration meeting production-sized data. For everything else the local stack with `npm run db:clone-prod` is more realistic *and* faster than waiting for a deploy.
- **Plan before implementing — always.** Every feature starts with a written plan (`docs/plans/<feature>.md` or `features/<name>/PLAN.md`): scope (in/out), schema changes, affected routes/views, Discord touchpoints, test cases, open questions. The plan is approved before implementation starts. Plan size scales with feature size — three bullet points is a valid plan for a tiny feature.
- **Documentation describes the present, not the journey.** Plans, decision docs, and code comments must make sense to a reader with zero conversation or revision history. When a spec changes, rewrite the affected text as if the current design had always been the design — no correction notes, no "previously X, now Y". History lives in git; reasoning that is still relevant to the current state belongs in `docs/decisions/`.
- **Session independence: if knowledge only exists in a chat, it doesn't exist.** Any AI session must be able to start fresh from repo state alone. A feature is only complete when: code is committed, its plan is marked done, and CLAUDE.md is updated if anything structural changed. Cross-feature decisions and their reasoning go into `docs/decisions/`.
- **Design happens in two passes.** A feature's first implementation carries a *rudimentary but intentional* design: functional and laid out, built with the design-system tokens (`design/DESIGN.md`) so it is on-brand and coherent — a viewer should not read it as a throwaway placeholder — but deliberately not polished. That working feature is what the maintainer takes to the designer, who returns a polished design as a hand-off doc at `design/<FEATURE>.md` (companion to `DESIGN.md`). A later **design pass** implements the hand-off and changes **views only** — domain logic, queries and tests stay as-is. So the arc is: functional build → designer hand-off → design pass. Do not wait for a hand-off to build; do not ship bare, unstyled controls either. The design passes are made for desktop views first. You still need to optimize for mobile your self.
- **The `/dev` tooling tracks the UI.** `/dev` offers test-persona logins, impersonation of any real user, and a component-state gallery at `/dev/ui`. A feature that adds components with visual states extends the gallery (`src/features/dev/components/gallery.tsx`); a feature that adds user-specific data or new auth-metadata shapes extends the personas (`src/features/dev/personas.ts`). This is part of a feature's definition of done.
  - The gate is `devToolsEnabled()` (`src/features/dev/enabled.ts`): always on in `npm run dev`; outside development it needs `ENABLE_DEV_TOOLS=true` **and** an unlock cookie set via `/dev/unlock?token=<DEV_TOOLS_TOKEN>`. Pages are gated once in `src/app/dev/layout.tsx`; route handlers are not covered by layouts and must call `devToolsEnabled()` themselves. **Neither variable is ever set on the production Cloud Run service** — together they allow signing in as any user.
- **Quotes: straight `"` only.** Opening and closing are both the plain ASCII `"`, exactly as in English. The typographically correct German pair `„…"` is not used anywhere: it is right in a textbook and nobody actually writes it, and having two quote glyphs invited a third (`“`) to creep in as a stray closer. This covers everything we author, not just league voice: UI copy, Discord messages, code comments, CSS comments, `docs/`, `design/*.md` and this file. Exempt for the same reason as the em-dash rule: the designer's `design/go-live/*.dc.html` and `design/REGELWERK.reference.html`, which are records of what was handed off. Watch the one hazard when writing a quote inside a JS/TS string or JSX attribute delimited by `"` — switch that delimiter to `'`, do not escape. The app-wide sweep was done on 2026-08-07, so a new `„` or `“` is a regression.
- **Copy: no em-dashes.** Every string a user reads is written in plain, natural German without `—`. That means the web UI (headings, body copy, hints, empty states, button labels, error messages, `title` tooltips) **and the Discord messages** the bot posts (`src/features/discord-posts/messages.ts`) — the results channel and MotW/VOD announcements are league voice just as much as a page is. Split the sentence with a full stop, or use a comma or colon, whichever a person would actually write. "Der Spieltag ist vorbei. Nachtragen ist noch möglich." not "Der Spieltag ist vorbei — nachtragen ist noch möglich." For a separator inside one line, the codebase's middle dot (`·`) is the house choice. Four things this does *not* cover: `—` as the empty-value placeholder in a cell or chip (an established glyph, see the `playerName()` fallback and `ddMM`); code comments, which keep the existing em-dash-heavy style; `/dev` tooling copy (`src/app/dev`, `src/features/dev` labels and personas), which is not league voice; and the designer's `design/go-live/*.dc.html` reference artifacts, which are a record of what was handed off rather than our own docs. A design hand-off `.md` that *quotes* UI copy is covered, so a later design pass cannot reintroduce a `—` from it. Applies to every feature, including copy carried over from a design hand-off; the app-wide sweep was done on 2026-08-05, so a new `—` in copy is a regression.
- **Don't be a yes-sayer.** The maintainer explicitly wants pushback: critically evaluate suggestions, call out wrong or suboptimal decisions, and ask for justification when a decision seems doubtful. Challenge first, then implement.

## The development loop

Start `supabase start` and `npm run dev` once; leave them running. Feature work happens in the hot-reload loop, with `npm test` in watch mode alongside. Schema changes: edit `schema.ts`, generate, review, migrate — the local DB is disposable; `supabase db reset` recovers from any broken state. Before every commit: Biome, typecheck, full test run.

Common commands should be wrapped as npm scripts (`db:generate`, `db:migrate`, `check`, etc.) so flags don't need to be remembered.

## Environment & secrets

- `.env` — the single local env file (template: `.env.example`), read by Next.js, drizzle-kit, and the Supabase CLI alike: Supabase URLs/keys, Discord bot token, and the OAuth credentials the CLI substitutes into `supabase/config.toml` via `env()` on `supabase start`
- `NEXT_PUBLIC_SPRITE_BASE` — root of the sprite bucket (`/pokemon`, `/pokemon-pixel`, `/items` are appended). Unset → the shared `justhit-sprites` bucket, which is what production uses.
- Production secrets (Supabase service keys, Discord bot token) via Google Secret Manager, injected into Cloud Run
- The Discord bot token must never reach client-side code

## Open decisions (not yet pinned)

- None currently.

Domain-level open questions are intentionally not tracked here — they belong to feature plans (`docs/plans/`).
