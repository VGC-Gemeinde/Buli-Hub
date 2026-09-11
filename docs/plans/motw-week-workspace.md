# MotW — Wochen-Workspace (Redesign des Staff-Managers)

**Status: done** (2026-08-05). Built and designed in one pass — no separate
design hand-off; the shipped look is written up in `design/MATCH-OF-THE-WEEK.md`
§5, which is the spec of record from here on.

`/staff/motw` is a **one week at a time, full-width workspace** with a season
pager, and a candidate list that shows placement, record and capture-card status
of both players at a glance. It replaced a two-column layout that showed the
current and next Spieltag as cramped cards side by side, where a pick was a
one-line `Name vs. Name` row with nothing to judge it by.

Domain semantics of the MotW itself (one confirmed match per `(window, round)`,
permanent spoiler protection, Discord mirroring, VOD links) are unchanged by
this slice. One domain rule did change: which rounds are pickable. The
candidates a week is decided between came later
(`docs/plans/motw-candidates.md`).

## Scope

**In:**

- **One week per view**, full page width.
- **Season pager**: step through every Spieltag of the season, from round 1 to
  the last, in both directions. The pager shows each round's state (picked /
  picked-without-VOD / unpicked / current).
- **Pick gate widened**: the current Spieltag and every later one are fully
  editable (pick / replace / remove), and a past Spieltag that was never picked
  can still be backfilled. Only a past Spieltag that already has a pick is
  settled — its YouTube link stays editable, as it does for every round, because
  VOD uploads lag the week.
- **Candidate rows with substance**: per player, the placement in the table
  that decides their division, the match record, and whether they own a capture
  card — with "never filled in their profile" as its own state, so a default
  `false` is never read as an answer. Symmetric two-sided layout, like the
  public billboard's matchup row.
- **Filtering + sorting** of the candidate list: **division** chips that
  combine (not sub-division, not one-at-a-time) with the top two divisions
  preselected and "Alle" as a select-all/clear-all toggle; a labelled
  **Sortierung** toggle (Division / Platzierung — best combined placement
  first); and a filter for matches nobody can record (no capture card on either
  side).
- **No "Frühere Spieltage" list** — past picks are reachable through the pager,
  and the pager's per-round marker surfaces a missing VOD without a second list.
- One line changed outside the workspace: the dashboard todo's "Jetzt wählen"
  links to `?spieltag={round}`, so it lands on the week it is about.

**Out:**

- No change to the public billboard, the match page, the row badge, or any
  Discord behaviour.
- No change to the standings computation, drop handling, or spoiler rules.
- No MotW history/archive for players — this is the staff tool only.

## Domain change — pickable rounds

`canSelectRound({ round, currentRound, totalRounds, confirmedRounds })` is the
rule; `selectableRounds` collects it into a set for the actions' gate and the
week model:

- the running Spieltag and everything after it — always, so a week can be lined
  up as far ahead as the schedule goes, and replaced or cleared at will;
- a **past** Spieltag **only while it has no pick at all** — a week that was
  missed can be backfilled, typically once a VOD turns up for it.

A past round that already has a pick is settled: changing it would flip spoiler
protection back onto an already-public result and make Discord delete and repost
result/VOD messages for a week that is over. Backfilling a week that never had
one disturbs no such history.

Consequence worth knowing: because "settled" is decided by the pick existing, a
backfilled past pick cannot be undone through the UI — the round closes the
moment it is set.

The gate lives in `actions.ts` (`confirmMotw`, `revokeMotw`), which reads the
window's confirmations to evaluate it. `saveMotwYoutubeUrl` gates on nothing,
for every round. The nomination of candidates has its own, narrower gate
(`canNominate`, `docs/plans/motw-candidates.md`), and `motwTodo` nudges about
both duties.

## Pure logic (`motw.ts`, unit-tested)

- `canSelectRound(...)` / `selectableRounds(currentRound, totalRounds,
  confirmedRounds)` — the rule above.
- `weekState(round, currentRound)` → `"past" | "current" | "future"`; `null`
  current round makes every round `"past"`.
- `initialMotwRound({ totalRounds, currentRound, confirmedRounds,
  candidateRounds })` — the round the workspace opens on: a finished week whose
  candidates were never confirmed first, else the current round unless it is
  confirmed, else the first later round with nothing, else the current round.
  Outside a running season the season's last round, where the remaining work
  (VOD links) sits. This is what makes the workspace land on the week that
  needs work.
- `sortOptions(options, mode)` — `"division"` keeps the incoming
  tier/position order; `"rank"` sorts by combined placement (sum of both ranks,
  ascending), players without a rank last, ties broken by the division order so
  the result is stable.
- `buildMotwWeeks({ matchdays, currentRound, selections, options, holds })` —
  the assembly: one `MotwWeek` per matchday with its state, dates, pickable
  options, nominated candidates (`weekCandidates`,
  `docs/plans/motw-candidates.md`) and resolved confirmation (the confirmed
  option object, not just its id).

Types:

```ts
export type MotwPlayer = Identity & {
  rank: number | null;      // in the table that decides the division
  wins: number;
  losses: number;
  hasCaptureCard: boolean;
  profileEdited: boolean;   // false → hasCaptureCard is a default, not an answer
  dropped: boolean;
};

export type MotwOption = {
  matchId: string;
  round: number;
  tier: number;             // division, for the filter
  groupName: string;        // sub-division, for the row label
  playerA: MotwPlayer;
  playerB: MotwPlayer;
  reported: boolean;        // staff-only marker; a played week is still pickable
};

// A nominated match of the week, on top of the pickable options.
export type MotwCandidate = { option: MotwOption; role: "primary" | "backup" };

export type MotwWeek = {
  round: number;
  state: "past" | "current" | "future";
  startsOn: string;
  endsOn: string;
  options: MotwOption[];
  candidates: MotwCandidate[];
  selection: { matchId: string; youtubeUrl: string | null } | null;
  selectedMatch: MotwOption | null;
  editable: boolean;        // mirrors canSelectRound
};
```

`selectedMatch` is null while `selection` is set only for an inconsistent row
(the confirmation points at a match that is no longer an option, e.g. a participant
dropped afterwards); the view keeps the panel, the VOD field and the link, and
says so in place of the matchup.

`recordability(option)` → `"yes" | "no" | "unknown"` — whether the match can
produce a VOD at all. **"unknown" is its own answer, not a soft "no":** a player
who never saved their profile carries `hasCaptureCard: false` by default, which
says nothing about whether they own one. Staff need that difference so they can
ask the player rather than skip the matchup. Drives the row marker, the
per-player icon, and the "Nur aufnehmbar" filter — which hides only a definite
`"no"`, since an unknown is exactly what should be chased up.

Division filter (the chips combine rather than replacing each other — the MotW
is picked across the league, so "Division 1 and 2" is the normal view):

- `defaultDivisionFilter(tiers)` — the top `DEFAULT_FILTER_TIERS` (2) divisions
  that exist. That is where the featured match almost always comes from, so the
  common case opens without a click and the lower divisions are one chip away.
- `toggleAllDivisions(selected, all)` — "Alle" selects every division unless
  every one is already selected, in which case it clears the selection. A stale
  tier in `selected` never counts towards "complete".

## Queries (`motw/queries.ts`, integration-tested)

Two additions.

- `windowPlayerForm(windowId)` → `Map<userId, { rank, wins, losses, dropped }>`.
  Reuses `divisionsWithGroupSizes` + `divisionGroups` + `computeStandings` /
  `divisionStandings`, and picks the same table `findMotw` already picks for the
  billboard's "Platz {n}": the Gesamttabelle in division mode, the group table
  otherwise. One place decides what a placement means for the MotW.
- `profileFlags()` → `Map<userId, { hasCaptureCard, edited }>`. Both facts come
  from one query because neither is usable without the other: `hasCaptureCard`
  defaults to `false`, so `edited` is what separates "answered no" from "never
  answered".

`StaffMatchRow` gained `tier` (already selected internally, just not exposed) so
the page can build `MotwCandidate` without re-parsing the group name. The page
otherwise keeps using `windowMatchOverview` for the pairings — it already filters
`decidedByDrop` matches out and carries `outcome` for the "gemeldet" marker.

## Views

Visual spec of record: `design/MATCH-OF-THE-WEEK.md` §5. In short:

- **Page** (`src/app/staff/motw/page.tsx`) — container `max-w-[1040px]` (the
  sanctioned wide width, `DESIGN.md` §8.5); the width comes from dropping the
  two-column split, not from breaking the system. `?spieltag=<n>` overrides the
  opening round so the dashboard todo deep-links to the week it is about.
  Everything else is client state — all weeks are built in one server pass, so
  paging is instant and needs no round trip.
- **Pager** (`motw-week-pager.tsx`) — one chip per round with a shape mark for
  its state, chevrons, legend.
- **Week panel** (`motw-manager.tsx`) — head with state chip, then the pick
  panel or the appropriate empty state, then the picker.
- **Picker** (`motw-option-row.tsx`, `motw-player.tsx`) — full-row buttons,
  players mirrored around a centered "vs.", placement/record/capture-card per
  player, one marker per row, division filter + Division/Platzierung sort +
  "Nur aufnehmbar".
- **VOD field** (`motw-vod-field.tsx`) — extracted from the old manager,
  collapses to a YouTube button once a link is set.

## Dev tooling

- `personas.ts` — unchanged (no new metadata shapes).
- `seed.ts` — **the profile mix**, which respects the production invariant that
  `has_capture_card` can only be true *because* the owner saved their settings:
  every fourth player never edited their profile (`settings_edited_at` null,
  card forced `false`), and two thirds of the rest own a capture card. All three
  states the picker distinguishes therefore occur — roughly 35 / 34 / 69 of 136
  players are unknown / no / yes. Before this the whole column was `false` and
  every profile untouched, so nothing ever read as a definite "no".
- `seed.ts` — **the seeded league shape** (`DEV_SEASON_SHAPE`): seven divisions
  of two groups of 8, except **Division 4 with five groups**, and Division 4
  alone decided by its **Gesamttabelle** while the rest use group tables. 136
  players. `finalize=1` / `schedule=1` build to this shape and ignore `count`;
  the registrations-only and `grouped=1` states stay count-driven, where an
  arbitrary field size is the point.

  The old shape — two divisions, many groups, all `sub_division` — exercised
  neither the division-mode ranking path nor a division list long enough to
  make a filter meaningful. `groupDevSeeding` therefore distributes players in
  exact `groups × size` slices instead of round-robin, which is the only way to
  give divisions different group counts (`generateSubDivisions` derives the
  count from a division's player total).
- `gallery.tsx` — `MOTW_WEEKS` covers every week state: a past week that was
  missed (still backfillable), a settled past week, the running week, and two
  open future weeks. The manager is rendered four times (`initialRound` 1–4) so
  all of them are on the page. The candidate fixtures carry a missing placement,
  a dropped player, all three capture-card states, an unrecordable pairing and
  an "unklar" one.

## Tests

**Unit (`motw.test.ts`)**:

- `canSelectRound` / `selectableRounds`: the running round and every later one
  (picked or not); a past round that was never picked; a past round with a pick
  is closed; rounds outside the schedule; and backfilling still works after the
  season has ended.
- `weekState`: before / on / after the current round; `null` current round.
- `initialMotwRound`: current unpicked → current; current picked → first later
  unpicked; everything picked → current; no running season → last round; never
  below 1.
- `sortCandidates`: division mode preserves input order; rank mode orders by
  combined rank, puts unranked pairings last, and is stable across equal sums.
- `recordability`: yes / no / unknown, including that one confirmed card
  outweighs an untouched profile on the other side.
- `defaultDivisionFilter`: preselects the top two; never selects a division the
  season does not have.
- `toggleAllDivisions`: selects everything while something is missing, clears
  only when every division is selected, ignores a stale tier, no-ops on an
  empty season.
- `buildMotwWeeks`: round order and week states, candidate grouping, selection
  resolution, an unresolvable pick → `selectedMatch === null` with `selection`
  intact, and `editable` false only for a past week that has a pick.

**Integration (`queries.integration.test.ts`)**: `windowPlayerForm` ranks and
records from the group table in `sub_division` mode and from the merged
Gesamttabelle in `division` mode (two equal groups whose winners are both rank
1 in their own group and split by game differential when merged); no entry for
a user outside the season. `profileFlags` reports both columns, with two players
sharing `hasCaptureCard: false` and differing only in `edited` — the distinction
the whole "unklar" state rests on.

**Action gate (`actions.integration.test.ts`, new)** — the rule from every side:
`selectMotw` picks the running Spieltag and one two weeks out, **backfills a
past Spieltag that was never picked**, refuses to re-pick one that already has a
match, and still rejects a non-staff caller; `removeMotw` clears a future pick
and refuses a settled past one.

## Documentation

`docs/plans/match-of-the-week.md` (§Scope, §Pure logic, §Views, §Tests) and
`design/MATCH-OF-THE-WEEK.md` §5 describe the workspace as the design — the
latter is the visual spec of record.
