# Match reporting (player side) + Spieler-Dashboard design pass

**Status: done** (2026-07-03) — reporting at `/match/[matchId]`, dashboard design
pass applied. Verified end to end via a persona on a seeded running season.

## Context

The regular season runs and players can see their schedule (`/spieler`), but there is
no way to record a result — `matches` has no result columns. This feature adds
**player-side match reporting** and, since the reporting result cells live on the
Spieler-Dashboard, applies the pending designer hand-off `design/SPIELER-DASHBOARD.md`
in the same feature (the "Ergebnis melden" button, result chips and live standings only
function once reporting exists — combining avoids a reserved-but-empty dashboard).

Scope is the **player** flow. All staff powers — accessing/correcting any report,
proactively awarding free wins or double losses, and **confirming** free wins — are
reached from the staff running-season dashboard, a **separate later feature**. The data
model is built to accommodate them now so that feature needs no migration.

## Reporting model (domain)

- A match is **best-of-3** (first to 2 games; game 3 only if 1–1).
- **Any participating player** reports the whole result on a per-match screen. Results are
  **final immediately — no opponent confirmation**; disagreement is handled by the later
  Disputes feature.
- A **normal report** carries: per-game winner (UI Win/Loss from the reporter's view,
  stored as absolute winner); a **required pokepaste team sheet for both players**; the
  **platform**; **Showdown → a replay link per played game (required)**, **Cartridge → one
  optional video link**. Required only where the season's top-X replay rule says so, and
  never for the Match of the Week: that one is played on stream and recorded, the
  recording is its proof (`getMatchForReport` sets `proofRequired` false for it).
- A **free win** (walkover): which participant wins + reason + the staff/admin member
  (never `dev`) discussed with. No games/sheets/replays. **Pending** until a staff member
  confirms — confirmation UI is deferred (staff dashboard), so a reported free win stays
  pending and counts for nobody in standings. Known, accepted gap.

## Schema (`src/db/schema.ts` + custom FK/RLS migration via `drizzle-kit generate --custom`)

`matches` unchanged — a result is a distinct lifecycle object.

- `matchOutcomeEnum` = `["normal","free_win","double_loss"]` (`double_loss` reserved for the
  staff feature; not creatable this slice).
- **`match_results`** (1:1, `matchId` PK): `outcome`, `winnerId` (null for double_loss),
  `platform` (null for free_win), `playerATeamUrl`/`playerBTeamUrl` (pokepaste, normal only),
  `videoUrl` (cartridge optional), `freeWinReason`, `discussedWithId`, `reportedById`,
  `reportedAt`, `confirmedById`/`confirmedAt` (free-win lifecycle — null this slice),
  `correctedById`/`correctedAt` (staff corrections, future), `createdAt`/`updatedAt`.
- **`match_games`** (0..3 rows): `id`, `matchId` FK→match_results (cascade), `gameNumber`,
  `winnerId`, `replayUrl` (showdown), unique `(matchId, gameNumber)`.
- FK/RLS: `match_id`→matches cascade; participant/reporter/winner→`auth.users` cascade;
  `discussedWithId`/`confirmedById`/`correctedById`→`auth.users` **SET NULL**; games→
  match_results cascade; RLS on, **no policies** (server-only).

## Pure logic — `src/features/reporting/` (exhaustively unit-tested)

- `report.ts` — `isPokepasteUrl`, `deriveSeries(games)` (bo3 legality: too_few /
  not_decisive / extra_game / too_many), `reportSchema(context)`
  (`z.discriminatedUnion("outcome", …)`: `normal` + `free_win`), `toResultRows` (reporter-view
  Win/Loss → absolute `winnerId`s). Reporter-is-participant enforced at the boundary.
- `standings.ts` — `computeStandings({roster, results})`: W/L, points = 3·W, sort
  `points desc, losses asc, name localeCompare "de"`, rank 1..n. Confirmed free_win → W/L;
  double_loss → both +L; pending free_win / unreported / bye → nobody.
- `match-state.ts` — `matchDisplayState(...)` → `current | upcoming | reported |
  pending_free_win | overdue` (result beats date; byes never überfällig), `scoreFor(...)`.

## Data layer — `src/features/reporting/queries.ts` + `actions.ts`

- Queries: `getMatchForReport`, `getMatchResult` (+games), `saveResult` (tx), `groupResults`
  (feed standings), `listStaffAndAdmins()` (`inArray(profiles.role, ["staff","admin"])`,
  excludes dev). Integration-tested (mirror `season/queries.integration.test.ts`; assert
  cascades + pending free-win state).
- `actions.ts` — `reportMatch(input)`: caller is a participant, match not already reported,
  `reportSchema.safeParse`, persist, `revalidatePath`. `{ok}|{ok:false,error}` pattern.

## Report screen — `src/app/match/[matchId]/page.tsx` (new dynamic route)

Server page: auth + participant gate; loads match + existing result (reported → read-only
summary; else the form). Client form in `src/features/reporting/components/`: game rows
(Win/Loss `RadioGroup`; game 3 enabled only at 1–1), two pokepaste inputs, platform
`RadioGroup`, per-game replay inputs (Showdown) / one optional video (Cartridge), a free-win
switch → winner select + reason + disclaimer + staff/admin `Select`. Plain `useState` + shared
Zod + server action + `router.refresh()`. **Rudimentary-but-intentional** fidelity (no hand-off
yet — designer hand-off + design pass come later).

## Dashboard — apply `design/SPIELER-DASHBOARD.md` + wire reporting

Thread `matchId` through `buildPlayerMatches` → `PlayerMatch` → components (link to
`/match/[matchId]`). Apply the hand-off: §1 nav tick, §2 shell widen + "Deine Saison" title,
§3 progress strip, §4 hero (matchup + meta + "Ergebnis melden" → report; post-report: final
score / "warten auf Bestätigung"), §5 schedule result chips + Überfällig, §6 live standings +
sort, §7 not-placed panel. Files: `site-header.tsx`, `spieler/page.tsx`,
`season/components/season-dashboard.tsx`. Load group results in `spieler/page.tsx`.

## Dev tooling & docs

- Gallery: report form (normal + free-win), dashboard with results (reported/overdue/pending
  rows, populated standings).
- Extend the running-season seed (`features/dev/seed.ts`) to record some results.
- The CLAUDE.md "Design happens in two passes" addition rides in this feature's commit.

## Deferred (out of scope)

- **Staff running-season dashboard**: staff access to any report, corrections, proactive free
  wins / **double losses**, **free-win confirmation** (model ready).
- **Disputes**: the correction path for finalized results.

## Delivery

One feature, built on branch `feat/match-reporting`, squash-merged to main. Build order:
schema+migration → pure logic+tests → queries+action+integration → report screen → dashboard
design pass + wiring → dev tooling → checks.

## Verification

- `biome`, `tsc`, `npm test -- --run` (unit + integration; local Supabase up).
- Manual: seed a running season as a persona; report a 2–1 (Showdown, replays + both
  pokepastes) → hero final score, schedule Sieg/score, standings update; free win → pending;
  past unreported → Überfällig. Both light/dark (`SPIELER-DASHBOARD.md §8`).

## Resolved decisions / assumptions

- Best-of-3 (first to 2). Pokepaste host = `pokepast.es`. `double_loss` reporter-view label =
  "Niederlage" for both. Route `/match/[matchId]` (participant-gated now; staff access later).
  This feature carries the dashboard's first design pass in full.
