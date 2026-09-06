# Deployment

**Status: repo side done** (2026-07-06) — squash (schema-dump verified
identical), Dockerfile (built and smoke-tested locally against the dev
stack), CI/CD workflow, Renovate config, runbook, CLAUDE.md pinned. Open:
the one-time console work per `docs/deployment.md` (maintainer), then the
dress rehearsal.

## Context

Everything so far runs only on the local stack. This slice takes the hub to
production for season one: containerized Next.js on Cloud Run, a hosted
Supabase project, secrets in Google Secret Manager, CI/CD via GitHub
Actions, the go-live migration squash, and Renovate (coupled to CI existing,
per CLAUDE.md). One production environment — local dev remains the only
other environment; no staging, no preview deploys.

## Scope

**In (repo changes):**
- **`next.config.ts`**: `output: "standalone"`.
- **`Dockerfile`** (+ `.dockerignore`): multi-stage on `node:24-alpine` —
  `npm ci` → `next build` → copy the standalone output; runs `server.js`
  with `HOSTNAME=0.0.0.0`, listening on `PORT` (Cloud Run sets it).
  `NEXT_PUBLIC_*` values are **inlined at build time** and therefore passed
  as build args by the deploy workflow, not runtime env.
- **CI (`.github/workflows/ci.yml`)** — on every PR and push to main:
  Biome (`biome ci`), `tsc --noEmit`, the full Vitest suite with a real
  local stack (`supabase/setup-cli` → `supabase start` →
  `drizzle-kit migrate` → `npm test -- --run`; the integration tests need
  the `auth` schema, so plain Postgres is not enough), and `next build`
  with dummy env.
- **CD (`.github/workflows/deploy.yml`)** — on push to main, after CI:
  authenticate via **Workload Identity Federation** (no long-lived keys),
  build + push the image to Artifact Registry, run
  `drizzle-kit migrate` against the production `DATABASE_URL` (GitHub
  secret), then `gcloud run deploy`. Every main commit ships — matching
  the one-commit-per-feature discipline.
- **Migration squash** (see `docs/decisions/migrations-squash-at-launch.md`):
  delete the 31 per-feature migrations + journal, generate one fresh
  baseline from `schema.ts`, and re-author **one** consolidated custom
  migration holding everything Drizzle cannot express (all auth.users FKs,
  every `ENABLE ROW LEVEL SECURITY`, the profiles RLS policies + column
  grants, the disputes partial unique index). Verification: `pg_dump
  --schema-only` of the old chain vs. the new chain must diff clean (modulo
  ordering), then `supabase db reset` + full test suite.
- **`docs/deployment.md` runbook** (session independence — the one-time
  console work must be reproducible): GCP project + Artifact Registry +
  Cloud Run service + WIF pool/provider + deployer service account; Secret
  Manager entries; Supabase project setup (Discord OAuth provider, site +
  redirect URLs, email signups off); Cloud Run configuration (region
  **europe-west1**, `min-instances=1` during the season, max small, 512Mi);
  domain mapping + `APP_BASE_URL`; the full env/secret inventory table;
  minimal observability (uptime check on `/`, log-based alert on error
  entries); backup/PITR verification on the Supabase plan.
- **Renovate**: `renovate.json` (pinned deps → `rangeStrategy` n/a, group
  minor/patch, weekly), app enabled on the repo once CI is green.
- **CLAUDE.md**: CI/CD section becomes pinned (workflows, deploy commands),
  the open decision is removed.

**Out (deferred):**
- Cloud Scheduler — wired later by the first scheduled route, the Discord
  season sync (docs/plans/discord-season-setup.md; setup in
  docs/deployment.md §8).
- Staging/preview environments, e2e smoke tests, Sentry-style APM.
- Supabase Storage setup (unused so far).

## Env & secret inventory

| Name | Where | Secret? |
|---|---|---|
| `DATABASE_URL` (pooler, port 6543 — `prepare: false` is already set) | Cloud Run + GH deploy secret | yes |
| `SUPABASE_SECRET_KEY` | Cloud Run | yes |
| `DISCORD_BOT_TOKEN` | Cloud Run | yes |
| `NEXT_PUBLIC_SUPABASE_URL` / `..._PUBLISHABLE_KEY` | image build args | no |
| `DISCORD_GUILD_ID`, `DISCORD_ROLE_ID_{DEV,ADMIN,STAFF}`, `DISCORD_ROLE_ID_MOTW` (optional) | Cloud Run env | no |
| `DISCORD_RESULTS_TOP_CHANNEL_ID`, `DISCORD_RESULTS_CHANNEL_ID`, `DISCORD_MOTW_CHANNEL_ID` | Cloud Run env | no |
| `APP_BASE_URL` | Cloud Run env | no |

## Verification (the dress rehearsal, from the launch checklist)

On the deployed service, before announcing: sign in with a real Discord
account, role sync against the real guild, open a throwaway registration →
register → close → seed → schedule → report a match → confirm the Discord
post in the real (test) channel → wipe the throwaway season. Plus: uptime
check firing, a forced error visible in Cloud Logging, cookie behavior
(spoilers, auth) behind the Cloud Run domain.

## Open questions

- GCP project/billing and Supabase org: maintainer accounts. Supabase
  **Pro** recommended (daily backups; free tier pauses on inactivity).
- Domain name + where DNS lives (needed for `APP_BASE_URL`, OAuth site URL,
  Cloud Run domain mapping).

## Delivery

Branch `feat/deployment`, squash-merged to main as one commit (repo changes
+ runbook; the console work follows the runbook).
