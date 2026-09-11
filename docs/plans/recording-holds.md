# Recording holds (results withheld for staff-recorded matches)

**Status: done** (2026-09-08). Built and designed in one pass on the MotW
and spoiler idioms, no separate design hand-off. Verified via unit and
integration tests, the full suite, a production build and a seeded season as
guest and as staff persona (withheld row, "Gespielt" match page, the staff
card, the workspace, release).

## Context

Staff members record league matches from the spectator perspective for the
Gemeinde stream: they contact players who have scheduled their match, watch
it live, and publish the recording later. Today nothing in the hub knows
about this. The moment the players report, the result is public on every
page and posted into the Discord results channel, before the recording has
aired.

This feature gives staff a way to mark such matches in the hub. A marked
match is under the same result embargo as the Match of the Week before its
VOD: the result is withheld from the public and from Discord until staff
release it, which they do by hand once the stream is over. Because a
forgotten release means a result the community never sees, the staff area
shouts about holds that outlived their Spieltag.

The MotW embargo already has every public state this needs (inert row pill,
"Gespielt" match page, "Noch nicht öffentlich" markers for staff and
participants, suppressed result post). This feature generalises that rule to
two reasons instead of duplicating it.

## Vocabulary

- **Hold** (`recording_holds` row): staff marked this match for a recording.
  While the row exists, the result is not public.
- **Release**: staff removes the hold. The result becomes public and the
  Discord result post is made.
- **Stale hold**: a hold on a match whose Spieltag is over (round before the
  current one, or any round once the season has no current round). This is
  what the dashboard warns about.

UI terms: the staff feature is "Aufnahmen" (`/staff/aufnahmen`); the public
copy talks about the "Stream" ("Ergebnis folgt nach dem Stream").

## Scope

**In:**

- **Schema**: new table `recording_holds` (`match_id` PK, `window_id`,
  `round`, `held_by_id`, `created_at`). A row is a hold; releasing deletes
  it. Generated migration plus a custom FK/RLS migration in the house
  pattern (`motw_fk_rls`). The table also carries `motw_role`, which makes a
  hold a Match-of-the-Week candidate on top of being a recording
  (`docs/plans/motw-candidates.md`): a candidate *is* a recording, so it needs
  no second kind of withheld state, appears in this workspace like any other
  hold, and is released here the same way. Releasing ends the candidacy with
  the hold, and the rows of a week carry a "MotW-Hauptmatch" / "MotW-Backup"
  chip so that is visible before the click.
- **Embargo rule** (pure, generalised): `resultEmbargo({ motw, held,
  isStaff, isParticipant })` returns `{ reason: "motw" | "recording",
  access: "withheld" | "preview" } | null`. The result is embargoed while
  the match is the MotW without VOD **or** has a hold. When both apply the
  reason is `motw` (its rule is the stricter one and its copy is the
  established one). `access` is `preview` for staff and participants,
  `withheld` for everyone else, exactly as today. `motwEmbargo` and
  `withholdScore` move from `src/features/motw/motw.ts` to
  `src/features/spoilers/embargo.ts`; every row type renames
  `motwEmbargo` to `embargo`.
- **Marking** (staff+): only a match that is **not reported**, not a bye, not
  drop-decided, and whose round is the current or a later Spieltag. A
  reported match cannot be marked: its result is already public and posted,
  and a hold would unpublish it and delete the Discord post (the same reason
  a past MotW pick is settled).
- **Releasing** (staff+): allowed for any hold at any time. Deletes the row,
  revalidates, then `syncResultPost` posts the result if it is reportable
  (a hold on a match that is still open releases silently: nothing to
  post).
- **Staff page `/staff/aufnahmen`** (staff+, redirects to `/staff` without a
  schedule):
  - The warning surface at the top when stale holds exist (same card as on
    the dashboard, see below).
  - **"Zurückgehalten"**: every hold of the season, grouped by Spieltag,
    stale ones first and marked destructive. Each row: group, pairing,
    state chip ("offen" / "gemeldet" / "gemeldet · Freewin"), and a
    "Freigeben" button. Empty state when there are no holds.
  - **"Match markieren"**: the MotW pager's chip idiom over the current and
    later Spieltage, each chip carrying the week's hold count; per week the
    pairings as rows with one trailing button each, division filter chips
    as in the MotW picker (all divisions on by default, a recording can
    come from anywhere). An open row offers the outline "Aufnehmen"
    (orange on hover); a held row carries the navy "Aufnahme" button that
    swaps to the orange action label on hover and keyboard focus, so every
    row's action keeps the same slot and width; a reported row is greyed
    with a "gemeldet" chip and a title saying why it is not offered.
    Removing the mark from a reported row asks first, exactly like the
    list above.
- **Staff dashboard `/staff`**: a `StaleHoldsCard` in the destructive
  emphasis surface whenever stale holds exist: "N Matches aus vergangenen
  Spieltagen werden noch zurückgehalten", sub-line "Die Ergebnisse sind
  gemeldet, aber noch nicht öffentlich. Nach dem Stream freigeben." (or
  "noch nicht alle gemeldet" when some are open), button "Jetzt freigeben"
  linking to `/staff/aufnahmen`. Also a permanent "Aufnahmen" button in the
  season strip next to "Match of the Week".
- **Public overview + `/spielplan` + player profile** (`MatchRow`,
  `ScheduleRow`, `SpoilerScore`): a held and reported row shows the navy
  "REC" pill (broadcast dot plus label, white-on-navy, inverted in dark
  mode) in the score slot, so it never competes with the orange MotW pill.
  Withheld viewer: inert, title "Aufnahme für den Stream: Ergebnis folgt
  nach dem Stream". Preview viewer (staff, participants): tappable, title
  "… Ergebnis noch nicht öffentlich, antippen zum Aufdecken", reveals in
  place like the MotW preview pill. Scores stripped server-side for
  withheld rows (`withholdScore`), and the global spoiler switch cannot
  open an embargoed row. After the release the row is a regular row under
  the normal cookie-based protection: the hold leaves no permanent marker,
  unlike the MotW.
- **Match page** (`/match/[matchId]`):
  - A `RecordingBanner` for every viewer while the hold exists: the MotW
    banner's anatomy (badge, Spieltag, optional chip, explanatory line) in
    navy instead of orange, so the two never read as the same feature.
    Preview viewers with a reported result get the "Noch nicht öffentlich"
    chip and the line naming who can see the result. When the match is also
    the MotW, only the MotW banner renders (one banner, the MotW copy).
  - Withheld and reported: `PublicMatchView` in a new `played_recording`
    state: chip "Gespielt", sub-line "Ergebnis folgt nach dem Stream", card
    "Ergebnis folgt nach dem Stream" explaining that games, replays and
    teamsheets appear once staff release the result. The existing `played`
    state is renamed `played_motw`.
  - Staff panel: a "Für Aufnahme zurückgehalten" action row with a
    confirming "Freigeben" button, so staff can release from the match
    itself.
- **Discord**: `shouldPostResult` gains `held: boolean` → false while held.
  The release action calls `syncResultPost`. The post is a normal result
  post without a suffix.
- **Stream photo**: the two players of a held match are offered the upload in
  `/profil` and get one quiet line in the banner
  (`docs/plans/stream-photos.md`).
- **Stream API**: `StreamMatch` gains `recording: boolean` next to `motw`,
  read from a left join on `recording_holds`. The stream backend can mark
  its own recordings the way it marks the MotW.
- **Dev tooling**: the running-season seed holds one reported match of the
  current round and one of the previous round (the stale case), neither the
  MotW nor involving the dropped player, so every state is visible at once;
  gallery states for the "REC" pill (withheld, preview), the banner (with
  and without the not-public chip), the stale-holds card in all three
  wordings, the `played_recording` match view and the whole workspace
  (with and without holds). Personas unchanged.

**Out:**

- **Standings include the result immediately**, the accepted leak the MotW
  embargo documents. An aggregate cannot hide one row.
- The participants' own rows on `/spieler`: as with the MotW, the match page
  they link to carries the notice.
- Attaching a stream or VOD link to a hold. Releasing is the whole
  lifecycle; a recorded match has no archive marker afterwards.
- Marking a match of a past Spieltag (an overdue match that gets streamed
  late). It would trigger the stale warning the moment it is marked, so the
  warning would teach staff to ignore it. If this case turns out to be
  common, the warning needs a different trigger first.
- Any coupling to drops. A hold on a match whose participant drops stays
  until staff release it; `shouldPostResult` already suppresses drop-decided
  posts, and the release just clears the row.
- Discord notifications about a hold or a release (no announcement post).

## Pure logic

`src/features/spoilers/embargo.ts` (moved from `motw.ts`, unit-tested):

```ts
export type EmbargoReason = "motw" | "recording";
export type EmbargoAccess = "withheld" | "preview";
export type ResultEmbargo = { reason: EmbargoReason; access: EmbargoAccess } | null;

export function resultEmbargo(input: {
  motw: { youtubeUrl: string | null } | null; // null = not the MotW
  held: boolean;                               // a recording hold exists
  isStaff: boolean;
  isParticipant: boolean;
}): ResultEmbargo;

export function withholdScore<T extends { scoreA; scoreB; winnerId }>(row: T): T;
```

`src/features/recordings/holds.ts` (unit-tested):

`buildHeldMatches` and `buildRecordingWeeks` (same file) assemble the
workspace: the held rows with their `stale` flag, sorted stale-first, and
one week per current-or-later Spieltag with its pairings.

```ts
export type Hold = { matchId: string; round: number; reported: boolean };

// Holds whose Spieltag is over. Without a current round (season finished)
// every hold is stale.
export function staleHolds(holds: readonly Hold[], currentRound: number | null): Hold[];

// Whether a match may be marked: unreported, not a bye, not drop-decided,
// round is the current one or later.
export function canHold(input: {
  reported: boolean; isBye: boolean; decidedByDrop: boolean;
  round: number; currentRound: number | null;
}): boolean;

// The dashboard card's wording from the stale set (all reported / some open).
export function staleHoldsSummary(stale: readonly Hold[]): { count: number; allReported: boolean } | null;
```

## Queries (`src/features/recordings/queries.ts`, integration-tested)

- `holdsForWindow(windowId)` → `{ matchId, round, heldById, createdAt }[]`,
  feeds the overview, profile and staff pages.
- `isHeld(matchId)` → boolean, for the match page and the Discord sync.
- `insertHold({ matchId, windowId, round, staffId })` (a repeat is a no-op)
  and `deleteHold(matchId)` → whether there was a hold.

## Actions (`src/features/recordings/actions.ts`, staff+ gate, `{ ok } | { ok:false, error }`)

- `holdMatch({ matchId })`: resolves the match (`matchSelectionContext`
  reused from the MotW queries), rejects an existing hold, a bye, a
  reported match (a pending free win included: staff confirm those, so it
  is a result), a drop-decided match and a past round (`canHold`), then
  inserts. Errors in plain German. Then `syncResultPost` (a no-op for an
  unreported match, kept so the mirror converges even if a result lands
  between the check and the insert).
- `releaseHold({ matchId })`: deletes, revalidates `/`, `/spielplan`,
  `/staff`, `/staff/aufnahmen`, `/match/[id]`, `/spieler/[a|b]`, then
  `syncResultPost`.

## Viewer plumbing

- `publicLeagueOverview` and `profileScheduleRows` take the holds
  (`holdsForWindow`) next to the MotW selections; `toPublicMatch` computes
  `embargo` via `resultEmbargo` and strips withheld rows.
- Match page: `embargo = resultEmbargo({ motw, held, isStaff,
  isParticipant })`; `shownResult` null when withheld; `PublicMatchView`
  state derived from `embargo.reason`.
- `MotwBlock` reads `match.embargo?.access` (the block only exists for the
  MotW, so the reason is always `motw` there).
- `SpoilerScore` takes `embargo: ResultEmbargo` and keeps `motw` for the
  permanent orange pill; the "Stream" pill renders when
  `embargo?.reason === "recording"`.

## Tests

- **Unit** `spoilers/embargo.test.ts`: the full matrix (not MotW, no hold →
  null; MotW with VOD → null; MotW without VOD → motw/preview for staff and
  participants, motw/withheld otherwise; hold only → recording/preview and
  recording/withheld; MotW without VOD plus hold → reason motw; MotW with
  VOD plus hold → reason recording); `withholdScore`. The existing
  `motwEmbargo` tests move here.
- **Unit** `recordings/holds.test.ts`: `staleHolds` (before current round,
  current round not stale, null current round → all stale), `canHold` on
  every rejection, `staleHoldsSummary`.
- **Unit** `messages.test.ts`: `shouldPostResult` with `held: true` → false.
- **Unit** `public-league/queries` row builder and `profile.test.ts`: held
  rows withheld for guests, preview for staff and participants.
- **Unit** `recordings/holds.test.ts` also covers `buildHeldMatches`
  (stale first) and `buildRecordingWeeks` (current round and later only).
- **Unit** `stream-api/to-stream-match.test.ts`: the `recording` flag.
- **Integration** `recordings/queries.integration.test.ts` (insert is
  idempotent, listing by round, release, cascade with the match) and
  `actions.integration.test.ts` (hold rejects a past round, a reported
  match, a bye, an unknown id, a second hold and a non-staff caller;
  release removes the row and calls the mocked `syncResultPost`);
  `stream-api/queries.integration.test.ts` returns `recording: true`.
- **Manual** (seeded season): guest sees the inert "Stream" pill and the
  "Gespielt" page; staff persona sees the destructive card on `/staff`,
  releases on `/staff/aufnahmen` and watches the pill turn into the normal
  score; with test channels the result post appears on release.

## Documentation

- `docs/plans/motw-result-embargo.md` and `match-of-the-week.md`: the pure
  function now lives in `spoilers/embargo.ts` and the row field is
  `embargo`.
- `docs/plans/discord-result-posts.md`: holds as a second suppression
  reason.
- `docs/plans/public-spoiler-protection.md`: the "Stream" pill.
- `docs/plans/stream-api.md`: the `recording` field.
- `CLAUDE.md`: the feature is listed with the other subsystems; the shared
  embargo module is named there too.

## Shared component

The MotW picker's division chip became `src/components/filter-chip.tsx`, so
both staff workspaces filter with the same control instead of two copies.

## Decisions

- **One embargo rule, two reasons.** Duplicating the MotW's withheld and
  preview states for a second trigger would double every row type and every
  view branch. The generalised `resultEmbargo` keeps one rule, and the MotW
  wins on overlap because its copy and its permanent pill are established.
- **Only unreported matches can be marked.** A hold on a public result would
  retract it and delete a Discord post, which is the same harm the settled
  past MotW pick prevents. Staff arrange recordings before the match is
  played, so this costs nothing in practice.
- **Release deletes the row.** A hold is a state of the match, not an event
  worth archiving. A history ("this match was recorded") would need a
  place to be shown, and nothing asks for it.
- **The stale warning is literal.** Any hold whose Spieltag is over counts,
  reported or not: an unreported stale hold is either an overdue match or a
  recording that never happened, and both belong in front of staff.
- **No suffix on the released result post.** The MotW post carries "· Match
  of the Week" because the feature is a named institution; a recording is
  not, and the post reads as a normal result that arrived late.
