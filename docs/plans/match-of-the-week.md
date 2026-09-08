# Match of the Week

**Status: done** (2026-07-05) — schema + `src/features/motw/` + public block,
row badge, match-page spoiler, `/staff/motw` manager and dashboard todo.
Verified via unit/integration tests and a seeded running season (public
overview, featured match page, staff persona on `/staff` + `/staff/motw`).
**Design pass done** (2026-07-05) per `design/MATCH-OF-THE-WEEK.md` — navy
billboard, badge anatomy, manager filter chips/VOD chips, mobile stacking;
views only, plus `findMotw` now also carrying the players' standings ranks
for the billboard's "Platz {n}" sub-lines.

## Context

Each Spieltag (one week) the league features one match: the **Match of the
Week** — always called exactly that, never translated. Staff pick it at the
start of the week; it gets a prominent block on the public overview, later a
YouTube VOD link, and its result is never shown openly anywhere — spoiler
protection lets viewers watch the VOD first.

Rudimentary-but-intentional design; hand-off + design pass come later.

## Scope

**In:**
- **Selection** (staff+): pick one match per Spieltag — one MotW per
  `(window, round)`, league-wide across all divisions. Selectable rounds are
  the **current Spieltag and every later one** (a pick can be replaced or
  removed), **plus any past Spieltag that was never picked**, so a missed week
  can still be backfilled. A past round that already has a pick is settled —
  only its VOD link stays editable.
- **Staff todo**: on the staff season dashboard, a todo item when the *next*
  round has no MotW yet (warning character); if the *current* round has none,
  it is replaced by a more urgent item for this week. Purely informational —
  it never blocks anything (pairings etc.).
- **YouTube link**: staff attach/edit/remove a YouTube URL on any MotW,
  including past rounds (uploads can lag the Spieltag).
- **Public prominent block**: shown on the public overview only while its
  round is the current Spieltag: the pairing with division/group context, a
  "Watch on YouTube" button once the link exists, and the result behind
  click-to-reveal once reported. No MotW for the current round → no block.
- **Result embargo until the VOD** (`docs/plans/motw-result-embargo.md`):
  while the pick has no YouTube link, the result is withheld from everyone
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
  spoiler tag, not security. The standings include the result immediately
  (accepted leak, also during the embargo).

**Out (deferred):**
- MotW history/archive page.
- Any casting/scheduling workflow around the featured match.

## Data — new table `motw_selections`

```
id              uuid PK default random
window_id       uuid FK → registration_windows (cascade)
round           integer
match_id        uuid FK → matches (cascade), unique
youtube_url     text null
selected_by_id  uuid (FK → auth.users in the custom migration, cascade)
created_at      timestamptz default now
updated_at      timestamptz default now
unique (window_id, round)      -- one MotW per Spieltag
```

Migrations: `motw` (generated) + `motw_fk_rls` (custom: auth FK, RLS
public-read/deny-write as defense in depth, matching existing tables). The
server action validates that the match actually belongs to the given window
and round.

## Feature folder — `src/features/motw/`

**Pure logic (`motw.ts`, unit-tested):**
- `youtubeUrlSchema` / `isYoutubeUrl` — Zod: https, host is a YouTube domain
  (`youtube.com`, `www./m.youtube.com`, `youtu.be`).
- `motwTodo({ currentRound, totalRounds, selectedRounds })` →
  `null | { round, urgency: "warning" | "urgent" }` — urgent when the current
  round is unselected, else warning when a next round exists and is
  unselected. `null` outside the regular season / after the last round.
- `canSelectRound` / `selectableRounds` — the rounds open for picking (current
  … last, plus unpicked past ones); shared by the actions' round gate and the
  staff page.
- `weekState` / `initialMotwRound` / `sortCandidates` / `recordability` /
  `buildMotwWeeks` — the staff workspace's week model
  (`docs/plans/motw-week-workspace.md`).
- `findMotw(divisions, selection)` — locate the featured `PublicMatch` plus
  its group name inside the already-built overview divisions (no extra
  identity queries) for the prominent block.
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
  affected match id for revalidation.

**Actions (`actions.ts`, staff+ gate on each, `{ ok } | { ok:false, error }`,
`revalidatePath` on `/`, `/match/[matchId]`, `/staff`, `/staff/motw`):**
- `selectMotw({ matchId })` — derives window/round from the match, rejects
  byes and rounds other than current/next, upserts (replace allowed).
- `removeMotw({ round })` — clears the pick (current/next round only).
- `saveMotwYoutubeUrl({ round, url })` — validates via `youtubeUrlSchema`;
  `url: null` removes the link; allowed for any round.

## Views

- **Public overview** (`src/features/public-league/`): `publicLeagueOverview`
  additionally fetches `motwForWindow` and takes the viewer; `PublicMatch`
  gains `isMotw` and `embargo` (scores stay filled for the block's
  reveal unless the result is withheld from this viewer); `PublicOverview`
  gains the current round's block data (or null). `<MotwBlock>` renders
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
  replace (clears the URL); `setMotwYoutubeUrl` set/clear/no-pick;
  `deleteMotw`; `matchSelectionContext`; `motwForWindow` shape.
- Manual: seed a running season; pick a MotW as staff persona; verify block,
  badge, match-page reveal, todo transitions, YouTube button.

## Delivery

Branch `feat/match-of-the-week`, squash-merged to main as one commit.
