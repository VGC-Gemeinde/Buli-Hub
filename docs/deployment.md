# Deployment runbook

Production = one Cloud Run service (region **europe-west1**, Belgium — Cloud Run domain mapping is not available in Frankfurt) + one
hosted Supabase project. Every push to `main` deploys via
`.github/workflows/ci.yml` (checks → image → migrations → deploy). This
runbook is the one-time setup; keep it current when infrastructure changes.

Placeholders used below: `buli-hub`, `<DOMAIN>` (e.g. `bulihub.de`),
`<GH_REPO>` (e.g. `owner/buli-hub`).

## 1. Supabase project

1. Create a project. Region: Frankfurt (`eu-central-1`). The organisation is on
   the **Free** plan, which works but has three consequences worth knowing —
   see §4 for the one that matters:
   - **No automated backups.** Pro adds daily backups with retention; Free adds
     nothing.
   - **Projects pause after ~7 days of inactivity.** Production is used daily
     so this never fires; staging is used rarely, so it will.
   - **Two active projects per organisation.** Production and staging use both.
     A third environment means upgrading or pausing one.
2. **Auth → Providers → Discord**: enable; client ID/secret from the Discord
   Developer Portal (the production application — staging and local use a
   separate one, see §7). In the
   Discord portal, add the redirect
   `https://<project-ref>.supabase.co/auth/v1/callback`.
3. **Auth → URL configuration**: Site URL `https://<DOMAIN>`; additional
   redirect URLs: `https://<DOMAIN>/**`.
4. **Auth → Providers → Email**: disable sign-ups (Discord is the only way
   in).
5. Note the values for later: project URL, publishable key, secret key, and
   both connection strings — **session** (port 5432, for migrations) and
   **transaction pooler** (port 6543, for the app; `prepare: false` is
   already set app-side).
6. The schema arrives via the deploy workflow's `drizzle-kit migrate` on the
   first deploy — nothing to apply by hand.

## 2. Google Cloud project

```bash
gcloud projects create buli-hub   # or reuse; link billing
gcloud config set project buli-hub
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  iamcredentials.googleapis.com secretmanager.googleapis.com \
  monitoring.googleapis.com
gcloud artifacts repositories create buli-hub --repository-format=docker \
  --location=europe-west1
```

### Deployer service account + Workload Identity Federation

```bash
gcloud iam service-accounts create github-deployer
gcloud projects add-iam-policy-binding buli-hub \
  --member="serviceAccount:github-deployer@buli-hub.iam.gserviceaccount.com" \
  --role="roles/run.admin"
gcloud projects add-iam-policy-binding buli-hub \
  --member="serviceAccount:github-deployer@buli-hub.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"
gcloud iam service-accounts add-iam-policy-binding \
  "$(gcloud iam service-accounts list --filter=compute --format='value(email)')" \
  --member="serviceAccount:github-deployer@buli-hub.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

gcloud iam workload-identity-pools create github --location=global
gcloud iam workload-identity-pools providers create-oidc github \
  --location=global --workload-identity-pool=github \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='VGC-Gemeinde/buli-hub'"
gcloud iam service-accounts add-iam-policy-binding \
  github-deployer@buli-hub.iam.gserviceaccount.com \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/github/attribute.repository/VGC-Gemeinde/buli-hub"
```

### Secrets (runtime, injected into Cloud Run)

```bash
printf '%s' '<value>' | gcloud secrets create DATABASE_URL --data-file=-          # transaction pooler, port 6543
printf '%s' '<value>' | gcloud secrets create SUPABASE_SECRET_KEY --data-file=-
printf '%s' '<value>' | gcloud secrets create DISCORD_BOT_TOKEN --data-file=-
openssl rand -hex 32 | tr -d '\n' | gcloud secrets create JOBS_SECRET --data-file=-   # scheduled job routes, see §8
# Grant the *runtime* service account access:
gcloud secrets add-iam-policy-binding DATABASE_URL \
  --member="serviceAccount:<PROJECT_NUMBER>-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"   # repeat per secret
```

### Cloud Run service (first deploy creates it; then pin the config)

```bash
gcloud run deploy buli-hub --image <first image> --region europe-west1 \
  --no-invoker-iam-check \
  --min-instances=1 --max-instances=3 --memory=512Mi \
  --set-secrets=DATABASE_URL=DATABASE_URL:latest,SUPABASE_SECRET_KEY=SUPABASE_SECRET_KEY:latest,DISCORD_BOT_TOKEN=DISCORD_BOT_TOKEN:latest,JOBS_SECRET=JOBS_SECRET:latest \
  --set-env-vars=APP_BASE_URL=https://<DOMAIN>,DISCORD_GUILD_ID=…,DISCORD_ROLE_ID_DEV=…,DISCORD_ROLE_ID_ADMIN=…,DISCORD_ROLE_ID_STAFF=…,DISCORD_ROLE_ID_MOTW=…,DISCORD_RESULTS_CHANNEL_ID=…,DISCORD_FEEDBACK_FORUM_CHANNEL_ID=…,DISCORD_FEEDBACK_TAG_BUG=…,DISCORD_FEEDBACK_TAG_IDEA=…,DISCORD_LEAGUE_CATEGORY_ID=…,DISCORD_ROLE_ID_BULI_PLAYER=…
```

`min-instances=1` during the season (no cold starts); drop to 0 off-season.
Later deploys from CI swap the image and set `APP_BUILD_SHA` to the deployed
commit (`--update-env-vars`, so everything else sticks to the service).
`--no-invoker-iam-check` (instead of `--allow-unauthenticated`): the GCP
project sits under the VGC-Gemeinde organization, whose Domain Restricted
Sharing policy forbids `allUsers` IAM bindings — this flag is Cloud Run's
supported way to serve public traffic under that policy.

### Discord feedback forum

The in-app "Feedback geben" dialog opens one forum post per report.
`DISCORD_FEEDBACK_FORUM_CHANNEL_ID` may point at a forum in **any guild the
bot is a member of** — the API addresses channels by id alone — so reports can
live on the staff server while `DISCORD_GUILD_ID` stays the main server. To
use a second server, invite the same bot there and give it *View Channel*,
*Create Posts* and *Send Messages in Posts* on the forum.

The reporter only gets a "zum Thread" link when the thread's guild is
`DISCORD_GUILD_ID`; on any other server the app shows a plain thank-you
instead of a link the reporter cannot open. Moving the forum to the main
server later switches the links on by itself — but **the tag ids change with
the forum**, so `DISCORD_FEEDBACK_TAG_BUG` / `_IDEA` must be updated at the
same time. They fail silently: posts are simply created untagged.

### Domain

Cloud Run → custom domain mapping for `<DOMAIN>`, then set the DNS records
it prints at the registrar. `APP_BASE_URL`, the Supabase site URL, and the
Datenschutz page's imprint must all match the final domain.

## 3. GitHub repository configuration

Settings → Environments → **PROD** (the deploy job declares
`environment: PROD` — values anywhere else are not injected):

| Kind | Name | Value |
|---|---|---|
| Variable | `GCP_PROJECT_ID` | `buli-hub` |
| Variable | `GCP_REGION` | `europe-west1` |
| Variable | `GCP_ARTIFACT_REPO` | `buli-hub` |
| Variable | `GCP_SERVICE` | `buli-hub` |
| Variable | `GCP_WORKLOAD_IDENTITY_PROVIDER` | `projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/github/providers/github` |
| Variable | `GCP_DEPLOYER_SA` | `github-deployer@buli-hub.iam.gserviceaccount.com` |
| Variable | `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| Variable | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` |
| Secret | `PROD_DATABASE_URL` | **session** connection string (port 5432) — migrations need DDL over a stable session, not the transaction pooler |

Then: install the **Renovate** GitHub app on the repo (config is
`renovate.json`; weekly, grouped minor/patch — CI gates every update PR).

## 4. Observability & backups (minimal)

- **Uptime check** (Cloud Monitoring) on `https://<DOMAIN>/` + alert to the
  maintainer's email.
- **Log-based alert**: Cloud Run revision logs, filter `severity>=ERROR`,
  notify on new entries (catches failed Discord syncs — they log via
  `console.error`).
- **Backups**: `.github/workflows/backup.yml` dumps production to
  `gs://buli-hub-backups/nightly/` every night at 03:17 UTC, and on demand via
  *Run workflow*. Supabase's own automated backups are a Pro feature and the
  organisation is on Free, so this is the only restore point that exists.

  The workflow refuses to upload a dump that looks empty, so a silent auth
  failure cannot quietly replace a good backup with a useless one.

  The deploy service account holds `objectCreator` and `objectViewer` on the
  bucket and nothing more. It can write new archives and read them back, but it
  cannot delete or overwrite one, so a compromised workflow cannot destroy
  history. (`objectCreator` alone is not enough: `gcloud storage cp` reads the
  destination before writing.)

  Take a manual backup before anything risky — a migration that rewrites data,
  or any `db:clone-prod` run — either with the button or by hand:

  ```bash
  STAMP=$(date -u +%Y-%m-%dT%H-%M-%SZ); D=$(mktemp -d)
  pg_dump --schema=public --schema=drizzle --no-owner --file="$D/app.sql" "$PROD_DATABASE_URL"
  pg_dump --table=auth.users      --data-only --column-inserts --no-owner --file="$D/auth_users.sql"      "$PROD_DATABASE_URL"
  pg_dump --table=auth.identities --data-only --column-inserts --no-owner --file="$D/auth_identities.sql" "$PROD_DATABASE_URL"
  tar -czf "$D/buli-hub-$STAMP.tar.gz" -C "$D" app.sql auth_users.sql auth_identities.sql
  gcloud storage cp "$D/buli-hub-$STAMP.tar.gz" gs://buli-hub-backups/manual/
  ```

  `gs://buli-hub-backups` (europe-west1) is private, uniform-access,
  public-access-prevented and versioned. The dump covers exactly what a restore
  needs and what Supabase does not recreate: `public`, the `drizzle` journal,
  and `auth.users` / `auth.identities`.

  **Restoring** is the clone pipeline pointed at an archive instead of at
  production: drop `public` and `drizzle`, empty the two auth tables, then load
  `auth_users.sql`, `auth_identities.sql`, `app.sql` in that order. Strip
  `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin` first
  (`src/features/dev/clone/restore.ts`) or it fails on any non-superuser target.
  This has been exercised against the local stack from a freshly downloaded
  archive — row counts matched production.

  Archives expire after 180 days (non-current versions after 30). Cost is not a
  consideration: the whole database is ~3.6 MB and compresses to ~75 KB, so
  daily backups run around **$0.001/month** — even fifty times the current data
  stays under three cents.

  Still to do: put the above on a schedule.

- **Usage statistics** (`/staff/nutzung`, admin+; `docs/plans/usage-stats.md`)
  count page loads into the app database themselves, so nothing here needs
  setting up. One thing is run once, by hand: **the log backfill.** Cloud Run
  keeps request logs for **30 days** (the `_Default` log bucket's retention,
  unless raised in Logging → Logs Storage), so the month before the feature
  deployed can be replayed into the counters. Do it soon after the deploy,
  before that window moves on:

  ```bash
  gcloud auth login                       # needs read access to the project's logs
  npm run usage:backfill                  # dry run: prints what would be written
  npm run usage:backfill -- --apply       # writes to PROD_DATABASE_URL, once
  ```

  The script reduces every log row to an opaque visitor token on your machine
  (no address is sent anywhere), stops at the instant live counting began so
  the boundary day is not counted twice, and refuses to run a second time. A
  local rehearsal is `--target=$DATABASE_URL`. Staging is not backfilled.

## 5. Dress rehearsal (before announcing)

On the deployed service: sign in with a real Discord account → role sync
picks up the real guild roles → open a throwaway registration → register →
close → seed → create schedule → report a match → the post appears in the
results channel → drop/un-drop a player → wipe the throwaway season
(open a fresh registration window when the real one starts). Verify the
uptime check is green and a forced error shows up in Cloud Logging.

## 6. Cloning production

`npm run db:clone-prod` copies production into another database and turns it
into a test fixture. It solves two problems the local stack cannot:

- **Migrations are otherwise only ever tested against an empty database.** CI
  builds the schema from scratch with no rows in it, so the migrations that
  actually break — a `NOT NULL` on a column that has nulls, a unique index
  existing rows violate, a backfill that is instant on 10 rows — can only fail
  in production, during a deploy.
- **Features are otherwise only ever tested against invented data.** Seed
  fixtures cover the edge cases you thought of. The half-finished season, the
  division with an odd player count, the player who dropped mid-matchday and
  the name with an emoji in it are the ones you didn't.

### Prerequisites

- `pg_dump` and `psql` on PATH, at least as new as the server's major version
  (`pg_dump` refuses to dump from a newer server). The script checks this and
  names the version you need. Ubuntu ships 16; newer needs the PGDG repository.
- `PROD_DATABASE_URL` in `.env` — a **session-mode** connection to production
  (port 5432, not the 6543 transaction pooler: a dump needs a stable session
  and DDL).

  Take the **Session pooler** string from the dashboard (*Connect* → *Session
  pooler*), not the direct `db.<ref>.supabase.co` one. Supabase serves direct
  connections over **IPv6 only** unless the project has the IPv4 add-on, and
  most networks — WSL2 and GitHub-hosted runners among them — have no IPv6
  egress, so the direct string fails with `Network is unreachable`. The session
  pooler is IPv4 and is also port 5432. Its username carries the project ref:

  ```
  postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
  ```

> `DATABASE_URL` stays pointed at the local stack — it is the *write target*,
> and it is also what `npm run dev`, `drizzle-kit` and the integration tests
> use. Putting a production string there points the whole toolchain at
> production; the test suite truncates tables on startup.

> **`npm test` destroys a clone.** The integration tests clear shared tables in
> `beforeAll`, against whatever `DATABASE_URL` points at. That is harmless — it
> is only ever the local stack — but it means a clone and a test run cannot
> coexist. Re-run `db:clone-prod` afterwards; it takes well under a minute.

### Usage

```bash
npm run db:clone-prod -- --dry-run                 # show the plan, touch nothing
npm run db:clone-prod                              # clone as-is into the local stack
npm run db:clone-prod -- --shift="30 days"         # …and move every date 30 days later
npm run db:clone-prod -- --shift="-2 weeks 6 hours"
```

`--shift` is the highest-value flag: a dump is frozen at one moment in the
season, and offsetting every timestamp by one interval moves "today" to
wherever the test needs it — the day before a deadline, mid-matchday,
post-season. The same interval applies to every timestamp column in `public`
(enumerated from `information_schema`, so new tables are covered automatically),
which is what keeps the data internally consistent.

Full flag list: `npm run db:clone-prod -- --help`.

### What it does

1. **Dump** `public`, `drizzle` and the two `auth` tables from production.
   Read-only; production is never written to. The app dump is then filtered:
   production carries default-privilege ACLs for `supabase_admin`, and
   replaying those fails with `permission denied to change default privileges`
   on any target where you are not that role. Only those statements are
   removed — grants, policies and RLS all come across
   (`src/features/dev/clone/restore.ts`).
2. **Restore** into the target, replacing its `public` and `drizzle` schemas
   and its auth users outright.
3. **Scrub** (only with `--scrub`, see below).
4. **Clear `discord_posts`** — the copied rows point at message ids in the
   production channels, which the local/staging bot cannot reach.
5. **Shift dates** (only with `--shift`).
6. **Migrate.** Because the drizzle journal came across with the dump, the
   target inherits production's migration position, so `drizzle-kit migrate`
   applies exactly the migrations production has not seen yet — against
   production-shaped data. **This step is the migration rehearsal.** If it
   fails here, it would have failed in production.

### The privacy rule

Cloning copies real personal data: Discord ids, usernames, nicknames, avatars,
email addresses, social handles, the free text players wrote about themselves,
and their competitive history.

**Scrub when the clone lands somewhere that widens access.**

- *Local clone → no scrub.* You already have production database access; a
  clone on your own machine does not expand who can see the data, and
  scrubbing would only reduce the realism you are cloning for.
- *Staging clone → scrub.* Staging is reachable by more people. The script
  enforces this: a non-local target without `--scrub` is refused.

Everyone at **staff or above** (`profiles.role` of `staff`, `admin` or `dev`)
is exempt from everything below, so those people sign in as themselves and land
on their own copied data. They are the people who have staging access anyway,
which is why exempting them widens nothing — and it needs no list to maintain:
a role change in Discord is carried by the next refresh. Users below staff, and
users with no profile row at all, are scrubbed.

**What `--scrub` rewrites**

| Kind | Fields | Treatment |
|---|---|---|
| Identity | `profiles.display_name`, `username`, `avatar_url`; `auth.users.email`, `raw_user_meta_data`, `phone`; `auth.identities.identity_data`, `provider_id` | replaced with synthetic values |
| Social | `profiles.twitter_handle`, `bluesky_handle` | replaced, null stays null |
| Free text | `registrations.prev_name`, `greatest_achievements`; `disputes.reason`, `note` | replaced, null and rough length preserved |
| Quasi-identifier | `registrations.prev_season` / `prev_division` / `prev_placement` | **permuted between users** |

Three of those choices are deliberate and worth keeping:

- **Replaced, never deleted.** Nulling the social handles would mean no cloned
  profile ever renders a social link, so that part of the UI would go untested
  against realistic data — the opposite of why the clone exists. Same reason
  null-ness and rough length are preserved in the free-text fields.
- **Synthetic names keep what breaks layouts** — umlauts, emoji, very long
  names, mention-like strings, right-to-left text. Anonymising into
  "User 1..N" would remove exactly the realism being cloned for. A unit test
  asserts the fixture list still has each property.
- **Veteran history is permuted, not cleared.** A past season/division/
  placement triple is a published result, and nearly all of them are unique, so
  it names a real person however the display name reads. Permuting keeps the
  multiset of values — the seeding tool still sees a realistic spread — while
  no row keeps the history of the person it belongs to.

`profiles.origin` is left alone on purpose: roughly a dozen distinct values
across the whole user base makes it a category rather than free text.

### What the scrub cannot do

**A clone is pseudonymised, not anonymised.** Once a season is running, the
placements, matches and results come across identically to production. Anyone
holding both the staging data and the published standings can re-link every
player — "whoever is 7–0 at the top of Division 1a" is one person, whatever
name is displayed. That is inherent to cloning for realism: the shape of the
data cannot be preserved and its linkage removed at the same time.

So the scrub is not the primary control. The staging URL is unlisted and
`noindex`, and `/dev` needs `DEV_TOOLS_TOKEN` — those are what limit who holds
the data in the first place. `auth.users.created_at` / `last_sign_in_at` and
the user UUIDs also survive, being needed for foreign keys and weakly
identifying at most.

### Safety

The script drops and recreates the target's `public` and `drizzle` schemas, so
it refuses to run when:

- source and target are the same database,
- the target is `PROD_DATABASE_URL`,
- the target is not localhost and `CLONE_ALLOW_REMOTE_TARGET=true` is not set,
- the target is not localhost and `--scrub` was not passed.

### Working with cloned data

`/dev` gains a picker listing every copied user with their role and division.
Choosing one signs you in as that person via `/dev/login-as`, so you see
exactly their season, matches and results — the fastest way to reproduce
what a player reports. Role sync stays off outside production
(`DISCORD_GUILD_ID` and the three role ids unset), so the roles that came
across in the clone freeze exactly as they were.

## 7. Staging environment

A second deployment fed by cloned production data, so features and migrations
meet realistic data before production does. Local development covers most of
that (§6); staging exists for what local cannot do — rehearse migrations at
production data volume, exercise the real Discord OAuth round-trip through a
hosted Supabase project, verify Cloud Run behaviour (container, secrets, cold
starts), and provide a URL you can hand to a staff member.

| | Local | Staging | Production |
|---|---|---|---|
| **Runs** | `npm run dev` | Cloud Run `buli-hub-staging` | Cloud Run `buli-hub` |
| **Database** | Supabase CLI (Docker) | Supabase project #2 | Supabase project #1 |
| **Deployed from** | — | push to `dev` | push to `main` |
| **Data** | prod clone, on demand | prod clone, on demand | real |
| **Discord sign-in** | personas, or non-prod app | non-prod app | prod app |
| **Discord role reads** | off | off | real guild |
| **Discord posting** | test server | test server | real guild |
| **`/dev` tooling** | on | on (token) | **off** |
| **Public** | no | unlisted | yes |

### How the Discord configuration splits

Three independent concerns, three independent settings — which is what makes
this safe without any code changes:

1. **Sign-in** — `SUPABASE_AUTH_EXTERNAL_DISCORD_CLIENT_ID`/`_SECRET`. Local
   and staging both use the **non-production** Discord application, never the
   production one. Local development can also leave these as placeholders and
   sign in through `/dev` personas instead, which never touch Discord.
2. **Role reads** — `DISCORD_GUILD_ID` + the three role ids. **Left unset on
   local and staging.** `roleConfig()` returns null without all four, and
   `syncMember()` then returns the *stored* role unchanged, so the roles that
   came across in the clone freeze as they were. Nothing needs a test-server
   membership, and the staging role distribution mirrors the real one — more
   realistic than live reads would be.
3. **Posting** — `DISCORD_BOT_TOKEN` + channel ids. Staging posts to the
   **test** server. An unset channel id skips posting entirely, so a
   half-configured test server degrades to silence rather than to errors or
   misdirected messages.

Because they are independent, needing a test server for *posting* does not
force *role reads* through it. (Pointing role reads at the real guild from
staging would need the bot in both guilds, and "invite it with no permissions"
is not safe — a bot inherits `@everyone` permissions and can end up able to
post in public production channels. Keeping reads off avoids this entirely.)

Discord user ids are global, so `auth.identities.provider_id` stays valid in a
clone: signing into staging with a real Discord account resolves to the copied
user row — for staff and above, whom the scrub leaves untouched.

### Supabase project #2

Same steps as §1, with these differences: enable the Discord provider with the
**non-production** application's credentials, and add
`https://<staging-ref>.supabase.co/auth/v1/callback` to that application's
redirect URLs in the Discord Developer Portal. Email sign-ups disabled, as in
production. No schema needs applying by hand — the first deploy or refresh
supplies it.

If no non-production Discord application exists yet, create one now (Developer
Portal → *New Application*). It supplies two separate things staging needs: the
OAuth client ID/secret above, and — under *Bot* — the token that becomes
`DISCORD_BOT_TOKEN_TEST`. Never reuse the production application for either;
resetting its secret to recover it would break sign-in for the whole league.
Add `http://127.0.0.1:54321/auth/v1/callback` to the same application while you
are there, so the OAuth round-trip can also be exercised locally.

**Site URL and redirect URLs must wait for the Cloud Run URL**, which is only
generated when the service is created. Come back and set them after the next
step.

### Cloud Run service

Same project, region and Artifact Registry repository as production; image tags
differentiate.

```bash
gcloud run deploy buli-hub-staging --image <first image> --region europe-west1 \
  --no-invoker-iam-check \
  --min-instances=0 --max-instances=2 --memory=512Mi \
  --set-secrets=DATABASE_URL=STAGING_DATABASE_URL_POOLER:latest,SUPABASE_SECRET_KEY=STAGING_SUPABASE_SECRET_KEY:latest,DISCORD_BOT_TOKEN=DISCORD_BOT_TOKEN_TEST:latest,JOBS_SECRET=JOBS_SECRET_STAGING:latest \
  --set-env-vars=APP_ENV=staging,APP_BASE_URL=https://<staging-url>,ENABLE_DEV_TOOLS=true,DEV_TOOLS_TOKEN=<long random string>,DISCORD_RESULTS_CHANNEL_ID=<test server channel>,DISCORD_LEAGUE_CATEGORY_ID=<test server category>,DISCORD_ROLE_ID_BULI_PLAYER=<test server role>
```

Differences from production, each for a reason:

- `--min-instances=0` — cold starts are fine here, and it costs nothing idle.
- **No custom domain.** Staging is reachable only at its generated
  `*.run.app` URL: public, but unguessable and unlisted. `APP_ENV=staging`
  makes the app serve a disallow-all `robots.txt` and an
  `X-Robots-Tag: noindex, nofollow` header, so a pasted link cannot get it
  indexed.
- `APP_BASE_URL` must be the staging URL, or the "Zum Match" links in Discord
  posts point at production.
- **No role variables** — see above.
- `DISCORD_LEAGUE_CATEGORY_ID` / `DISCORD_ROLE_ID_BULI_PLAYER` point at the
  **test server**: the season setup resolves its guild from the category, so
  staging creates its roles and channels there. Its Cloud Scheduler job uses
  its own `JOBS_SECRET_STAGING` (§8).
- `ENABLE_DEV_TOOLS=true` + `DEV_TOOLS_TOKEN` turn on `/dev` (see below).

### Getting into `/dev` on staging

Everything under `/dev` returns **404** until the browser holds the unlock
cookie — the same response a missing route gives, so the staging URL alone does
not reveal that dev tooling is there. The cost is that a legitimate 404 looks
identical to a broken one; if `/` works and `/dev` 404s, you are simply not
unlocked.

The token lives only on the service. Print your unlock link with:

```bash
echo "$(gcloud run services describe buli-hub-staging --project=buli-hub --region=europe-west1 \
  --format='value(status.url)')/dev/unlock?token=$(gcloud run services describe buli-hub-staging \
  --project=buli-hub --region=europe-west1 \
  --format='value(spec.template.spec.containers[0].env)' | tr ';' '\n' \
  | grep DEV_TOOLS_TOKEN | sed "s/.*'value': '\([^']*\)'.*/\1/")"
```

Open it once per browser; the cookie lasts a week. Then use the picker on
`/dev` to impersonate a cloned user — `/dev/login-as` needs `?userId=<uuid>`
and returns 400 on its own.

> **`ENABLE_DEV_TOOLS` and `DEV_TOOLS_TOKEN` must never be set on the
> production service.** Together they allow signing in as any user. This is a
> deployment property, not a code guarantee: nothing in CI can catch it,
> because CI never inspects the production service's environment. If you ever
> touch production's env vars, check these two are absent.

### GitHub environment `STAGING`

Settings → Environments → **STAGING**, same variables as PROD (§3) with
staging values — `GCP_SERVICE` is `buli-hub-staging`, `NEXT_PUBLIC_SUPABASE_*`
point at project #2 — plus:

| Kind | Name | Value |
|---|---|---|
| Secret | `STAGING_DATABASE_URL` | staging **session** connection string (port 5432) |
| Secret | `PROD_DATABASE_URL` | production session string — the refresh workflow reads from it |

`GCP_WORKLOAD_IDENTITY_PROVIDER` and `GCP_DEPLOYER_SA` are the same values as
PROD; the deployer service account already has `run.admin` on the project.

### Two triggers, deliberately separate

| Action | Trigger | Effect |
|---|---|---|
| Build, migrate, deploy | push to `dev` | Fast. **Keeps existing data.** |
| Clone production | *Refresh staging from production* → Run workflow | Fresh prod-shaped baseline, scrubbed, then migrate. |

The instinct is "every staging deploy refreshes the database". That backfires:
you deploy, build up test state, find a bug, push a fix — and the refresh wipes
the state you were testing with. Every push would destroy the setup you just
made. Both paths end with `drizzle-kit migrate`, so staging is always at the
current schema either way.

### Working on `dev`

`dev` is the working branch; `main` is the release branch. Work lands on `dev`
and reaches production only by promotion.

**Direct pushes to `main` are rejected server-side.** The `main-protection`
ruleset (Settings → Rules) requires a pull request, requires the `checks` job to
pass, allows only squash merges, and blocks force-pushes and deletion. It has no
bypass actors, so it applies to organisation admins as well. Verified by
attempting a direct push: GitHub rejects it with `GH013`.

`.githooks/pre-push` refuses the same push locally, with a message pointing at
the promotion commands. Enable it once per clone:

```bash
git config core.hooksPath .githooks
```

The hook is convenience rather than the control: it fails in a second instead of
after a round trip. Since the ruleset is authoritative, `git push --no-verify`
will not get past it. A genuine emergency means disabling the ruleset, pushing,
and re-enabling it.

This is free because the repository is public; GitHub charges for branch
protection on private repositories. Secret scanning and push protection are
enabled for the same reason.

```bash
git checkout dev && …                       # commit freely; each push → staging
gh pr create --base main --head dev --title "<feature>"
gh pr merge --squash --delete-branch=false   # one commit on main → production
git checkout dev && git fetch origin && git reset --hard origin/main && git push --force-with-lease
```

That last line is required, not tidying. A squash-merge creates one new commit
on `main` while `dev` keeps the originals: same tree, divergent history. Without
the reset the next promotion computes the old merge base, replays commits that
are already on `main`, and conflicts. Resetting `dev` onto `main` after every
promotion keeps the two a single line.

Merge commits would avoid the reset, at the cost of putting every intermediate
`dev` commit on `main` — which is why the squash is kept (see CLAUDE.md's
one-commit-per-feature rule).

A production hotfix that cannot wait for whatever is on `dev` goes on a branch
off `main` and straight into a PR to `main`; afterwards reset `dev` onto `main`
as above.

### Cost

Staging runs at **no cost**: Supabase project #2 is on the Free plan, Cloud Run
is effectively free at `min-instances=0`, and staging images share the existing
Artifact Registry repository.

The Free plan's trade is that a project **pauses after roughly 7 days of
inactivity**, which is exactly what a rarely-used staging environment does. In
practice that means staging will sometimes be asleep when you go to use it:
unpause it in the dashboard, then run the refresh workflow. Expect a paused
project to fail the refresh rather than silently do nothing.

If that becomes tiresome, Pro is about $10/month for the smallest instance —
but the stronger argument for Pro is backups for *production* (§4), not
convenience for staging.

(Supabase's own Branching feature seeds branches from migrations and a seed
file rather than from production data — the opposite of what this is for.)

## 8. Scheduled jobs (Cloud Scheduler)

Route handlers under `/api/jobs/*` are Cloud Scheduler targets, authorized
by a shared secret the scheduler sends as `Authorization: Bearer
<JOBS_SECRET>` (`src/lib/jobs.ts`). The routes are idempotent converges, so
a repeated or overlapping run is harmless. Each environment has its own
secret and its own jobs; a job never crosses environments because the URL
and the secret both belong to one service.

### Discord season sync

Keeps the Discord server converged onto the running season: group roles and
private group channels per sub-division, the Buli-Spieler role on exactly
the active placed players (docs/plans/discord-season-setup.md). It also
runs inline when the Spielplan is published and on the staff dashboard's
"Jetzt abgleichen"; the scheduled run is what catches drops, late joiners
and hand-edits. Before the schedule is published the route is a no-op.

**Server preparation** (production server and test server alike; role and
channel ids are not secrets):

1. The bot's role needs **Manage Roles** and **Manage Channels**, and must
   sit **above** the Buli-Spieler role in the role list (it can only assign
   roles below its own). Keep it below the staff roles. Not Administrator.
2. A permanent **league category**. It may contain public channels: the
   hub denies `@everyone` on each group channel itself. The category's
   overwrites decide who sees *every* group channel (Liga-Staff,
   Server-Staff, Admins) and should also allow the bot's role, because
   channels inherit them at creation.
3. A permanent, mentionable **Buli-Spieler** role.
4. The **Server Members Intent** (Developer Portal) stays enabled.

**Environment** (both ids into the service's env, the secret into Secret
Manager — see the deploy commands in §2 / §7):

```bash
printf '%s' "$(openssl rand -hex 32)" | gcloud secrets create JOBS_SECRET_STAGING --data-file=-
gcloud run services update buli-hub-staging --region europe-west1 \
  --update-secrets=JOBS_SECRET=JOBS_SECRET_STAGING:latest \
  --update-env-vars=DISCORD_LEAGUE_CATEGORY_ID=<test server category>,DISCORD_ROLE_ID_BULI_PLAYER=<test server role>
```

**Job** (every 15 minutes; the attempt deadline covers a first full run on
a fresh season, which is a few minutes of rate-limited role calls):

```bash
gcloud scheduler jobs create http discord-season-sync-staging \
  --location europe-west1 --schedule "*/15 * * * *" \
  --uri "https://<staging-url>/api/jobs/discord-season-sync" \
  --http-method POST --attempt-deadline 600s \
  --headers "Authorization=Bearer $(gcloud secrets versions access latest --secret JOBS_SECRET_STAGING)"
```

Production: the same with `buli-hub`, `JOBS_SECRET`, the production ids and
the production URL, named `discord-season-sync`. The header is stored in
the job, so rotating the secret means updating the job
(`gcloud scheduler jobs update http … --update-headers …`).

**First run on a season that is already published.** The inline sync only
fires on "Pairings veröffentlichen"; when the feature meets a running
season, the first run is the one that creates every role and channel,
assigns 100+ players and strips the Buli-Spieler role from everyone else.
Keep the production job paused (`gcloud scheduler jobs pause
discord-season-sync --location europe-west1`) until staff have triggered
that first run deliberately via "Jetzt abgleichen" on `/staff` and checked
the server; then `gcloud scheduler jobs resume …`.

**Verification:** `curl -X POST -H "Authorization: Bearer …"
https://…/api/jobs/discord-season-sync` answers the sync report as JSON
(`{"skipped": …}` before a published schedule or without the ids). A wrong
secret answers 401, a service without `JOBS_SECRET` 503. On the staff
dashboard the Discord card appears only while the last report says the
server does not match the league, or when no run happened for over an hour
(the scheduler is not calling).
