# Public spoiler protection

**Status: done** (2026-07-05) — `src/features/spoilers/` + overview switch,
covered scores, match-page protection. Verified via unit tests and a seeded
season in both cookie states.
**Design pass done** (2026-07-06) per `design/SPOILER-SCHUTZ.md` — in-place
placeholder pills instead of dark chips, the orange MotW cover pill as the
row's only marker, and inline match-page masking (pairing headline, notice
line with reveal/re-cover, masked scoreboard with reserved marker rows,
per-game pills, phantom third game with ghost row). The full-page cover
components (`SpoilerCoverShell`, `MotwSpoiler`) are retired; `ReportSummary`
carries a `spoilerMode` instead.

## Context

The public Bereich should be safe to browse without getting results spoiled —
matching the community's Discord habits (scores behind spoiler tags) and the
results channel, which is spoiler-first too. Today only the Match of the Week
is protected; every other reported match shows its score openly on the
overview and the match page.

Scope of "public Bereich": the `/` overview and `/match/[matchId]` for
neutral viewers. The Spieler-Dashboard only ever shows the viewer's own
scores and stays untouched; participants and staff keep seeing everything.

## Scope

**In:**
- **Hidden scores by default**: on the public overview, the score of every
  reported match the viewer did not play in is covered. Covered rows never
  bold the winner (the same leak rule as the MotW row). Byes, unreported
  ("offen") and pending matches are unaffected.
- **Per-score reveal**: a covered score is tap-to-reveal in place
  (Discord-spoiler style), without triggering the row's link navigation.
  Reveal state is per interaction, not persisted.
- **Global switch**: one switch on the public overview turns all spoiler
  protection off (and back on). The preference is stored in a cookie
  (per browser, works anonymously, no account setting), so it carries to
  the match page and across visits, and the server can render the correct
  state without a cover flicker.
- **Match page**: with protection on, neutral viewers get a cover page
  (back link → kicker → pairing, plus a card with "Ergebnis anzeigen",
  reusing the MotW cover shell) instead of the result summary; revealed
  results can be re-covered. With the switch off, the summary renders
  directly — entering a match from the overview honors the preference.
- **Own matches always open**: rows where the signed-in viewer is a
  participant are exempt everywhere.
- **MotW fully exempt from the switch**: the billboard, its row badge, and
  its match-page cover keep their own always-on reveal exactly as today —
  the global switch never unhides the Match of the Week. Before the VOD the
  MotW result is not merely covered but withheld from the public entirely
  (`docs/plans/motw-result-embargo.md`).
- **Standings stay visible** (confirmed): tables aggregate results and
  inherently leak; hiding them would gut the page.

**Out (deferred):**
- Account-level spoiler preference (the cookie is per browser).
- Spoiler protection in the Spieler-Dashboard or staff area (own results /
  staff duty respectively).

## Feature folder — `src/features/spoilers/`

**Pure logic (`spoilers.ts`, unit-tested):**
- `scoreHidden({ reported, isMine, spoilersOff })` — whether a row's score is
  covered (MotW rows never reach it; they render the badge). Trivial but the
  rule lives in one tested place.
- Cookie constants + parse helper: cookie `spoilers_off=1` (absence =
  protected, the default), max-age one year, path `/`.

**Components (`components/`):**
- `SpoilerScore` (client) — the covered score chip: masked by default,
  tap reveals in place (`preventDefault`/`stopPropagation` — the row stays a
  link), also renders the plain score when nothing is hidden so the row
  logic stays in one place.
- `SpoilerSwitch` (client) — the global switch (shadcn Switch + label
  "Spoiler-Schutz"), writes the cookie and updates page state.
- `SpoilerCoverShell` (client) — the match-page cover skeleton (back link,
  kicker, pairing `h1`, cover card with reveal/re-cover), extracted from
  today's `MotwSpoiler`; the MotW variant keeps its badge/copy and ignores
  the preference, the generic variant takes neutral copy and is skipped
  entirely when the switch is off.

## Views

- **`/` (`app/page.tsx`)**: read the cookie, pass `spoilersOff` into
  `<PublicLeague>`.
- **`PublicLeague`**: holds the preference as state (initialized from the
  prop, toggled by `SpoilerSwitch` in the header row); `MatchRow` renders
  `SpoilerScore` for reported foreign matches and suppresses winner bolding
  while covered. MotW rows unchanged (badge).
- **`/match/[matchId]`**: read the cookie; neutral viewers with a result get
  the generic cover when protection is on (MotW keeps `MotwSpoiler`
  unconditionally). Participants/staff unchanged.

## Dev tooling

- Gallery: covered/revealed `SpoilerScore` row, `SpoilerSwitch`, generic
  match-page cover next to the existing MotW cover.

## Tests

- Unit: `scoreHidden` (reported/unreported × mine/foreign × switch on/off),
  cookie parse helper.
- Manual: seeded season — overview covered by default; tap-reveal single
  scores; flip the switch → everything opens except the MotW block/row;
  click into a match with the switch off → summary renders uncovered; own
  matches always open for a signed-in persona.

## Delivery

Branch `feat/public-spoiler-protection`, squash-merged to main as one commit.
