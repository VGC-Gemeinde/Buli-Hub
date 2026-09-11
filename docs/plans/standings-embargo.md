# Zurückgehaltene Ergebnisse zählen nicht in der öffentlichen Tabelle

**Status: done** (2026-09-11). Verified via unit tests, a new integration
test against the real overview query (`public-league/queries.integration.
test.ts`), the full suite and a seeded season as guest.

## Context

The result embargo (`docs/plans/motw-result-embargo.md`,
`docs/plans/recording-holds.md`) withholds a result completely: the score
never reaches a public browser, the match page shows the pairing as
"Gespielt" without games, replays or sheets. The standings, however, have
always counted the result immediately. That was written down as an accepted
leak.

It is not a leak, it is the whole result. The table shows wins and losses
per player, and the Spielplan shows which matches exist. Put the two next to
each other and a withheld match reads straight off: the winner has one win
more than his other listed matches account for. The game differential often
gives away 2:0 against 2:1 on top. Nobody has to remember yesterday's table
for this.

Two things have changed since that decision. The embargo became a rule
rather than a courtesy, and with MotW candidates
(`docs/plans/motw-candidates.md`) a normal week withholds two or three
matches instead of at most one. An arithmetic hole that size makes the rest
of the feature decorative.

So: **a result that is not public does not count in the public table.**

## The decision this rests on: the table is not personalised

A match row can be shown to some viewers and not others, because the row is
about that one match — that is the established preview idiom (staff and the
two participants see the result, marked as not public).

A table is an aggregate about everyone. "Platz 3" has to mean the same thing
for everyone who talks about it; promotion and relegation zones and
tiebreakers even more so. A participant with a private table would see a
different rank than the community discussing it in Discord, and would have
no way to tell which one counts. That is worse than not seeing their own
result counted for a few days, especially since they do see the result
itself on the match page, marked as not public.

Therefore the public table is **one table for everyone**, staff and
participants included, and it counts only public results.

## Scope

**In:**

- **Public standings exclude every embargoed result**: the group table, the
  merged Gesamttabelle, the post-season zones derived from them, the
  tiebreakers, and the rank shown on a player profile. "Embargoed" is the
  existing public rule (`resultEmbargo` for a viewer who is neither staff
  nor participant): the MotW before its VOD, and any recording hold, which
  includes the MotW candidates of the running week.
- **A withheld result is simply absent from the input**, not counted as
  played-without-a-winner: a played match with no winner would distort
  wins/losses and still say that the match is decided.
- **A note under an affected table** (`StandingsTable`, one component for
  every public table): "Ein Ergebnis wird noch zurückgehalten und zählt
  erst, sobald es veröffentlicht ist." (plural accordingly). It reveals
  nothing new, the Spielplan already shows those rows as played with the
  result pending, and without it the table looks wrong rather than
  deliberate.
- **The true tally stays where staff already have it**: `windowPlayerForm`
  (the placement and record in the MotW picker) and the stream API's
  `record` keep counting everything. The stream airs the match it asks
  about, and the picker is a staff tool.

**Out:**

- **No second, full table for staff or participants anywhere in the public
  views.** The hub has no staff standings page today, so nothing is lost;
  if staff turn out to need the true table, that is its own slice and it
  belongs in the staff area, not as a per-viewer variant of the public one.
- No change to the embargo rule itself, to the row idioms, to Discord, or
  to what the stream API delivers.
- Seeding for the next season: it reads the final table, by which time
  everything is released. No guard, the stale-holds card is what makes sure
  of that.

## Consequence worth naming

The public table is provisional while results are withheld, and it moves
when they are released, possibly across a promotion or relegation line. That
was the argument for counting them immediately. It is the weaker argument: a
table during a running Spieltag is always incomplete, because the matches
are played across the week. A withheld result is, for the table, the same
thing as a match that has not been played yet. The difference is only that
this time we do it on purpose.

## Pure logic (`src/features/spoilers/embargo.ts`, unit-tested)

```ts
// The matches whose result the public may not see right now. An aggregate
// cannot hide one row the way a match row can: it has to drop the input.
export function publicEmbargoedIds(input: {
  motw: readonly { matchId: string; youtubeUrl: string | null }[];
  holds: readonly { matchId: string }[];
}): Set<string>;

// Drops those results from a standings input.
export function withoutEmbargoed<T extends { matchId: string }>(
  results: readonly T[],
  embargoed: ReadonlySet<string>,
): T[];
```

`publicEmbargoedIds` evaluates `resultEmbargo` for a neutral viewer, so the
table and the rows can never drift apart on what counts as withheld.

`ResultForStandings` gains `matchId` (`groupResults` already keys by it), so
the filter is possible at all.

## Views and queries

- `public-league/queries.ts`: filters the results of every group before
  `computeStandings` and before `divisionStandings`, and reports
  `withheldResults` per group and per division for the note.
- `/spieler` (dashboard): loads the window's selections and holds and
  filters the same way, for the group table, the Gesamttabelle and the
  zones.
- `/spieler/[userId]`: the rank comes from the filtered table.
- `StandingsTable` gains `withheld?: number` and renders the note next to
  the zone legend.
- `windowPlayerForm` unchanged, with a comment saying why.

## Tests

- **Unit** `spoilers/embargo.test.ts`: `publicEmbargoedIds` (MotW without
  VOD in, MotW with VOD out, hold in, unrelated match out) and
  `withoutEmbargoed`.
- **Integration** `public-league/queries.integration.test.ts` (new, against
  the real overview query): a public result counts; a held one leaves both
  players at 0-0 with the game differential untouched and the row still
  withheld; the MotW drops out until its VOD is attached and counts from
  then on; `windowPlayerForm` counts it the whole time.
- **Manual**: seeded season as guest, comparing the table against the row
  that says "Gespielt".
