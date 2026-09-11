# MotW candidates (Hauptkandidat, Backups, and a confirmation step)

**Status: done** (2026-09-11). Built and designed in one pass on the existing
MotW, recording and embargo idioms; the shipped look is written up in
`design/MATCH-OF-THE-WEEK.md` §2, §5.1, §5.3, §5.3a, §5.4, §5.6 and §6.
Verified via unit and integration tests, the full suite and a seeded season as
guest and as staff persona (carried-over billboard, the two candidates as
withheld recordings, the Kandidaten panel, the MotW chips under Aufnahmen).

## Context

Today the Match of the Week is one pick per Spieltag, made in advance: staff
choose a match on `/staff/motw`, the billboard advertises it for that week,
its result is withheld until the VOD is attached.

Reality does not cooperate with a single pick. Staff line up a match, and it
is played at a time nobody can record, or it turns into a 2:0 in fifteen
minutes, or a player reschedules. So staff record several matches of a
Spieltag and decide afterwards which one actually becomes the Match of the
Week.

This feature builds that flow into the hub:

- staff nominate **one Hauptkandidat and any number of Backups** per
  Spieltag;
- every candidate's result is withheld exactly like a recording, from the
  moment it is nominated;
- the billboard keeps advertising **the last confirmed MotW** while the new
  week runs, because the new one is not decided yet;
- a staff member **confirms** on `/staff/motw` which candidate was the Match
  of the Week; from that moment it is the MotW in the established sense
  (billboard, permanent orange pill, VOD field, "· Match of the Week" on the
  Discord result post);
- the backups stay withheld, stay in `/staff/aufnahmen`, and are released
  there one by one like any other recording.

## The central idea: a candidate is a recording

A MotW candidate **is** a match staff record for the stream. That is not an
analogy, it is the same fact: staff record all candidates, which is why
backups exist at all.

So candidacy is stored as a `recording_holds` row carrying a MotW role, and
**not** as a second kind of withheld state:

- the result embargo (`src/features/spoilers/embargo.ts`) needs **no
  change**: a candidate is `held: true`, reason `"recording"`, and the
  public copy ("Ergebnis folgt nach dem Stream") is already right;
- `/staff/aufnahmen` lists candidates **without any new plumbing**, and
  "Freigeben" already does exactly what the backups need;
- no new public state, no new pill, no new match-page state, no new Discord
  branch.

`motw_selections` keeps its current shape and meaning, narrowed to one word:
a row is a **confirmed** Match of the Week. Everything downstream of that
table (billboard, orange pill, VOD field, result post suffix, spoiler
protection until the VOD, stream API `motw` flag) stays as it is.

The two staff pages divide cleanly:

- `/staff/motw` owns **candidacy and confirmation**. It never publishes a
  result.
- `/staff/aufnahmen` owns **the hold**. Releasing is only ever done there.

## Scope

**In:**

- **Schema**: `recording_holds` gains `motw_role motw_role null` (enum
  `primary` | `backup`; null = an ordinary recording) plus a partial unique
  index `(window_id, round) where motw_role = 'primary'`, so a Spieltag can
  never have two Hauptkandidaten. Generated migration; the existing RLS
  policy covers the column.
- **Nominating** (staff+, from `/staff/motw`): `nominateMotwCandidate({
  matchId, role })`. Creates the hold if the match has none, otherwise only
  sets the role, so a match already marked for a recording can be promoted
  into the MotW race without changing anything else. Same gate as a hold
  (`canHold`): not reported, not a bye, not drop-decided, current or a later
  Spieltag. Setting `primary` demotes the round's previous Hauptkandidat to
  `backup`.
- **Un-nominating** (staff+, from `/staff/motw`): `dropMotwCandidate({
  matchId })` clears the role. **The hold stays** and the match stays
  withheld, now as an ordinary recording. The panel says so and links to
  `/staff/aufnahmen`. The MotW workspace must not be able to publish a
  result by accident.
- **Confirming** (staff+, from `/staff/motw`): `confirmMotw({ matchId })`
  writes the `motw_selections` row for the round and deletes that match's
  hold, so the MotW embargo (until the VOD) takes over from the recording
  embargo without a gap. The other candidates are untouched. A match that
  *stops* being the confirmed MotW — replaced here, or revoked — goes back
  under a hold as a backup, so correcting a confirmation never publishes a
  recorded result or posts it to Discord. Round gate is
  today's `canSelectRound`: the current Spieltag and every later one are
  free, a past one can be confirmed while it has no confirmation. A past
  round that is confirmed is settled, only its VOD link stays editable.
  Confirming after the Spieltag is over is the normal case, not an edge one.
  `selectMotw` is renamed to `confirmMotw` and `removeMotw` to `revokeMotw`,
  because that is what they now mean.
- **Confirming a match that was never a candidate** stays possible for an
  unconfirmed round (today's backfill path, reachable from the picker). Its
  consequence is unchanged: an already public result is withheld again and
  its Discord post deleted until the VOD lands. The picker says so on such a
  row.
- **Billboard** (`MotwBlock` on `/`): shows the **most recently confirmed**
  MotW of the season instead of the current round's pick. Concretely: the
  confirmed pick of the highest round that is not in the future, current
  round included. So the previous week's MotW keeps its place until the new
  one is confirmed, and between two Spieltage the block no longer vanishes.
  The block already prints "Spieltag N", so a carried-over week labels
  itself; its state chip becomes round-aware ("Läuft diese Woche" only for
  the running Spieltag, otherwise "Noch nicht gespielt" for an unplayed
  carried-over match).
- **Staff workspace `/staff/motw`** per week:
  - **Kandidaten panel**: the Hauptkandidat first with its badge, then the
    backups in nomination order. Each candidate is a small pick panel rather
    than a list row — meta line (role chip, group, marker, "Zum Match"),
    matchup in the two-sided idiom, then an action bar of its own with
    "Bestätigen", "Zum Hauptmatch" (backups) and "Entfernen". Three labelled
    actions do not fit a list row's trailing cell, and squeezing them in left
    them wrapped and unreadable as buttons.
  - **Confirmed panel**: today's pick panel with the VOD field, plus the
    remaining candidates listed below with the line that they stay withheld
    and are released under Aufnahmen.
  - **Picker** (`motw-option-row.tsx`, today's list with division filter,
    sorting and "Nur aufnehmbar"): the row stays one full-width button and its
    label says what the click does. It nominates while the week is undecided
    and the match can be held — the first nomination becomes the Hauptkandidat,
    the rest backups — and confirms otherwise, which covers both replacing a
    confirmation and backfilling a past week.
  - **Pager**: the per-round marker gains the state "Kandidaten gewählt,
    nicht bestätigt", which is the state a staff member has to act on.
  - Rename in code: today's `MotwCandidate` (any pickable pairing of a week)
    becomes `MotwOption`, and `MotwCandidate` is the nominated match. The
    German UI word "Kandidat" then means one thing only.
- **Staff dashboard `/staff`**: `motwTodo` gains the confirmation duty. In
  priority order: a past Spieltag with candidates and no confirmation →
  urgent "Match of the Week für Spieltag N bestätigen" (the billboard is
  stuck until then); the current Spieltag without any candidate → urgent
  "Kandidaten für Spieltag N wählen"; the next Spieltag without a candidate
  → warning. The existing stale-holds card is untouched and keeps warning
  about the holds themselves.
- **`/staff/aufnahmen`**: candidate rows carry a chip ("MotW-Kandidat" /
  "MotW-Hauptkandidat") so a release there is an informed one, and the
  release of a candidate asks first. Releasing clears the candidacy with the
  hold, which is correct: a public result cannot become the Match of the
  Week.
- **Drops**: dropping a player also clears the MotW role of their matches in
  open rounds, next to the existing removal of a confirmation. A match with a
  dropped player can never be the MotW, so it leaves the race; its hold stays,
  because releasing a recording is an Aufnahmen decision and a drop does not
  make it.
- **Dev tooling**: the seed confirms the previous Spieltag (without a VOD, so
  the billboard carries it with the result withheld), gives the running week a
  Hauptkandidat and a backup that nobody has decided between, and keeps one
  plain stale hold of the previous week. The Spieltag before last is confirmed
  with a VOD whenever the seeded season has one. The gallery covers six weeks
  (missed past, settled past, undecided past, running confirmed with a leftover
  backup, future nominated, future empty), the carried-over billboard, the new
  pager mark, the MotW chips in the recordings workspace, and all three todo
  variants.

**Out:**

- **No public preview of the candidates.** Publicly a candidate is a
  recording and nothing else. Naming them would both spoil which matches are
  covered and turn the confirmation into a public rejection of the others.
  What the billboard advertises is therefore decided by *when* staff
  confirm, and that is their choice per week: confirm before the match is
  played and the block advertises the pairing as today ("Läuft diese
  Woche"); confirm after it, which is the point of having backups, and the
  block carries the previous week until then and afterwards shows the new
  match with "Ergebnis folgt mit dem VOD". Confirming is independent of the
  VOD in both directions.
- **No Discord post on confirmation.** The VOD link stays the single
  publishing moment: announcement first, then the result post. Confirming is
  a staff decision, and a "the MotW is A vs B" post would need its own
  lifecycle (edit on re-confirmation, delete on revoke) for no gain.
- **No VOD field for backups.** A released backup is a normal public result.
  If recordings of backups get published later, that is a separate feature.
- **No candidate ranking beyond Hauptkandidat vs Backup.** Backups are an
  unordered set.
- **No change to the embargo rule, the spoiler cookie, the reveal idiom, the
  match page, the stream API or the standings** (the documented accepted
  leak stays).
- Marking a candidate of a past Spieltag, for the same reason a hold cannot
  be set there: it would be stale the moment it is set.

## Pure logic

`src/features/motw/motw.ts` (unit-tested):

```ts
// The candidacy of a match, as the workspace and the Aufnahmen list read it.
export type MotwRole = "primary" | "backup";

// The billboard's pick: the confirmed MotW of the highest round that is not
// in the future. Null when the season has no confirmation yet.
export function billboardSelection(
  selections: readonly MotwSelection[],
  currentRound: number | null,
): MotwSelection | null;

// One week's nominated matches, Hauptkandidat first, backups in nomination
// order.
export function weekCandidates(
  options: readonly MotwOption[],
  holds: readonly { matchId: string; round: number; motwRole: MotwRole | null }[],
  round: number,
): { option: MotwOption; role: MotwRole }[];
```

`motwTodo` grows a `kind: "confirm" | "nominate"` next to `round` and
`urgency`, with the priority order above, and `canSelectRound`'s
`pickedRounds` becomes `confirmedRounds`. `initialMotwRound` opens on the
undecided finished week first, then on the running week unless it is already
confirmed, then on the first later week that has nothing — nominating and
confirming both happen on the running week, so it outranks preparing the next
one. `weekState`, `sortOptions` (renamed from `sortCandidates`),
`recordability` and the division filter are unchanged; `buildMotwWeeks`
renames `candidates` to `options` and gains the nominated list per week.

`canHold` (`src/features/recordings/holds.ts`) is reused verbatim as the
nomination gate — a candidate is a recording, so the rule is the same one.

## Queries

- `recordings/queries.ts`: `RecordingHold` gains `motwRole: MotwRole | null`
  (one query keeps serving the overview, the profile, both staff pages and
  the stream API); `insertHold` takes an optional role; new `setMotwRole({
  matchId, role })` and `clearPrimaryRole(windowId, round)` for the
  demotion.
- `motw/queries.ts`: unchanged except that `upsertMotw` is now only reached
  from `confirmMotw`.
- `/staff/motw` reads `holdsForWindow` in addition to what it reads today;
  no new query on that page.

## Views

Rudimentary but intentional, built from the existing tokens and idioms
(`design/MATCH-OF-THE-WEEK.md` §5 stays the spec of record for the
workspace, extended by the Kandidaten panel). All copy plain German, no
em-dashes, straight quotes.

## Tests

- **Unit** `motw.test.ts`: `billboardSelection` (current round confirmed;
  carry-over from the previous round; a gap of several rounds; nothing
  confirmed; `currentRound` null → the highest confirmed round; a future
  round's confirmation is never shown); `motwTodo` in the new priority
  matrix; `weekCandidates` (Hauptkandidat first, backups in order, holds of
  other rounds ignored, an ordinary hold is not a candidate);
  `buildMotwWeeks` with candidates and a confirmation.
- **Integration** `motw/actions.integration.test.ts`: nominating creates a
  hold with the role; nominating an already held match only sets the role;
  a second Hauptkandidat demotes the first (and the partial index holds);
  nominating a reported match, a bye, a drop-decided match and a past round
  is rejected; un-nominating keeps the hold; `confirmMotw` writes the
  selection and deletes that match's hold while the other candidates keep
  theirs; confirming a settled past round is rejected; the non-staff gate.
- **Integration** `recordings/queries.integration.test.ts`: `holdsForWindow`
  reports the role; releasing a candidate removes candidacy with the hold.
- **Unit** `spoilers/embargo.test.ts`: one added case documenting that a
  candidate is `reason: "recording"`, and that a confirmed candidate without
  VOD is `reason: "motw"`.
- **Manual** (seeded season): as a guest the candidates show the REC pill
  and the previous week's MotW on the billboard; as staff nominate,
  promote, confirm, watch the billboard flip, then release the backups under
  Aufnahmen and see their results turn public and land in the results
  channel.

## Documentation

`docs/plans/match-of-the-week.md` (selection is now nomination plus
confirmation, billboard rule), `docs/plans/motw-result-embargo.md` (the rule
starts at confirmation), `docs/plans/recording-holds.md` (holds carry a MotW
role), `CLAUDE.md` (the MotW line), `design/MATCH-OF-THE-WEEK.md` (the new
panel and pager state).

## Decisions

- **A candidate is a recording.** Storing candidacy as a second kind of
  withheld state would double the embargo rule, every row type and every
  public branch for a fact that is already true: staff record all
  candidates. As a role on the hold it costs one column and no new public
  state.
- **The billboard carries the most recently confirmed MotW of the season,
  with no age limit.** The block is the front page's editorial moment and an
  empty one is worse than an old one; a forgotten confirmation is then
  visible as a stale billboard instead of as nothing, on top of the staff
  todo and the stale-holds card. The alternative, a cap at the previous
  Spieltag, is never stale but blanks the showcase whenever a week is
  skipped.
- **The MotW workspace never publishes a result.** "Kandidat entfernen"
  keeps the hold, so the only way a withheld result becomes public is the
  release under `/staff/aufnahmen` or, for the confirmed MotW, the VOD link.
  One publishing moment per surface, no accidental reveal from the picker.
- **Backups are unordered.** One Hauptkandidat is the plan staff communicate
  among themselves; ranking the fallbacks would be state nobody reads.
- **Nothing is posted on confirmation.** The VOD link stays the single
  publishing moment (announcement, then result). A "the MotW is A vs B" post
  would need its own lifecycle for no gain.
