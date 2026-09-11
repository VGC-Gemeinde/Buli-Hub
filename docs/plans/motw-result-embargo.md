# MotW result embargo (result withheld until the VOD is live)

**Status: done** (2026-09-07). Built and designed in one pass on the existing
MotW and spoiler idioms, no separate design hand-off; the shipped states are
written up in `design/MATCH-OF-THE-WEEK.md` §2.2, §4.1 and §5.5. Verified via
unit and integration tests and a seeded season as guest and as staff persona
(withheld row, locked billboard, "Gespielt" match page; preview with the
"Noch nicht öffentlich" marker; the staff hint on the VOD field).

## Context

The Match of the Week is spoiler-protected today, but only as a courtesy:
the score ships to every browser, the orange pill and the billboard button
reveal it on tap, and the match page shows replays, teamsheets and a masked
scoreboard to anyone. For the featured match that is not enough. The point
of the MotW is that the community watches the VOD, and a result that is one
tap away is spoiled in every Discord screenshot and every curious click.

This feature turns the courtesy into a rule: **the MotW result is withheld
from the public until its VOD is attached.** Staff and the two participants
keep seeing it, marked as not yet public. Discord gets the result post only
once the VOD is live, after the VOD announcement.

Everything hangs on one signal that already exists: `motw_selections.
youtube_url`. Null means the VOD is not live; set means it is. No schema
change. The rule itself is the shared result embargo
(`src/features/spoilers/embargo.ts`), which the recording holds reuse with
a second reason (`docs/plans/recording-holds.md`).

The embargo starts when staff **confirm** the match as the Match of the Week
(`docs/plans/motw-candidates.md`). Before that the match is a candidate, which
is a recording hold: withheld all the same, under the recording reason and its
copy. Confirming deletes the hold and this rule takes over without a gap, and a
confirmation that is revoked or replaced puts the match back under a hold
rather than publishing it.

## Scope

**In:**

- **Embargo rule** (pure): a match is under embargo while it is the confirmed
  MotW *and* has no YouTube link. Two viewer classes:
  - **withheld**: guests, players not in the match. The result is not sent
    to the client at all: no score, no winner, no replays, no teamsheets, no
    game rows. They see that the match was played and that the result
    follows with the VOD.
  - **preview**: staff+ and the two participants. They see the result as
    today, plus a visible "Noch nicht öffentlich" marker wherever it is
    shown.
- **Public overview + `/spielplan`** (`MatchRow`): a withheld row keeps its
  orange MotW pill, but the pill is inert (no reveal, no hover), titled
  "Match of the Week: Ergebnis folgt mit dem VOD". A preview row keeps the
  tappable pill with the title "Match of the Week: Ergebnis noch nicht
  öffentlich, antippen zum Aufdecken". After the VOD the row behaves exactly
  as today.
- **Billboard** (`MotwBlock`): withheld and reported → a locked state box in
  place of the reveal button: chip "Ergebnis folgt mit dem VOD" (lock icon)
  with the sub-line "Gespielt · Best of 3". Preview → the reveal button as
  today, sub-line "Noch nicht öffentlich, erst mit dem VOD"; revealed
  sub-line "Best of 3 · noch nicht öffentlich".
- **Match page** (`/match/[matchId]`):
  - withheld → the result is not loaded into the page. The neutral
    `PublicMatchView` renders in a new `played` state: chip "Gespielt"
    instead of "Offen", the line "Das Ergebnis wird veröffentlicht, sobald
    das VOD online ist." and an informational card "Ergebnis folgt mit dem
    VOD" explaining that games, replays and teamsheets appear together with
    the VOD. The MotW banner stays above it (with the YouTube button once
    the link exists, at which point the state is gone anyway).
  - preview → `ReportSummary` as today (no spoiler mode for privileged
    viewers), and the `MotwMatchBanner` carries a "Noch nicht öffentlich"
    chip with the line "Ergebnis, Replays und Teamsheets werden mit dem VOD
    veröffentlicht."
- **Player profile** (`/spieler/[userId]`, `ScheduleRow`): same pill rules
  as the overview; scores stripped server-side for withheld rows.
- **Staff MotW workspace** (`/staff/motw`): the confirmed panel of a reported
  week without VOD gets a one-line hint next to the VOD field: "Ergebnis
  gemeldet, noch nicht öffentlich. Mit dem VOD-Link wird es veröffentlicht
  und im Ergebniskanal gepostet." Attaching the link now has a consequence,
  so the field says so.
- **Discord**: the MotW result post is no longer suppressed forever. It is
  suppressed while the embargo holds and posted, like any other result,
  into the match's division results channel once the VOD is attached. Its
  header carries "· Match of the Week" so a post that lands a week late has
  its context. Order on attaching the link: VOD announcement first (MotW
  channel), then the result post. Clearing the link deletes the result post
  again (the channels mirror the hub). Replacing the confirmation clears the
  URL, so the new match's result post is deleted by the existing sync call.
- Dev tooling: gallery states, and the seed already produces the withheld
  case (MotW with result, without link).

**Out:**

- **Standings keep including the MotW result immediately.** The table is
  an aggregate and cannot hide one row without becoming wrong for a week;
  the public table would diverge from the staff table and jump when the
  VOD lands. This is the documented accepted leak
  (`docs/plans/match-of-the-week.md`) and stays so. Consequence: someone
  reading W/L before and after the Spieltag can infer the MotW result. The
  embargo covers the result itself, not arithmetic on the table.
- The Spieler-Dashboard's own-match rows: they show the participant's own
  score with no MotW marking today, and the match page they link to carries
  the "Noch nicht öffentlich" notice. No dashboard change.
- `/pastes/<uuid>`: a teamsheet page is reachable only by its unguessable
  id and carries no result. Unchanged.
- Any change to the spoiler cookie, the reveal idiom after the VOD, or the
  MotW VOD announcement text.

## Pure logic (`src/features/spoilers/embargo.ts`, unit-tested)

```ts
// A result the hub keeps from the public for a while. "motw": the Match of
// the Week before its VOD; "recording": a match held for a staff recording.
// "withheld": this viewer may not see it; "preview": this viewer (staff or
// participant) sees it, marked as not public; null: no embargo.
export type ResultEmbargo = {
  reason: "motw" | "recording";
  access: "withheld" | "preview";
} | null;

export function resultEmbargo(input: {
  motw: { youtubeUrl: string | null } | null; // null = not the MotW
  held: boolean;                               // a recording hold exists
  isStaff: boolean;
  isParticipant: boolean;
}): ResultEmbargo;

// Strips the result fields of a withheld row: reported stays true, the
// score and winner become null. Shared by the overview and profile queries.
export function withholdScore<T extends { scoreA; scoreB; winnerId }>(row: T): T;
```

The MotW wins on overlap: a held featured match without VOD carries
`reason: "motw"`. `PublicMatch` and `ProfileScheduleRow` gain `embargo:
ResultEmbargo` next to `isMotw`. `MotwBlockData` derives from a
`PublicMatch`, so the billboard reads the same field.

## Queries and pages (viewer plumbing)

- `publicLeagueOverview(windowId, seasonNumber, today, viewer)` takes
  `viewer: { userId: string | null; isStaff: boolean }` (both callers, `/`
  and `/spielplan`, already resolve `currentUser()`). `buildDivision`
  receives the selections (not only the id set) and, per row, computes the
  embargo and strips withheld scores. The old comment "score fields stay
  filled, the block's reveal uses them" is replaced: they stay filled only
  when the viewer may see them.
- `profileScheduleRows` gains `viewerIsStaff` and takes the selections
  (`motwForWindow` output) instead of a bare id set.
- Match page: `embargo = resultEmbargo({ motw, held, isStaff,
  isParticipant })`; `shownResult` becomes null when withheld, and the
  `PublicMatchView` is rendered with `state: "open" | "played_motw"`. Dispute
  blocks and the staff panel are unaffected (privileged only).

## Discord (`src/features/discord-posts/`)

- `shouldPostResult` replaces `isMotw: boolean` with
  `motw: { youtubeUrl: string | null } | null`: MotW without URL → false,
  MotW with URL → true. Comment and test rewritten.
- `resultMessage` gains `isMotw: boolean` → header suffix
  `· Match of the Week`.
- `syncResultPost` passes the selection through and the flag into the
  message.
- `saveMotwYoutubeUrl` calls `syncMotwVodPost` and then `syncResultPost`.
  Every other trigger site already calls `syncResultPost`, so a result
  reported after the VOD exists (the link was attached early) posts right
  away, consistent with the rule.

## Views (rudimentary but intentional, house idioms)

- `SpoilerScore`: `motw` prop becomes `motw?: "reveal" | "locked" | false`;
  `"locked"` renders the orange pill as a `span` with `cursor-default`, no
  hover shift, the withheld title.
- `MotwBlock`: reads `match.embargo` for the two new state-box variants.
  Same fixed 74px footprint, so nothing relayouts.
- `MotwMatchBanner`: new optional `notPublic` prop → a small chip
  (`Lock` icon from lucide, orange outline, uppercase 12px, matching the
  banner's Spieltag label) plus the explanatory line, wrapping onto its own
  row below `sm`.
- `PublicMatchView`: `state` prop, "Gespielt" chip in a brand-blue tint so
  it reads as progress rather than the grey "Offen".
- `MotwManager` pick panel: the hint line under the VOD field when
  `selectedMatch.reported && !selection.youtubeUrl`.

All copy plain German, no em-dashes, straight quotes.

## Dev tooling

- Gallery (`gallery.tsx`): `MatchRow` withheld and preview pills,
  billboard withheld and preview states, banner with the "Noch nicht
  öffentlich" chip, `PublicMatchView` in `played` state.
- Seed: unchanged; the running-season seed already features a reported
  MotW without link, which is the withheld case. Personas unchanged.

## Tests

- **Unit** `spoilers/embargo.test.ts`: `resultEmbargo` (not MotW → null;
  MotW with URL → null for every viewer; MotW without URL → preview for
  staff, preview for either participant, withheld for a guest and for a
  foreign player); `withholdScore`.
- **Unit** `messages.test.ts`: `shouldPostResult` MotW without URL → false,
  MotW with URL → true, the other cases unchanged; `resultMessage` header
  with the MotW suffix.
- **Unit** `profile.test.ts`: withheld row has null scores and
  `embargo.access: "withheld"`; owner and staff get `"preview"` with scores;
  after the VOD `null` with scores.
- **Unit** (new) `public-league/queries` row builder: the stripping is a
  pure step, tested on the same matrix.
- **Integration** `motw/actions.integration.test.ts`: `saveMotwYoutubeUrl`
  calls the mocked `syncMotwVodPost` and `syncResultPost` in that order.
- **Manual** (seeded season): guest sees the inert pill, locked billboard
  and the "Gespielt" match page; the staff persona sees the result with the
  marker; attach a link on `/staff/motw` and watch all three flip to the
  regular reveal state; with test channels, the VOD post then the result
  post appear.

## Documentation

- `docs/plans/match-of-the-week.md` §Spoiler protection rewritten as the
  present design (embargo until VOD, then the reveal idiom).
- `docs/plans/discord-result-posts.md` §MotW exclusion → embargo until VOD.
- `docs/plans/public-spoiler-protection.md` MotW line updated.
- `design/MATCH-OF-THE-WEEK.md` §2 and §4.1: the new billboard and banner
  states, so the visual spec of record stays complete.

## Decisions

- **Standings keep the result.** The table is an aggregate; withholding one
  row would make the public table knowingly wrong for a week and jump when
  the VOD lands. The embargo covers the result itself, not arithmetic on
  the table (the same accepted leak as before this feature).
- **The result post is a normal result post.** Once the VOD is live, the
  MotW result goes into the division's results channel like any other
  match, right after the VOD announcement in the MotW channel. Before this
  feature the MotW result was never posted at all; now it is posted late
  instead of never.
