# Match of the Week

**Status: done** (2026-07-05) — schema + `src/features/motw/` + public block,
row badge, match-page spoiler, `/staff/motw` manager and dashboard todo.
Verified via unit/integration tests and a seeded running season (public
overview, featured match page, staff persona on `/staff` + `/staff/motw`).
**Design pass done** (2026-07-05) per `design/MATCH-OF-THE-WEEK.md` — navy
billboard, badge anatomy, manager filter chips/VOD chips, mobile stacking;
views only, plus `findMotw` now also carrying the players' standings ranks
for the billboard's "Platz {n}" sub-lines. **Extended** (2026-09-11) by
candidates and the confirmation step (`docs/plans/motw-candidates.md`), which
is where the selection semantics now live.

## Context

Each Spieltag (one week) the league features one match: the **Match of the
Week** — always called exactly that, never translated. Staff nominate a
Hauptkandidat and backups for the week, record them all, and confirm afterwards
which one it was (`docs/plans/motw-candidates.md`); the confirmed match gets a
prominent block on the public overview, later a YouTube VOD link, and its
result is never shown openly anywhere — spoiler protection lets viewers watch
the VOD first.

Rudimentary-but-intentional design; hand-off + design pass come later.

## Scope

**In:**
- **Candidates and confirmation** (staff+, `docs/plans/motw-candidates.md`):
  per Spieltag a Hauptkandidat and any number of backups are nominated (each
  one held back like a recording, because that is what it is), and one of them
  is confirmed as the Match of the Week — one confirmation per `(window,
  round)`, league-wide across all divisions. Confirmable rounds are the
  **current Spieltag and every later one** (a confirmation can be replaced or
  revoked, and the match then goes back under a hold), **plus any past Spieltag
  that was never confirmed**, which is both the backfill path and the normal
  one, since the decision is usually made after the week was played. A past
  round that is confirmed is settled — only its VOD link stays editable.
- **Staff todo**: on the staff season dashboard, one card for whichever duty is
  open — urgent for a finished Spieltag whose candidates were never confirmed
  (it holds the billboard on an older week), urgent for a running Spieltag
  without a single candidate, a warning for the next Spieltag without one.
  Purely informational — it never blocks anything (pairings etc.).
- **YouTube link**: staff attach/edit/remove a YouTube URL on any MotW,
  including past rounds (uploads can lag the Spieltag).
- **Public prominent block**: shown on the public overview for the **most
  recently confirmed** Match of the Week: the pairing with division/group
  context, a "Watch on YouTube" button once the link exists, and the result
  behind click-to-reveal once reported. While a new Spieltag runs undecided the
  block carries the previous week, and it switches the moment staff confirm.
  No confirmation in the season yet → no block.
- **Stream photo**: the two featured players are offered the picture the
  stream shows next to their name (`docs/plans/stream-photos.md`).
- **No replay duty**: the match is recorded on stream, so the report needs
  no replay links even in a tier the season's replay rule covers
  (`proofRequired` false in `getMatchForReport`; links given are still
  format-checked).
- **Result embargo until the VOD** (`docs/plans/motw-result-embargo.md`):
  while the confirmed match has no YouTube link, the result is withheld from everyone
  but staff and the two participants — it never reaches their browser. The
  row keeps an inert orange pill, the billboard says "Ergebnis folgt mit dem
  VOD", the match page shows the pairing as "Gespielt" without games,
  replays or teamsheets. Staff and participants see the result with a "Noch
  nicht öffentlich" marker.
- **Spoiler protection after the VOD, permanent**: the MotW result is never
  shown openly and ignores the global spoiler switch. In the Spieltag match
  list (current *and* past rounds) the row shows the orange "MotW" cover
  pill instead of the score (tap reveals in place — the pill is the row's
  only marker, see `design/SPOILER-SCHUTZ.md` §2.3). On `/match/[matchId]`
  neutral viewers get the inline-masked result page with the MotW notice
  copy (participants and staff see everything, as today). Reveal state is
  client-side only — the score is in the payload; this is a courtesy
  spoiler tag, not security. While the result is under embargo it does not
  count in the public table either (`docs/plans/standings-embargo.md`): an
  aggregate that counts it hands the result to anyone who compares it with
  the Spielplan.

**Out (deferred):**
- MotW history/archive page.
- Any casting/scheduling workflow around the featured match.

## Data — table `motw_selections` (the confirmation)

```
id              uuid PK default random
window_id       uuid FK → registration_windows (cascade)
round           integer
match_id        uuid FK → matches (cascade), unique
youtube_url     text null
selected_by_id  uuid (FK → auth.users in the custom migration, cascade)
created_at      timestamptz default now
updated_at      timestamptz default now
unique (window_id, round)      -- one confirmed MotW per Spieltag
```

The candidates of a week are not in this table: they are `recording_holds` rows
carrying a `motw_role` (`docs/plans/motw-candidates.md`), which is why a
candidate needs no second kind of embargo.

Migrations: `motw` (generated) + `motw_fk_rls` (custom: auth FK, RLS
public-read/deny-write as defense in depth, matching existing tables). The
server action validates that the match actually belongs to the given window
and round.

## Feature folder — `src/features/motw/`

**Pure logic (`motw.ts`, unit-tested):**
- `youtubeUrlSchema` / `isYoutubeUrl` — Zod: https, host is a YouTube domain
  (`youtube.com`, `www./m.youtube.com`, `youtu.be`).
- `motwTodo({ currentRound, totalRounds, confirmedRounds, candidateRounds })` →
  `null | { round, kind: "confirm" | "nominate", urgency }` — the open duty in
  priority order (finished week awaiting a decision, running week without
  candidates, next week without candidates). `null` when none applies.
- `canSelectRound` / `selectableRounds` — the rounds open for confirming
  (current … last, plus unconfirmed past ones); shared by the actions' round
  gate and the staff page. `canNominate` is the nomination gate and defers to
  the recordings rule (`canHold`).
- `billboardSelection(selections, currentRound)` — the confirmation the public
  block features: the most recent one whose Spieltag is not in the future.
- `weekState` / `initialMotwRound` / `sortOptions` / `recordability` /
  `weekCandidates` / `buildMotwWeeks` — the staff workspace's week model
  (`docs/plans/motw-week-workspace.md`, `docs/plans/motw-candidates.md`).
- `findMotw(divisions, selection, currentRound)` — locate the featured
  `PublicMatch` plus its group name inside the already-built overview divisions
  (no extra identity queries) for the prominent block, and mark whether it
  belongs to the running Spieltag.
- The result embargo before the VOD lives in the shared
  `src/features/spoilers/embargo.ts` (`resultEmbargo` / `withholdScore`,
  `docs/plans/motw-result-embargo.md`); the recording holds reuse it.

**Queries (`queries.ts`, integration-tested):**
- `motwForWindow(windowId)` — all selections `{ round, matchId, youtubeUrl }`;
  feeds overview flagging, the block, and the staff view.
- `motwByMatchId(matchId)` — for the match page.
- `matchSelectionContext(matchId)` — window/round/bye of a match, the
  selection action's validation input.
- `upsertMotw` (replace clears the YouTube URL), `deleteMotw`,
  `setMotwYoutubeUrl` — persistence helpers; the latter two return the
  affected match id for revalidation. The candidates come from
  `holdsForWindow` (`src/features/recordings/queries.ts`), which carries the
  `motwRole` of each hold.

**Actions (`actions.ts`, staff+ gate on each, `{ ok } | { ok:false, error }`,
`revalidatePath` on `/`, `/spielplan`, `/match/[matchId]`, `/spieler/[id]`,
`/staff`, `/staff/motw`, `/staff/aufnahmen`):**
- `nominateMotwCandidate({ matchId, role })` — holds the match back and gives
  it a role; a new Hauptkandidat demotes the previous one.
- `dropMotwCandidate({ matchId })` — clears the role, keeps the hold.
- `confirmMotw({ matchId })` — derives window/round from the match, rejects
  byes, dropped participants and settled past rounds, writes the confirmation
  and deletes that match's hold. A replaced match goes back under a hold.
- `revokeMotw({ round })` — clears the confirmation (current/later round, or an
  unconfirmed past one) and re-holds the match as a backup.
- `saveMotwYoutubeUrl({ round, url })` — validates via `youtubeUrlSchema`;
  `url: null` removes the link; allowed for any round.

## Views

- **Public overview** (`src/features/public-league/`): `publicLeagueOverview`
  additionally fetches `motwForWindow` and takes the viewer; `PublicMatch`
  gains `isMotw` and `embargo` (scores stay filled for the block's
  reveal unless the result is withheld from this viewer); `PublicOverview`
  gains the featured block data from `billboardSelection` (or null). `<MotwBlock>` renders
  above the division switcher; `<MatchRow>` renders the orange MotW cover
  pill instead of any score for `isMotw` rows — every round, permanently
  (`<MotwBadge>` itself lives on in the match-page banner and the staff
  manager).
- **Match page** (`/app/match/[matchId]`): a `<MotwMatchBanner>` (badge +
  Spieltag + YouTube button) for every viewer; neutral viewers get the result
  summary wrapped in `<MotwSpoiler>` (pairing header + cover card,
  click-to-reveal). Participants and staff see the result as usual.
- **Staff** — new page `/staff/motw` (staff+ gate, redirects to `/staff`
  without a schedule): `<MotwManager>` is a one-week-at-a-time workspace with a
  season pager. Full spec: `docs/plans/motw-week-workspace.md`.
- **Staff season dashboard**: `<MotwTodoCard>` from `motwTodo` — warning
  variant ("Match of the Week für Spieltag N wählen") or urgent variant for
  the current round — linking to `/staff/motw`; the season strip carries a
  permanent "Match of the Week" button as the entry point once the todo is
  gone.

## Dev tooling

- Running-season seed: mark one match of the current round as MotW (with
  result, without YouTube link) so block, badge, and reveal are visible.
- Gallery: MotwBlock states (unplayed, result hidden, revealed, with/without
  YouTube button), MotW badge row, todo item in both urgencies.

## Tests

- Unit: `motwTodo` (unselected current → urgent; unselected next → warning;
  both unselected → urgent only; all selected / last round / off-season →
  null), `selectableRounds` (the actions' round gate — covered from both sides
  in `actions.integration.test.ts`), `youtubeUrlSchema`
  (https-only, domain allowlist, suffix-trick host), `findMotw` (found /
  unknown / bye).
- Integration: unique `(window_id, round)` constraint; `upsertMotw` insert +
  replace (clears the URL); `setMotwYoutubeUrl` set/clear/unconfirmed round;
  `deleteMotw`; `matchSelectionContext`; `motwForWindow` shape.
- Manual: seed a running season; nominate and confirm as staff persona; verify
  block, badge, match-page reveal, todo transitions, YouTube button.

## Delivery

Branch `feat/match-of-the-week`, squash-merged to main as one commit.
