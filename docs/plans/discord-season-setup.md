# Discord season setup (Saison-Rollen und Gruppenkanäle)

**Status: implemented** (2026-09-06) — unit/integration tests, typecheck,
production build. Still open: the first run against the test server from
staging (roles, channels, permissions as a member with and without the group
role) and the Cloud Scheduler jobs, see docs/deployment.md §8.

Publishing the Spielplan ("Pairings veröffentlichen", docs/plans/schedule-publish.md)
is the moment the season becomes real for players. This feature makes the
Discord server follow suit, automatically, in the same step, and keeps it in
line for the rest of the season:

- every placed player gets the permanent **Buli-Spieler** role (the ping
  role), after that role has been emptied of last season's holders;
- every sub-division gets its own **group role** and a private **group text
  channel** inside a fixed league category; the group role is what grants
  access to the channel; each placed player gets their group's role;
- roles and channels the hub created are **tracked by id per season** so
  they can be removed after the season (the removal itself is a later
  feature). Ids, not names, are the identity: a moderator renaming a channel
  changes nothing for the hub.

Discord stays a thin output channel (CLAUDE.md): the hub decides who is in
which group, Discord only mirrors it. The setup is **convergent**: a sync
reads the current state, computes what differs from the season's desired
state and applies only that. It runs inline on publish, then **periodically
and silently** via Cloud Scheduler. Staff see nothing as long as Discord
matches; a card on the staff dashboard appears only when something does not.

## Two kinds of Discord objects

| | Buli-Spieler role | Group role, group channel |
|---|---|---|
| Lifetime | permanent, created by server admins once | per season, created by the hub on publish |
| Configured via | env (`DISCORD_ROLE_ID_BULI_PLAYER`) | tracked in the database (`discord_season_resources`) |
| Membership | hub-owned: exactly the season's active placed players | hub-owned: the sub-division's active placed players |
| Used for | pings (`@Buli-Spieler`) | channel access (view), group pings |
| Cleanup | never deleted; emptied and refilled on the next publish | deleted after the season by the (later) cleanup feature |

"Active placed player" = a `placements` row of the window with a
`sub_division_id` and `dropped_at is null`. Players without a Discord id in
their auth metadata, and players who are not on the server (not in the
member list), are skipped and reported by name; they are not an error.

Because the desired state is always "the active placed players", the
periodic sync also covers what would otherwise need hooks: a dropped player
loses both roles on the next run, a player who joins the server late gets
them on the next run, a role a moderator removed by hand comes back. The
Buli-Spieler role is stripped from every holder who is not an active placed
player on every run, so the ping role is exactly the league, always.

## Category and visibility

All group channels are created inside **one permanent category** whose id is
configured (`DISCORD_LEAGUE_CATEGORY_ID`). The category also holds public
channels, so it does not hide anything itself; who may see *all* group
channels (Liga-Staff, Server-Staff, Admins, the bot's role) is the
category's own permission overwrites, owned by the server admins and **not**
configured in the hub. A channel created under the category without explicit
overwrites inherits ("syncs") exactly those. The hub then adds three
overwrites per channel, in this order:

- the bot user: **allow** View Channel, so denying `@everyone` next can
  never lock the bot out of its own channel (independent of whether the
  category lists the bot's role);
- the group role: **allow** View Channel (sending is allowed by default once
  a member can see the channel; nothing else is granted);
- `@everyone`: **deny** View Channel. This is what makes the channel
  private; it is the channel's own business, not the category's.

Every run re-checks these three (only the View Channel bit) and re-applies
what a moderator removed; other permissions on the same overwrites are left
alone. Consequence worth knowing: after the hub adds its overwrites the
channel is no longer marked "synced" with the category. Its copy of the
category overwrites stays, but a later change to the category's staff roles
does not propagate to already created channels. For a per-season channel
this is acceptable; the cleanup feature removes them anyway.

The guild is resolved from the category (`GET /channels/{id}` returns
`guild_id`), exactly like the feedback forum resolves its guild. So the
feature needs no `DISCORD_GUILD_ID`, which stays unset on local and staging
(docs/deployment.md §7): staging points the category and the ping role at the
**test server** and exercises the whole flow there.

## Naming

Names are display only; the tracked ids are what the hub relies on.

- group role: `Division 1a` (`subDivisionName`), mentionable, not hoisted,
  no colour;
- group channel: `division-1a` (Discord lowercases text channel names).

Pure helpers `groupRoleName(tier, position)` and `groupChannelName(tier,
position)`. Names are set once at creation and never enforced afterwards:
moderators may rename freely.

## Configuration (env)

| var | value |
|---|---|
| `DISCORD_LEAGUE_CATEGORY_ID` | id of the permanent league category (test server on staging) |
| `DISCORD_ROLE_ID_BULI_PLAYER` | id of the permanent Buli-Spieler role (test server on staging) |
| `JOBS_SECRET` | shared secret Cloud Scheduler sends as `Authorization: Bearer …` to the job route |

The first two unset → the whole feature is skipped silently (publish works
as today, no card, the job route answers "nothing configured"), matching how
the results channel and the feedback forum degrade. One set without the
other → skipped with a `console.error`, because that is a misconfiguration
and not local dev. `JOBS_SECRET` unset → the job route answers 503; the
inline sync on publish and the manual button do not need it. All three go
into `.env.example`, the Cloud Run env of both services (the secret via
Secret Manager) and docs/deployment.md.

## Bot permissions and server preparation (maintainer steps)

The bot currently only reads members and posts messages. This feature makes
it create roles, assign roles, create channels and edit channel permissions.
Needed, on the production server and mirrored on the test server:

1. **Manage Roles** (guild-wide). Creating roles, adding/removing roles on
   members, and editing channel permission overwrites all require it. Discord
   additionally enforces the **role hierarchy**: the bot can only assign or
   edit roles positioned *below its own highest role*. So the bot's role must
   sit **above** `Buli-Spieler` in the server's role list. New roles are
   created at the bottom of the list, so the group roles are automatically
   below the bot. Keep the bot's role *below* the staff/admin roles: Manage
   Roles lets it edit any role beneath it, so a low position limits the blast
   radius of a bug or a leaked token.
2. **Manage Channels**. The create-channel endpoint is documented as
   requiring it; grant it guild-wide (the safe reading of the docs), and
   verify on the test server whether a category-only overwrite would also
   do. The hub only ever creates channels under the configured category.
3. **On the league category, an overwrite for the bot's role** allowing View
   Channel (Manage Channels and Manage Permissions there too if they are not
   granted guild-wide). Channels inherit it at creation, and the overwrites
   the bot writes may only contain permissions it holds in that channel
   itself. The hub additionally writes a member overwrite for the bot user
   on every group channel, so this is belt and braces rather than the only
   thing keeping the bot in.
4. **Server Members Intent** stays enabled (already on for the membership
   sweep; a Developer Portal setting, not a server one). Every sync reads the
   full member list with roles once.
5. **Not Administrator.** Everything above is sufficient and scoped.
6. The category itself: allow View Channel for Liga-Staff, Server-Staff,
   Admins (and whoever else should see every group chat, e.g. the MOTW-Team,
   which is a server decision, not a hub one). It need not deny `@everyone`:
   the group channels do that themselves, and the category keeps its public
   channels.
7. Create the `Buli-Spieler` role if it does not exist yet (mentionable), and
   the same role plus a category on the test server for staging.

Permissions are edited on the bot's role in Server Settings; the invite link
only pre-sets that role when the bot joins. A re-invite is needed only for a
change of OAuth *scopes*, never for permissions.

Verification path: staging with the test server first (publish there, check
roles, channels and their permissions), then production.

## Schema

Two new server-only tables, RLS on and no policies like `discord_posts`:

```
discord_season_resources
  id               uuid PK default random
  window_id        uuid not null   -- FK registration_windows (cascade)
  sub_division_id  uuid not null   -- FK sub_divisions (cascade)
  kind             enum discord_season_resource_kind: group_role | group_channel
  discord_id       text not null   -- the role id / channel id on Discord
  created_at       timestamptz default now
  unique (sub_division_id, kind)

discord_season_sync_state
  window_id        uuid PK         -- FK registration_windows (cascade)
  ran_at           timestamptz not null
  report           jsonb not null  -- SeasonDiscordReport, zod-validated on read
```

`window_id` on the resources is redundant with the sub-division but is what
the cleanup will query by ("everything of season 12"). No `deleted_at`: the
cleanup deletes the row together with the Discord object. The sync state is
one row per window, overwritten by every run; it is what the staff card
reads, so a page load never talks to Discord.

Migrations: generated (tables + enum) plus custom
`discord_season_fk_rls` (FKs, RLS on, no policies), the same split as
`discord_posts`.

## Feature folder `src/features/discord-season/`

- `naming.ts` (pure) — `groupRoleName`, `groupChannelName`, the permission
  bit constants (`VIEW_CHANNEL = 1 << 10`) and the two overwrite payloads.
- `plan.ts` (pure, the core) — `planSeasonDiscord(desired, current)`:
  - input: desired state (per sub-division: tier/position, active players'
    Discord ids; the Buli-Spieler role id), current state (tracked
    resources, the guild's roles and the category's channels, guild members
    with their roles);
  - split in two so the second can use ids the first created:
    `planGroupResources` (per sub-division: role and channel exist, or must
    be created — including tracked ones whose Discord object no longer
    exists) and `planMemberRoles` (per member: hub roles to add, hub roles
    to remove; players skipped as not on the server or without a Discord
    id). `missingOverwrites` says which of the three channel overwrites a
    channel lacks.
- `report.ts` (pure) — the `SeasonDiscordReport` zod schema (`groupsReady`,
  `groupsTotal`, `playersReady`, `playersTotal`, `skipped: {name, reason}[]`,
  `error: string | null`), `needsAttention(state, now)`: true when no run
  exists, on an error, missing groups, a player skipped for a hub-side
  reason (no Discord id), or a last run older than one hour (the scheduler
  is not running); and `cardView(state, now)`, the card's props. Players
  who are merely not on the server do **not** raise the card: the
  Discord-Mitgliedschaft feature already reports them.
- `converge.ts` — `syncSeasonDiscord(windowId)`: loads desired state
  (placed identities + group names), reads current state from Discord
  (category → guild, bot user, guild roles, guild channels: 4 calls), runs
  the plan, executes operations **sequentially** in a fixed order (per
  group: role → channel → overwrites; then, after fetching the member list
  with roles, member role removals, then additions), recording
  created resources in the table **immediately** after each create so an
  interrupted run never creates duplicates, then stores the report. Every
  entry point catches, logs with a `[discord-season]` prefix, stores the
  error in the report and returns; a Discord failure never throws out of a
  caller. Takes the Discord calls as an injected `SeasonDiscordClient`
  object so the orchestration is unit-testable with a fake. Skips entirely
  when unconfigured or the window has no published schedule.
- `queries.ts` — `listPlacedIdentities(windowId)` (placements ⨝ auth.users,
  the `listRegisteredIdentities` shape), `trackedResources(windowId)`,
  `recordResource(...)`, `replaceResource(...)` (after a self-heal),
  `saveSyncState`, `getSyncState`.
- `actions.ts` — `syncSeasonDiscordNow()` server action (staff+, latest
  window) behind the card's button; revalidates `/staff`.
- `components/discord-season-card.tsx` — the attention card.

`src/app/api/jobs/discord-season-sync/route.ts` — `POST`, the Cloud
Scheduler target and the repo's first scheduled route. Authorizes via
`Authorization: Bearer <JOBS_SECRET>` (timing-safe compare, pure helper
`authorizeJob(header, secret)` in `src/lib/jobs.ts`; 503 without a
configured secret, 401 on mismatch), then runs `syncSeasonDiscord` for the
latest window and answers with the report. Idempotent, so an overlapping or
repeated invocation is harmless.

`src/lib/discord.ts` gains thin REST wrappers, typed outcomes like the
existing ones: `fetchChannel` (type + guild id), `fetchGuildRoles`,
`fetchGuildChannels`, `fetchGuildMembers` (id + roles; `fetchGuildMemberIds`
becomes a projection of it), `createGuildRole`, `createGuildTextChannel`
(`parent_id`, no overwrites), `putChannelPermissionOverwrite`,
`addMemberRole`, `removeMemberRole` (404 = not a member, typed).

Rate limits: the member role calls are the bulk (two per player on the first
run; a steady-state run has none). All wrappers honour a `429` by waiting
`retry_after` (bounded) and retrying once; calls run sequentially. A full
first run is expected to take on the order of one to a few minutes at league
size; Cloud Run's default request timeout is 300 s. If a run is ever cut
off, the next one finishes the rest.

## Triggers

1. **Publish.** `publishSchedule()`: after `markSchedulePublished` and
   `revalidatePath`, `await syncSeasonDiscord(window.id)`. The season is
   live in the database first, so the Discord work can neither delay nor
   block it. The publish dialog's pending state says that the Discord setup
   runs along and may take a few minutes. Inline, not left to the
   scheduler: players expect their channel at announcement time.
2. **Cloud Scheduler**, every 15 minutes, on production and staging, POSTing
   the job route with the bearer header; attempt deadline 10 minutes. The
   job is what keeps drops, late joiners and hand-edits converged. Set up
   once per environment with `gcloud scheduler jobs create http …`,
   documented in docs/deployment.md.
3. **Manual**, the card's button, for an immediate fix.

Roles and channels are **never** created before publishing: a group role
would tell a player their group while the Spielplan is still hidden. Before
publication the job route and the action are no-ops.

## Staff view (`/staff`)

`DiscordSeasonCard`, todo-card anatomy (orange), rendered in
`regular_season` only when `needsAttention` is true for the stored report,
above the MotW todo. Otherwise nothing: a converged Discord is invisible.

- title "Discord stimmt nicht mit der Liga überein", body with the two
  counts (Gruppen mit Rolle und Kanal x/y, Spieler mit beiden Rollen a/b),
  the last run's time, the error line if any, and the players skipped with
  their reason ("keine Discord-ID", "Fehler");
- stale variant: "Der Discord-Abgleich läuft nicht", last run time, same
  button, so a broken scheduler is noticed within the hour; never-run
  variant: "Discord wurde noch nicht mit der Liga abgeglichen";
- button **"Jetzt abgleichen"** → `syncSeasonDiscordNow`, pending state,
  error inline, on success the page re-renders and the card disappears if
  the run converged.

## Dev tooling

- Gallery: the card in its three states (attention with error and skipped
  players, stale, never run).
- No persona or seed changes. Personas carry fake snowflakes, which the sync
  reports as "nicht auf dem Server" on staging, which is the honest outcome.

## Tests

- **Unit** (`naming.test.ts`, `plan.test.ts`, `report.test.ts`,
  `converge.test.ts` with a fake client, `jobs.test.ts`):
  - names for tiers and positions;
  - plan: nothing to do on a converged state; missing role/channel per
    group; tracked resource whose Discord object is gone → recreate; member
    missing one or both roles; holder of Buli-Spieler who is not placed →
    remove; dropped player → remove group and ping roles; player without
    Discord id → skipped with reason; player not in the member list →
    skipped with reason;
  - `needsAttention`: each trigger, and that non-members alone do not raise
    the card;
  - converge: executes in order, records each created resource before
    continuing, stops on the first failing create but still stores a
    report, a 404 on a member role call becomes a skip not an error, 429 is
    retried, an unconfigured environment is a no-op;
  - `authorizeJob`: missing secret, missing header, wrong value, right
    value.
- **Integration**: `listPlacedIdentities` excludes dropped and ungrouped
  placements and maps the Discord id; resource record/replace and the unique
  constraint; sync state upsert; cascade on window delete.
- **Not tested**: the REST wrappers (thin fetch), the route handler beyond
  its pure helper, per house rule.
- **Manual**: staging against the test server, the publish path, the job
  route via `curl` with the bearer header, the button; permission check of
  a created channel as a member with and without the group role.

## Deploy order

1. Server preparation (bot permissions, category, Buli-Spieler role) on the
   test server and production, ids noted.
2. Env vars and the `JOBS_SECRET` secret on both Cloud Run services.
3. Code + migration via `dev` → staging test → PR to `main`.
4. Cloud Scheduler jobs for staging and production.

The migration is additive; the code degrades to today's behaviour until the
env vars exist, and the job route is inert without its secret.

## Scope

**In:** the two tables + migrations, the pure plan and report, the converge,
the REST wrappers, the publish hook, the job route + Cloud Scheduler setup
docs, the staff card with the manual button, env + deployment docs, gallery,
tests.

**Out:** the post-season cleanup (deleting tracked roles/channels, which is
what the resources table is for); posting an announcement or a welcome
message into the group channels; group channels for anything but the regular
season (playoffs); changing who can see the category (server admins own it).

## Open questions

None open.
