# Staging environment & prod/staging split

**Status: repo side done** (2026-07-29) — slice 1 complete and verified
end to end: `npm run db:clone-prod` has been run **against the real production
database** into the local stack, with every row count matching and grants, RLS
and policies intact (§9); the `/dev` gate checked against a real production
build (404 without the flag, 404 with the flag but no unlock cookie, 200 with
it); `/dev/login-as` + picker rendering real cloned users; unit tests green.

Slice 2 is **live**. Supabase project #2, the `buli-hub-staging` Cloud Run
service and the GitHub `STAGING` environment exist; pushes to `dev` deploy, and
the refresh workflow has cloned production into staging successfully. The
staging URL, its `noindex` behaviour and the `/dev` token gate are all verified
against the running deployment.

Open, and deliberately so: a clone is pseudonymised, not anonymised — see
`docs/deployment.md` §6, "What the scrub cannot do". Revisit once a season is
running, because that is when the standings make re-linking possible.

Goal: a second deployment fed by real-shaped data, so features and migrations
can be tried against something that behaves like production before production
sees them — without any risk to live data, the live Discord server, or the
league's users.

Operational detail lives in `docs/deployment.md` §6 (cloning production) and
§7 (the staging environment); this document is the design and its reasoning.

---

## 1. The problem this solves

Today there is exactly one place where the app runs with real data:
production. That has two consequences.

**Migrations are only ever tested against an empty database.** CI runs
`supabase db reset` on a fresh stack, so every migration is applied to a
schema built from scratch with no rows in it. The migrations that actually
break are the ones that meet real data: a `NOT NULL` added to a column that
has nulls, a unique index that existing rows violate, a backfill that is
instant on 10 rows and slow on 40,000. None of those can fail in CI. They can
only fail in production, during a deploy, on the live league.

**Features are only ever tested against invented data.** The local stack has
seed fixtures and `/dev` personas. Those are good for edge cases you thought
of, and useless for the ones you didn't — the season that is half-finished,
the division with an odd player count, the player who dropped mid-matchday,
the name with an emoji in it.

A staging environment fixes both, but only if it is fed from production. A
staging environment with its own invented data solves nothing that the local
stack doesn't already solve.

---

## 2. The shape

Three environments, each with a clear job.

| | Local | Staging | Production |
|---|---|---|---|
| **Runs** | `npm run dev` | Cloud Run (`buli-hub-staging`) | Cloud Run (`buli-hub`) |
| **Database** | Supabase CLI (Docker) | Supabase project #2 | Supabase project #1 |
| **Deployed from** | — | push to `dev` | push to `main` |
| **Data** | prod clone, on demand | prod clone, on demand | real |
| **Discord: sign-in** | dev Discord app | dev Discord app | prod Discord app |
| **Discord: role reads** | off | off | real guild |
| **Discord: posting** | test server | test server | real guild |
| **`/dev` tooling** | on | on | **off** |
| **Public** | no | no (access-restricted) | yes |

The essential idea: **"realistic data" and "real deployment" are separate
needs, and separating them makes both cheaper.**

- The *local* stack gets prod-shaped data via a clone script. This becomes
  the primary way to develop against realistic data: hot reload, tests in
  watch mode, full `/dev` tooling, instant iteration, and the data never
  leaves your machine.
- *Staging* exists for the things local genuinely cannot do: rehearse
  migrations at production data volume, exercise the real Discord OAuth
  round-trip through a hosted Supabase project, verify Cloud Run behaviour
  (container, secrets, cold starts), and provide a URL you can hand to a
  staff member.

That split is why this plan has two slices, and why slice 1 is worth doing
even if slice 2 is deferred.

---

## 3. How the Discord configuration splits

This is the part that makes the whole thing safe, and it needs no code
changes — the seams already exist in `.env.example`.

Three independent concerns, three independent settings:

1. **Sign-in** — `SUPABASE_AUTH_EXTERNAL_DISCORD_CLIENT_ID` / `_SECRET`.
   Which Discord application users authenticate through. A dev application
   already exists (`docs/deployment.md` §1 distinguishes it from the
   production one).
2. **Role reads** — `DISCORD_GUILD_ID` + `DISCORD_ROLE_ID_DEV` / `_ADMIN` /
   `_STAFF`. Where a user's app role comes from.
3. **Posting** — `DISCORD_BOT_TOKEN` + channel ids (the three result
   channels, `docs/plans/discord-result-channels.md`, and one per future
   channel). Where messages go.

Because they are independent, needing a test Discord server for *posting*
does not force *role reads* through that server.

### Role reads stay off outside production

`roleConfig()` (`src/features/roles/config.ts`) returns `null` unless all four
role variables are set, and `syncMember()` (`src/features/roles/sync.ts`)
returns the **stored** role unchanged when the config is null.

So: **leave the four role variables unset on local and staging.** The roles
that came across in the clone freeze exactly as they were in production —
including your own `dev`. Nothing needs a test-server membership, and the
staging role distribution mirrors the real one.

This is also more realistic than live role reads would be, because it
reproduces the actual spread of dev/admin/staff/player across the real user
base rather than depending on who happens to have joined a test server.

*(For completeness: if role reads against the real guild are ever wanted from
staging, the single bot token would have to be a member of both guilds, and
"invite it with no permissions" is not safe — a bot inherits `@everyone`
permissions and can end up able to post in public production channels. It
would need a role explicitly denying Send Messages server-wide. Avoiding this
entirely is the reason reads stay off.)*

### Posting goes to the test server

The test Discord server mirrors the *shape* of production, not its content:
a results channel now, forum channels when the feedback feature lands. Each
channel id becomes a variable on local `.env` and on the staging service.

Configuration fails safe by design: an unset channel id means posting is
skipped entirely, so a half-configured test server degrades to silence rather
than to errors or misdirected messages.

### Sign-in

Local and staging both use the dev Discord application. Staging additionally
needs its Supabase callback URL registered in that application's OAuth
settings (see §6.1).

Discord user ids are global — the same snowflake across applications — so
`auth.identities.provider_id` stays valid in a clone. Signing into staging
with your real Discord account resolves to your copied user row.

---

## 4. Slice 1 — `db:clone-prod`

A script that pulls production into a target database and transforms it into
a usable test fixture. Used locally by hand; reused by staging in slice 2.

Deliverable: `scripts/clone-prod.sh` (or `.ts`), an npm script, `.env.example`
entries, and documentation in `docs/deployment.md`.

### 4.1 What gets copied

Four schemas matter:

- **`public`** — the application tables.
- **`auth`** — `auth.users` and `auth.identities`. Not optional: the schema
  has foreign keys into `auth.users`, so a `public`-only copy restores into
  nothing.
- **`drizzle`** — the migrations journal (`__drizzle_migrations`). Copying
  this is what makes "clone, then migrate" correct: the target inherits
  production's migration position, so a subsequent `drizzle-kit migrate`
  applies exactly the migrations production has not seen yet. That is
  precisely the rehearsal we want.
- **`storage`** — only if Storage is in use. Currently it is not; skip it and
  revisit if that changes.

Source connection: the **session** connection string (port 5432), the same
one already stored as `PROD_DATABASE_URL`. Migrations and dumps both need a
stable session rather than the transaction pooler.

### 4.2 The pipeline

```
prod ──dump──▶ dump.sql ──restore──▶ target ──scrub──▶ ──shift dates──▶ ──migrate──▶ ready
```

Five steps, each with a reason.

**Step 1 — Dump.** `pg_dump` against the production session URL, restricted to
the four schemas above. Read-only; production is never written to.

**Step 2 — Restore.** Drop the target's `public` and `drizzle` schemas — which
takes the foreign keys into `auth.users` with them — then empty
`auth.identities` and `auth.users`, reload those two in dependency order, and
finally load the app dump, which recreates both schemas itself. Dropping
without recreating is deliberate: `pg_dump --schema=public` emits
`CREATE SCHEMA public`, so pre-creating it would collide. See §9 for why this
ordering avoids needing superuser-only flags.

**Step 3 — Scrub (staging only, see §4.3).** Replace personal data with
synthetic equivalents.

**Step 4 — Transform.** Two mandatory transforms:

- *Clear `discord_posts`.* Copied rows carry production message ids in
  production channels. The staging/local bot is not in that server, so every
  edit 404s. The code treats a 404 as "message was deleted, may be re-posted"
  (`src/lib/discord.ts`), which self-heals — but it means re-posting the
  entire season into the test channel. Truncating the table avoids this.
- *Shift dates.* A production dump is frozen at one moment in the season.
  Offsetting every timestamp by a single interval moves "today" to wherever
  the test needs it: the day before a deadline, mid-matchday, post-season.
  This is the transform that turns a static snapshot into a test fixture, and
  it is the highest-value part of the script. It must apply the **same**
  interval to every timestamp column across `registration_windows`,
  `matchdays`, `matches`, `match_results`, `disputes`, `profiles` and any
  future table, or the data becomes internally inconsistent. A one-line
  helper that enumerates timestamp columns from `information_schema` is more
  robust than a hand-maintained list.

**Step 5 — Migrate.** `drizzle-kit migrate` against the target. Because the
journal came from production, this applies only the not-yet-deployed
migrations, against production-shaped data. **This step is the migration
rehearsal.** If it fails here, it would have failed in production.

### 4.3 The privacy rule

Cloning production copies real personal data: Discord ids, usernames,
nicknames, avatars, and email addresses in `auth.users`. For a German
community with a published Datenschutz page, this deserves an explicit rule
rather than an implicit habit.

**The rule: scrub when the clone lands somewhere that widens access.**

- *Local clone → no scrub.* You already have production database access. A
  clone on your own machine does not expand who can see the data. Scrubbing
  would only reduce the realism you are cloning for.
- *Staging clone → scrub.* Staging is reachable by more people and wired to a
  test Discord server. Anonymise it.

The scrub replaces `profiles.display_name` / `username` / `avatar_url`,
`auth.users.email` and `raw_user_meta_data`, and `auth.identities.identity_data`
with synthetic values. It also clears two things the original sketch missed:
the free text players wrote themselves — `registrations.prev_name` and
`greatest_achievements`, `disputes.reason` and `note` — which is unbounded
user-authored prose and the highest-risk field for accidental disclosure.
Null-ness and rough length are preserved, so the UI still meets empty, short
and overlong values.

Two details that matter:

- **Synthetic names must keep the properties that break UIs** — umlauts, very
  long names, emoji, names that look like mentions, right-to-left text. A
  generator drawing from a small fixture list preserves the realism that
  matters for layout bugs while removing the identity. A unit test asserts the
  fixture list still has each of those properties, so shortening it later
  cannot quietly remove the coverage.
- **`provider_id` follows the role exemption** (§8.1). It is the Discord
  snowflake, so it is personal data, but it is also what maps a real Discord
  login onto a copied user row. Staff and above keep theirs; every other row
  gets a synthetic snowflake above the real Discord id range, so a scrubbed id
  can never collide with a genuine account.

### 4.4 Impersonation

With real data loaded, the existing `/dev` personas
(`src/features/dev/personas.ts`) become less useful than the ability to *be*
a copied user — to see exactly what a specific player sees, with their real
season, division, matches and results. That is the tool most likely to catch
the bugs a non-technical user would otherwise have to report.

The mechanism already exists. `loginAsPersona()`
(`src/features/dev/login.ts`) establishes a session by generating an admin
magic link and verifying it server-side, no email involved. Impersonation is
the same flow pointed at an existing user's email instead of a persona's:

- A route `/dev/login-as?userId=<uuid>` next to `/dev/login`, behind the same
  gate. The session flow is shared, not copied: `establishSession(email)` in
  `login.ts` is what both routes call.
- A picker in `/dev` listing copied users with their role and division, so you
  don't have to look up uuids by hand. Search-first and capped, because a
  cloned season is hundreds of rows; the filter ignores diacritics, since you
  are usually typing a name half-remembered from Discord.
- No profile pinning — a copied user already has the right role, and role
  sync is off outside production, so nothing overwrites it.
- The email is looked up from `auth.users` inside the action rather than taken
  from the caller, so a stale link cannot mint a session for an address that no
  longer belongs to that row.

### 4.5 Definition of done for slice 1

- `npm run db:clone-prod` populates the local stack from production.
- The date-shift interval is a parameter, documented with examples.
- `/dev` gains the impersonation route and picker; the `/dev/ui` gallery
  covers any new component states (CLAUDE.md definition of done).
- Unit tests for the pure parts: the timestamp-shift SQL generator and the
  synthetic-name generator.
- `docs/deployment.md` gains a "Cloning production" section.

Slice 1 stands alone: it delivers realistic local development and migration
rehearsal without any new infrastructure, and it works entirely against the
test Discord server.

---

## 5. Slice 2 — the staging deployment

### 5.1 The `/dev` gate

Staging runs a production build, so `/dev` would 404 there — including exactly
the persona and impersonation tooling that makes staging useful.

The check lives in `src/features/dev/enabled.ts` as `devToolsEnabled()`. It is
true in `npm run dev`; outside development it needs `ENABLE_DEV_TOOLS === "true"`
**and** an unlock cookie matching `DEV_TOOLS_TOKEN`, obtained once per browser
via `/dev/unlock?token=…`.

The token is not belt-and-braces, it is load-bearing: staging is reachable at a
public (if unlisted) URL, and `/dev/login` mints an admin session for any
persona while `/dev/login-as` does the same for any copied user. Without the
token the staging URL alone would grant full control of the staging app and its
Discord posting. With it, the URL is not enough.

Pages are gated once in `src/app/dev/layout.tsx`, so a page added later is
protected by default. Layouts do not wrap route handlers, so each `route.ts`
under `/dev` calls `devToolsEnabled()` itself.

The remaining safety property is a deployment property: the production Cloud
Run service never sets either variable. Nothing in CI can catch a mistake here,
because CI never inspects the production service's environment — hence the
warning callout in `docs/deployment.md` §7.

### 5.2 Two triggers, deliberately separate

The instinct is "every staging deploy refreshes the database from
production". That backfires in practice: you deploy, build up test state,
find a bug, push a fix — and the refresh wipes the state you were testing
with. Every push destroys the setup you just made.

So the two actions get separate triggers:

| Action | Trigger | Effect |
|---|---|---|
| Build, migrate, deploy | push to `dev` | Fast. Keeps existing data. |
| Clone production | `workflow_dispatch` (manual button) | Fresh prod-shaped baseline, then migrate. |

Both end with `drizzle-kit migrate`, so a refresh always leaves staging at
the current schema. A nightly `schedule:` on the refresh can be added later
if it turns out to be wanted; the manual button should come first, because it
is the one that respects an in-progress test.

### 5.3 Workflow changes

- `.github/workflows/ci.yml`: `dev` joins `main` in `push.branches`, and the
  existing `deploy` job serves both targets. Its `environment:` is an
  expression — `PROD` on `main`, `STAGING` on `dev` — so every `vars.*` and
  `secrets.*` in the job resolves from the selected environment and the two
  deployments cannot drift apart in their steps. `concurrency` is keyed per
  branch so staging and production never queue behind each other.

  A separate `staging.yml` was the original sketch, but `needs: checks` cannot
  reference a job in another workflow file: it would have meant either
  duplicating the whole checks job or a `workflow_run` trigger, which is
  markedly more fragile. One parameterised job is both correct and less code.

- `.github/workflows/staging-refresh.yml` (new): `workflow_dispatch` only,
  `environment: STAGING`, runs the clone script with the scrub enabled, takes
  the date-shift interval as a workflow input. It installs
  `postgresql-client-17` first — the runner image ships an older client, and
  `pg_dump` refuses to dump from a server newer than itself.

The refresh workflow needs `PROD_DATABASE_URL` (read) and
`STAGING_DATABASE_URL` (write). That is the one place both credentials meet,
and the file says so.

### 5.4 Infrastructure

Additions to `docs/deployment.md`, mirroring the existing production runbook:

**Supabase project #2** — same region (Frankfurt). Discord provider enabled
with the **dev** application's credentials. Site URL and redirect URLs
pointing at the staging domain. Email sign-ups disabled, as in production.
No schema needs applying by hand; the first clone or migrate supplies it.

**Discord dev application** — add
`https://<staging-ref>.supabase.co/auth/v1/callback` to its redirect URLs.

**Cloud Run service `buli-hub-staging`** — same project, same region, same
Artifact Registry repository (image tags differentiate). Differences from
production:

- `--min-instances=0` — cold starts are fine here, and it costs nothing idle.
- Staging secrets: `DATABASE_URL` (staging pooler), `SUPABASE_SECRET_KEY`
  (staging), `DISCORD_BOT_TOKEN` (**test** bot).
- Env: `APP_BASE_URL` = staging URL (otherwise Discord links point at
  production), `ENABLE_DEV_TOOLS=true`, test-server channel ids, and **no**
  role variables.
- **Unlisted, not IAM-gated.** No custom domain: staging lives at its generated
  `*.run.app` URL — public, but unguessable and linked from nowhere. IAM-gating
  would be stronger, but it requires every tester to have `gcloud` and an IAM
  grant, which rules out handing the URL to a player for feedback. The chosen
  trade-off puts the weight on the other two defences instead: the data is
  scrubbed, and `/dev` needs `DEV_TOOLS_TOKEN` (§5.1).
- `APP_ENV=staging` makes the app serve a disallow-all `robots.txt` and an
  `X-Robots-Tag: noindex, nofollow` header, so a link pasted into Discord
  cannot get staging indexed. Both are evaluated at request time, not build
  time, so the behaviour follows the Cloud Run environment rather than the
  image (`src/app/robots.ts`, `src/proxy.ts`).

**GitHub environment `STAGING`** — the same variable set as `PROD` with
staging values, plus `STAGING_DATABASE_URL` as a secret. Both `PROD` and `STAGING` need
`PROD_DATABASE_URL`: the deploy job migrates with it on `main`, and the
refresh workflow reads production through it on `dev`.

### 5.5 Definition of done for slice 2

- Pushing to `dev` deploys to the staging URL.
- The manual refresh workflow clones, scrubs, shifts and migrates.
- Signing into staging with a real Discord account lands on the copied user
  row with its production role.
- A result reported on staging posts to the **test** server, and nothing
  reaches the production guild.
- `docs/deployment.md` documents the staging setup end to end, including the
  rule that `ENABLE_DEV_TOOLS` must never be set in production.

---

## 6. Working on `dev`

Introducing a long-lived `dev` branch changes the current model, where every
push to `main` ships. Suggested convention, to keep the "one commit per
feature on main" rule intact:

- Feature work branches off `main`, merges into `dev` freely for testing.
- When the feature is approved, it is squash-merged into `main` as one
  commit. `main` stays the production history; `dev` is a scratch integration
  branch.
- `dev` may be reset to `main` whenever it drifts. Nothing of value lives
  only there.

Worth confirming: this is the lightest option, but it means `dev` history is
throwaway and staging can briefly run code that never reaches production.

---

## 7. Cost

- **Supabase project #2** — free. The plan assumed Pro would be needed because
  the Free tier pauses a project after ~7 days of inactivity, which is exactly
  what a rarely-used staging environment does. It was built on Free anyway, and
  the pause turns out to be a nuisance rather than a blocker: unpause in the
  dashboard, then refresh. Pro remains worth considering, but for production
  backups rather than for staging (`docs/deployment.md` §4).
- **Cloud Run staging** — effectively free at `min-instances=0`.
- **Artifact Registry** — negligible; staging images share the existing repo.

Supabase's own Branching feature does something adjacent, but it seeds
branches from migrations and a seed file rather than from production data,
which is the opposite of what this plan is for. Not a fit.

---

## 8. Decisions taken

1. **`provider_id` in the staging scrub — exempt staff and above.**
   Everyone with a `profiles.role` of `staff`, `admin` or `dev` keeps their
   identity through the scrub, so they sign into staging as themselves and land
   on their own copied data. Everyone else is anonymised. Scrubbing every id
   would have been more private but would have left staging unable to exercise
   the real Discord OAuth round-trip, which is one of the reasons it exists
   (§2). The role is the right predicate rather than a maintained id list:
   staff are the people who have staging access in the first place, so
   exempting them widens access to nothing, and a role change in Discord is
   carried by the next refresh without touching any configuration.
2. **Staging access — unlisted URL plus `noindex`, not IAM.** Chosen so the
   URL can be handed to a player for feedback without a `gcloud` install. The
   security budget moves to the scrub and to `DEV_TOOLS_TOKEN` (§5.1, §5.4).
3. **Both slices ship.** Slice 1 stands alone and landed first; slice 2's code
   follows immediately, gated only on the infrastructure existing.
4. **`dev` branch convention — as written in §6.**

## 9. Risks and unknowns

- **Restoring the `auth` schema across Supabase projects is the fiddliest part
  of this plan and is still unproven.** `auth` is Supabase-managed and the
  `postgres` role on hosted Supabase is not a true superuser, so
  `--disable-triggers` is unavailable. The approach taken avoids needing it:
  drop `public` and `drizzle` **first**, which takes the foreign keys into
  `auth.users` with them, then empty and reload the two auth tables in
  dependency order (users, then identities), then restore `public`+`drizzle` —
  whose dump recreates both schemas and their constraints, validated against
  auth rows that are already in place. The auth tables use `--column-inserts`
  rather than `COPY`, because the hosted project's gotrue version may not have
  exactly the columns the local CLI stack has; named columns tolerate the
  difference and fail readably when they cannot.

  **This is now verified against the real production database** (2026-07-29,
  prod → local): all row counts match exactly, and the column-level grants, RLS
  flags and policies all survive. Two things the run taught us that no amount of
  local testing would have:

  - Production carries default-privilege ACLs for **`supabase_admin`**, and
    replaying them fails — altering another role's defaults needs membership in
    it, which `postgres` does not have on either hosted Supabase or the local
    CLI stack. They are stripped before restore
    (`src/features/dev/clone/restore.ts`); the equivalent `postgres` statements
    are kept, because migrations run as `postgres` and those defaults are what
    give a newly created table its grants.
  - The `auth` tables restored cleanly with `--column-inserts`, so the feared
    gotrue column drift between the hosted project and the local CLI stack did
    not materialise. It still might against a *staging* project on a different
    Supabase version, which is why the tolerant form stays.

  The hosted-target path is **also verified now** (2026-07-29, prod → staging
  via the refresh workflow): row counts match, the scrub and the allow-list
  behave, and `drizzle-kit migrate` built the schema from scratch on an empty
  hosted project. Two things only the real run could have surfaced:

  - **Database identity cannot be judged from a connection string.** Supabase's
    pooler puts every project on one hostname, port and database name,
    distinguished only by the username, so the original self-clone guard
    refused a legitimate prod → staging run. Worse, it would have *allowed* the
    dangerous case: the session pooler (5432) and the transaction pooler (6543)
    are two URLs for one database. The guard now compares
    `pg_control_system().system_identifier` from both servers.
  - **Installing `postgresql-client-17` does not make `pg_dump` version 17.**
    `/usr/bin/pg_dump` is Debian's `pg_wrapper`, which dispatches to the default
    cluster's version — 16 on GitHub runners. The workflow prepends
    `/usr/lib/postgresql/17/bin` and asserts the version.

- **`supabase db reset` does not populate `drizzle.__drizzle_migrations`** —
  the CLI replays the SQL files directly. So a fresh local stack has no
  `drizzle` schema at all, and the clone is what gives it production's
  migration position. This is why "clone, then migrate" is a real rehearsal
  and a plain `db:reset` is not.

- **Clone duration** grows with the database. Fine now; if it ever exceeds
  the workflow timeout, the refresh moves to a Cloud Run job.

- **`ENABLE_DEV_TOOLS` + `DEV_TOOLS_TOKEN` stand between a production
  deployment and signing in as anyone.** They are guarded by deployment
  configuration, not by code, and CI cannot check them because it never
  inspects the production service's environment.
