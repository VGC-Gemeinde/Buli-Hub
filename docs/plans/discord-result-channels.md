# Discord result channels (drei Kanäle statt einem)

**Status: implemented** (2026-09-06) — routing, config, move-on-mismatch,
env template, deployment docs, dev tooling; unit tests, typecheck and the
full suite pass. The two new variables are set on both Cloud Run services
(production: the real Div 1+2 and MotW channels; staging: all three point at
the one test channel). Still open: the manual pass on staging after the
next deploy.

## Context

The result posts and the Match-of-the-Week VOD announcement
(docs/plans/discord-result-posts.md) currently all go into one channel,
`DISCORD_RESULTS_CHANNEL_ID`. The league has always run **three** channels,
and the community reads them that way:

1. results of **Division 1 and 2**;
2. results of **every other division**;
3. **Match of the Week** announcements, on their own.

One channel for everything is a regression against past seasons. This
feature restores the split and makes the split impossible to lose silently:
a service that is only half configured posts nothing and logs an error,
instead of quietly falling back to a single channel.

Discord stays a thin output channel (CLAUDE.md): which channel a match
belongs to is decided by a pure function from the match's division tier,
nothing else changes in what is posted or when.

## Scope

**In:**
- Three configured channels. Result posts are routed by the division tier
  of the match; the VOD announcement always goes to the MotW channel.
- A stored post that sits in a channel other than the one it belongs to is
  **moved** (deleted there, posted fresh in the right one) the next time
  the match is synced. The channels mirror the hub; a post in the wrong
  channel is a mismatch like any other.
- All-or-nothing configuration, misconfiguration logged, env template and
  deployment docs, dev tooling copy, tests.

**Out:**
- Backfilling or moving posts that are never touched again (a post only
  converges when its match changes; nothing sweeps the channels).
- Per-division channels, per-season channels, pairing announcements.
- Making the "top" boundary configurable. Division 1 and 2 is the league's
  convention; a constant in code is enough until the league changes it.

## Routing

`src/features/discord-posts/channels.ts` (pure, unit-tested):

```ts
export const TOP_RESULT_TIERS = 2; // tier <= 2 → the Div 1+2 channel

export type ResultChannels = {
  topResults: string;   // DISCORD_RESULTS_TOP_CHANNEL_ID
  otherResults: string; // DISCORD_RESULTS_CHANNEL_ID
  motw: string;         // DISCORD_MOTW_CHANNEL_ID
};

export function resultChannelFor(tier: number, channels: ResultChannels): string;
export function resultChannels(env): ResultChannels | null;
```

`resultChannelFor` returns `topResults` for tier 1 and 2, `otherResults`
for everything else. `resultChannels` reads the three variables: none set →
`null` (local dev, silent no-op, unchanged behaviour); all three set → the
config; anything in between → `console.error` naming the missing variables
and `null`. Same pattern as `seasonDiscordConfig` in
`src/features/discord-season/config.ts`. Three variables may hold the same
id, which is how staging points everything at one test channel.

`DISCORD_RESULTS_CHANNEL_ID` keeps its name and becomes the "other
divisions" channel: on production it already points at the general results
channel, so the variable that has to change meaning is the one that does
not have to change value.

## Sync changes (`sync.ts`)

- `configuredChannel()` becomes `resultChannels()`; both entry points
  return early on `null` as today.
- `syncResultPost` passes `resultChannelFor(match.tier, channels)`,
  `syncMotwVodPost` passes `channels.motw`.
- `putMessage(kind, matchId, channelId, content)`: when a stored post exists
  in a **different** channel than `channelId`, delete it there (404 ignored)
  and fall through to a fresh post, exactly the path the 404 self-heal
  already takes. The row is re-pointed by the existing `upsertPost`. Same
  channel → edit in place as today.
- `getMatchForReport` in `src/features/reporting/queries.ts` exposes `tier`
  (it already selects it; adding a field breaks no caller).

The `discord_posts.channel_id` column keeps its purpose: it is what lets the
sync find and remove a message wherever it was posted, which is also what
makes the move possible.

## Configuration

| var | value |
|---|---|
| `DISCORD_RESULTS_TOP_CHANNEL_ID` | results channel for Division 1 and 2 |
| `DISCORD_RESULTS_CHANNEL_ID` | results channel for every other division |
| `DISCORD_MOTW_CHANNEL_ID` | Match-of-the-Week announcements |

Updated: `.env.example` (one comment block for the three), `docs/deployment.md`
(the production `--set-env-vars` line and the staging one in §7; staging
points all three at the test server, they may be the same channel),
`docs/plans/deployment.md` env table, `docs/plans/staging-environment.md`
(the posting bundle now names three ids), and the config section of
`docs/plans/discord-result-posts.md` rewritten to describe the routing as
the present design.

## Dev tooling

- `/dev/report-results` and the `/dev` card say "Discord-Sync übersprungen"
  based on `resultChannels()`, not on one variable.
- `reportDevResults` orders open matches so the first reported ones come
  from **both** a top-tier and a lower-tier group (alternate by tier, then
  round), so `count=5` exercises both result channels against the test
  server; ordered by round alone, the first five open matches of a round
  could all sit in Division 1.
- No gallery or persona changes: nothing visual is added.

## Tests

- **Unit** (`channels.test.ts`): tiers 1 and 2 route to `topResults`, tier 3
  and a high tier to `otherResults`; config: nothing set → null, all set →
  config, each partial combination → null with an error logged (spy on
  `console.error`), identical ids for all three are accepted.
- **Unit** (`messages.test.ts`): unchanged, the message text does not
  depend on the channel.
- **Integration** (`queries.integration.test.ts`): unchanged; `upsertPost`
  already re-points `channel_id` on conflict, which the move relies on.
- `sync.ts` stays an untested thin shell around tested decisions, per house
  rule; the move branch mirrors the existing 404 branch.
- **Manual** (maintainer, staging against the test server): three test
  channels, report a Division 1 match and a Division 3 match, attach a VOD
  to the MotW, then repoint one variable and correct a posted match to see
  it move.

## Deploy order

1. Create the two channels on the test server if needed, note the three ids
   for staging and production. On production the existing
   `DISCORD_RESULTS_CHANNEL_ID` value stays as the "other divisions"
   channel; the Div 1+2 channel and the MotW channel get their own
   variables.
2. Set `DISCORD_RESULTS_TOP_CHANNEL_ID` and `DISCORD_MOTW_CHANNEL_ID` on
   **both** Cloud Run services **before** the code ships (`gcloud run
   services update --update-env-vars`). Today's code ignores the new
   variables, so this is safe at any time; the new code refuses to post
   without them, so doing it afterwards means a window with no posts and an
   error in the logs.
3. Code via `dev` → staging check → PR to `main`.

No migration. The feature is one commit.

## Decisions

- **Move, not leave.** A post found in the wrong channel is moved on the
  next sync of its match. Editing in place wherever the post is would keep
  message order intact but leave a misplaced post misplaced forever; moving
  is the converge-consistent choice.
