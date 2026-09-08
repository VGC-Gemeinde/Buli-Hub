# Discord result posts

**Status: done** (2026-07-05) — `discord_posts` schema, message builders,
converge sync, hooks in all reporting/MotW actions, env template. Verified
via unit/integration tests, typecheck, and a production build. The split
into three channels is `docs/plans/discord-result-channels.md`.

## Context

Match results should reach the community where it lives: the Discord result
channels. Every publicly visible result gets a message in the historical
community format (pairings readable, score behind Discord spoiler tags, fixed
message shape). The Match of the Week gets one announcement when its VOD
link lands, and its result post only then — the result is under embargo
until the VOD is live (`docs/plans/motw-result-embargo.md`). The channels
**mirror the hub's public state**: one message
per match, edited, moved or deleted as the state changes, with a message id
stored per post. Which channel a post belongs to (results of Division 1 and
2, results of every other division, MotW announcements) is
`docs/plans/discord-result-channels.md`.

Discord stays a thin output channel (CLAUDE.md): posting is best-effort after
the DB write and never decides or blocks anything. No UI — this slice is
schema + logic + action hooks.

## Scope

**In:**
- **Result posts** whenever a result becomes *publicly visible*: normal
  player report, staff-confirmed free win (not the pending report), staff
  awards (free win / double loss). Corrections **edit** the message (with a
  trailing `*(korrigiert)*` line); reopen **deletes** it; a re-report posts
  fresh.
- **MotW embargo, symmetric**: a featured match gets its result post only
  once its VOD link exists, right after the VOD announcement, into the
  division's results channel with "· Match of the Week" in the header.
  Selecting a MotW deletes an already-existing result post for that match;
  clearing the link deletes it again; removing the pick re-posts the
  (public) result. The channel always matches what the hub shows openly.
- **Recording holds, the same way**: a match held for a staff recording
  (`docs/plans/recording-holds.md`) gets no result post while the hold
  exists; releasing it posts the (public) result as a normal result post,
  without a header suffix.
- **MotW VOD post** (`kind = motw_vod`): posted when a YouTube link is first
  attached, edited when the link changes, deleted when the link or the pick
  is removed. Never contains the result.
- **Self-healing**: an edit/delete hitting 404 (message removed on Discord)
  re-posts (result) or drops the row (delete) and stores the new id.
- Config via env: the three channel ids (`discord-result-channels.md`; all
  unset → posting skipped entirely, so local dev stays silent) and
  `APP_BASE_URL` (unset → posts carry no hub link). All in `.env.example`;
  production values on the Cloud Run service.

**Out (deferred):**
- Retry queue / delivery guarantees — a missed or stale post logs an error
  and self-corrects on the next state change. Discord rate limits (bursts at
  the Spieltag deadline) fall under the same best-effort rule.
- Embeds, pairing announcements, backfill of results reported before this
  feature ships.

## Message format (community format, hub vocabulary)

Normal result, Showdown — fixed shape, score spoilered, both names bold
(never only the winner). The Game 3 line always exists: it carries the real
game-3 replay, or **repeats game 2's replay as a decoy** when the series
ended 2-0, so the message shape never leaks the split:

```
__**VGC Bundesliga · Division 1a · Spieltag 3**__

**Alice**  ||2 - 0||  **Bob**

Team von Alice: <https://pokepast.es/…>
Team von Bob: <https://pokepast.es/…>

Game 1: *<https://replay.pokemonshowdown.com/…>*
Game 2: *<https://replay.pokemonshowdown.com/…>*
Game 3: ||*<https://replay.pokemonshowdown.com/…>*||

Zum Match: <https://…/match/{id}>
```

- **Cartridge**: team lines plus `Video: *…*` when set (italic like the
  replay lines, unspoilered — the score spoiler above is the only cover; the
  link itself leaks nothing); no game lines. The video URL is the one link
  in a result post that is **not** wrapped in `<>`: its preview is wanted.
- **Free win / double loss**: header + `**Alice**  ||Freewin für Alice||
  **Bob**` (the winner must live inside the spoiler — outside it would leak,
  omitted entirely it would be lost) or `||Doppelniederlage||`, + hub link.
  No teams, no free-win reason (staff-internal).
- **Corrected**: trailing `*(korrigiert)*` line.
- **No link previews**: every URL is wrapped in `<>` (suppresses the embed),
  so a post is text, not a stack of preview cards. The two exceptions are
  the videos, whose preview is the point: the Cartridge match video and the
  MotW VOD (below).
- **MotW VOD post**: header `__**VGC Bundesliga · Match of the Week ·
  Spieltag 3**__`, line `**Alice** vs. **Bob** — das VOD ist da!`, the
  YouTube URL **unwrapped** (the video preview is the announcement), hub
  link in `<>`.

## Data — new table `discord_posts`

```
id          uuid PK default random
kind        enum discord_post_kind: result | motw_vod
match_id    uuid FK → matches (cascade)
channel_id  text      -- where the message is, so it can be edited or moved
message_id  text
created_at  timestamptz default now
updated_at  timestamptz default now
unique (kind, match_id)
```

Migrations: `discord_posts` (generated) + `discord_posts_fk_rls` (custom:
FK, RLS on, no policies — server-only).

## Feature folder — `src/features/discord-posts/`

**Pure logic (`messages.ts`, unit-tested):**
- `resultMessage(input)` — the full result post text from match + result
  data: normal Showdown (incl. decoy game 3), normal Cartridge, free win,
  double loss, `(korrigiert)`, hub link present/absent.
- `motwVodMessage(input)` — the VOD announcement.
- `shouldPostResult(input)` — whether the channel should show a result post
  for a match (no public result → no; pending free win → no; featured as
  MotW without VOD → no; held for a recording → no) — the converge
  decision, exhaustively tested.

**Sync (`sync.ts`, best-effort — every entry point catches, logs, returns):**
- `syncResultPost(matchId)` — loads current state (match, result, MotW flag,
  recording hold, stored post row), computes `resultPostState`, then converges: post / edit /
  move / delete / nothing. Handles 404-heal. Skips entirely without the
  channel ids.
- `syncMotwVodPost(matchId)` — same convergence for the VOD announcement.

**Queries (`queries.ts`, integration-tested):** `getPost(kind, matchId)`,
`upsertPost`, `deletePostRow`.

**`src/lib/discord.ts` additions:** `postChannelMessage`,
`editChannelMessage`, `deleteChannelMessage` — thin REST v10 calls with the
bot token, 404 surfaced as a typed outcome (not an exception).

## Hooks (existing actions call sync after their DB write + revalidate)

- `reportMatch` → `syncResultPost` (a pending free win converges to "none")
- `confirmFreeWin`, `awardFreeWin`, `awardDoubleLoss`, `editResult`,
  `reopenMatch` → `syncResultPost`
- `selectMotw` → `syncResultPost` for the newly featured match (deletes a
  prior result post) *and* for a replaced match (its result may return);
  `syncMotwVodPost` for a replaced pick (URL cleared → message deleted)
- `removeMotw` → `syncResultPost` + `syncMotwVodPost`
- `saveMotwYoutubeUrl` → `syncMotwVodPost`, then `syncResultPost` (the link
  ends the embargo: announcement first, then the result)

## Dev tooling

`/dev/report-results?count=5` (linked from `/dev`, dev-only): reports up to
`count` open matches of the latest season like real player reports —
including the Discord sync — so the result channels can be exercised end to
end against test channels. Without the channel ids it reports the results
and skips the posting, and says so.

## Tests

- Unit: `resultMessage` (all outcome/platform variants, decoy game 3,
  korrigiert, no-base-url), `motwVodMessage`, `resultPostState` (unreported /
  pending free win / confirmed / MotW-featured / corrected).
- Integration: `discord_posts` unique `(kind, match_id)`, row helpers.
- No tests against the real Discord API; `sync.ts` stays a thin shell around
  tested decisions.
- Manual: point the channel ids at test channels; report,
  correct, reopen a match; confirm a free win; feature a reported match
  (post disappears), attach/replace/remove a VOD link.

## Delivery

Branch `feat/discord-result-posts`, squash-merged to main as one commit.
