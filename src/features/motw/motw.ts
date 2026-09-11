import { z } from "zod";
import type {
  PublicDivision,
  PublicMatch,
} from "@/features/public-league/queries";
import { canHold } from "@/features/recordings/holds";
import type { Identity, MatchdayLite } from "@/features/season/dashboard";

// Pure domain logic for the Match of the Week (never translated): the staff
// todo derivation, YouTube-URL validation, the candidate model of a week
// (docs/plans/motw-candidates.md) and locating the featured match inside an
// already-built public overview.

// A valid https YouTube link (watch page, short link, or live URL).
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
]);

export function isYoutubeUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === "https:" && YOUTUBE_HOSTS.has(url.hostname);
}

export const youtubeUrlSchema = z
  .string()
  .trim()
  .refine(isYoutubeUrl, "Bitte einen https-YouTube-Link angeben");

// The staff dashboard's MotW todo, in priority order:
//
// 1. a Spieltag that is over, has candidates and was never confirmed — until
//    somebody confirms, the billboard keeps advertising an older week, so
//    this is the urgent one;
// 2. the running Spieltag without a single candidate (nothing is being held
//    for the stream), also urgent;
// 3. the next Spieltag without a candidate, as a warning.
//
// Null when none applies. The todo is purely informational — it never blocks
// anything.
export type MotwTodo = {
  round: number;
  kind: "confirm" | "nominate";
  urgency: "warning" | "urgent";
} | null;

export function motwTodo(input: {
  currentRound: number | null;
  totalRounds: number;
  // Rounds with a confirmed Match of the Week.
  confirmedRounds: ReadonlySet<number>;
  // Rounds with at least one nominated candidate.
  candidateRounds: ReadonlySet<number>;
}): MotwTodo {
  const { currentRound, totalRounds, confirmedRounds, candidateRounds } = input;

  // The latest finished week whose candidates were never confirmed. Without a
  // running round every round counts as finished (`weekState`).
  let unconfirmed: number | null = null;
  for (const round of candidateRounds) {
    if (
      weekState(round, currentRound) === "past" &&
      !confirmedRounds.has(round) &&
      (unconfirmed === null || round > unconfirmed)
    ) {
      unconfirmed = round;
    }
  }
  if (unconfirmed !== null) {
    return { round: unconfirmed, kind: "confirm", urgency: "urgent" };
  }

  if (currentRound === null) {
    return null;
  }
  const open = (round: number) =>
    !candidateRounds.has(round) && !confirmedRounds.has(round);
  if (open(currentRound)) {
    return { round: currentRound, kind: "nominate", urgency: "urgent" };
  }
  const next = currentRound + 1;
  if (next <= totalRounds && open(next)) {
    return { round: next, kind: "nominate", urgency: "warning" };
  }
  return null;
}

// Whether staff may still confirm (or revoke) a round's Match of the Week.
//
// The running Spieltag and every later one are always open. A past Spieltag is
// open only while it has **no** confirmation at all — a week that was missed
// can still be backfilled, and confirming after the Spieltag is the normal
// case anyway, since the point of the candidates is to decide once the week
// has been played.
//
// What a past round may never do is *change* an existing confirmation: that
// would flip spoiler protection back onto an already-public result and make
// Discord delete and repost that week's result and VOD messages. Once a
// finished week is confirmed it is settled, and only its YouTube link stays
// editable (`saveMotwYoutubeUrl` gates on nothing), because uploads lag the
// week.
export function canSelectRound(input: {
  round: number;
  currentRound: number | null;
  totalRounds: number;
  confirmedRounds: ReadonlySet<number>;
}): boolean {
  const { round, currentRound, totalRounds, confirmedRounds } = input;
  if (round < 1 || round > totalRounds) {
    return false;
  }
  if (weekState(round, currentRound) !== "past") {
    return true;
  }
  return !confirmedRounds.has(round);
}

// The same rule as a set, for the actions' gate and the view's week model.
export function selectableRounds(
  currentRound: number | null,
  totalRounds: number,
  confirmedRounds: ReadonlySet<number> = new Set(),
): Set<number> {
  const rounds = new Set<number>();
  for (let round = 1; round <= totalRounds; round++) {
    if (canSelectRound({ round, currentRound, totalRounds, confirmedRounds })) {
      rounds.add(round);
    }
  }
  return rounds;
}

// Where a round sits relative to the running Spieltag. Without a running season
// nothing is editable, so every round counts as past.
export type MotwWeekState = "past" | "current" | "future";

export function weekState(
  round: number,
  currentRound: number | null,
): MotwWeekState {
  if (currentRound === null || round < currentRound) {
    return "past";
  }
  return round === currentRound ? "current" : "future";
}

// The Spieltag the staff workspace opens on: the round that most likely needs
// work. A finished week whose candidates were never confirmed comes first —
// that is the week holding the billboard back. Then the running week, unless
// it is already confirmed (nominating and confirming both happen there), then
// the first later week that has nothing yet. Outside a running season the
// season's last round, where the remaining work (VOD links) sits.
export function initialMotwRound(input: {
  totalRounds: number;
  currentRound: number | null;
  confirmedRounds: ReadonlySet<number>;
  candidateRounds: ReadonlySet<number>;
}): number {
  const { currentRound, totalRounds, confirmedRounds, candidateRounds } = input;
  const undecided = motwTodo({
    currentRound,
    totalRounds,
    confirmedRounds,
    candidateRounds,
  });
  if (undecided?.kind === "confirm") {
    return undecided.round;
  }
  if (currentRound === null) {
    return Math.max(1, totalRounds);
  }
  if (!confirmedRounds.has(currentRound)) {
    return currentRound;
  }
  for (let round = currentRound + 1; round <= totalRounds; round++) {
    if (!candidateRounds.has(round) && !confirmedRounds.has(round)) {
      return round;
    }
  }
  return currentRound;
}

// Everything the public prominent block renders. `match.playerB` is guaranteed
// non-null (a bye cannot be confirmed). The ranks are the players' current
// standings ("Platz {n}" sub-lines) — taken from the table that decides the
// division (the Gesamttabelle in division mode, the group table otherwise).
export type MotwBlockData = {
  match: PublicMatch;
  groupName: string;
  youtubeUrl: string | null;
  rankA: number | null;
  rankB: number | null;
  // The featured match belongs to the running Spieltag. False while the block
  // carries the previous week, which it does until the new week is confirmed
  // — the state line must not claim "Läuft diese Woche" for a week that is
  // over.
  isCurrentRound: boolean;
};

// What the public billboard features: the most recently confirmed Match of
// the Week whose Spieltag is not still in the future. So the block carries
// last week's match while the new week runs and nothing is confirmed yet, and
// it switches the moment staff confirm (docs/plans/motw-candidates.md).
//
// There is deliberately no age limit: the block is the front page's editorial
// moment and an empty one is worse than an old one. A forgotten confirmation
// shows up as a stale billboard, on top of the staff todo and the stale-holds
// card. Once the season is over (`currentRound` null) the last confirmation of
// the season stays up.
export function billboardSelection<T extends { round: number }>(
  selections: readonly T[],
  currentRound: number | null,
): T | null {
  let featured: T | null = null;
  for (const selection of selections) {
    if (currentRound !== null && selection.round > currentRound) {
      continue;
    }
    if (featured === null || selection.round > featured.round) {
      featured = selection;
    }
  }
  return featured;
}

// Locates the selected match inside the built overview divisions — the block
// reuses the overview's identities/result state instead of re-querying. Null
// when the match is not part of the overview (should not happen for a
// consistent selection) or is a bye.
export function findMotw(
  divisions: readonly PublicDivision[],
  selection: { round: number; matchId: string; youtubeUrl: string | null },
  currentRound: number | null,
): MotwBlockData | null {
  for (const division of divisions) {
    for (const group of division.groups) {
      const match = group.matches.find((m) => m.matchId === selection.matchId);
      if (!match) {
        continue;
      }
      if (match.playerB === null) {
        return null;
      }
      const table =
        division.mode === "division" && division.divisionStandings
          ? division.divisionStandings
          : group.standings;
      const rankOf = (userId: string) =>
        table.find((row) => row.userId === userId)?.rank ?? null;
      return {
        match,
        groupName: group.name,
        youtubeUrl: selection.youtubeUrl,
        rankA: rankOf(match.playerA.userId),
        rankB: rankOf(match.playerB.userId),
        isCurrentRound: selection.round === currentRound,
      };
    }
  }
  return null;
}

// --- Staff workspace ------------------------------------------------------

// A player as the picker shows them: identity plus the form staff judge a
// matchup by. `rank` is the placement in the table that decides their division
// (the Gesamttabelle in division mode, the group table otherwise) — the same
// table `findMotw` reads for the billboard's "Platz {n}". Null when the player
// has no table yet.
export type MotwPlayer = Identity & {
  // The picture the stream would use, so staff see who still owes one
  // (docs/plans/stream-photos.md). Unrelated to `avatarUrl`, which is the
  // Discord avatar the hub itself shows.
  streamPhotoUrl: string | null;
  rank: number | null;
  wins: number;
  losses: number;
  hasCaptureCard: boolean;
  // The player has saved their profile at least once. When false,
  // `hasCaptureCard` is an untouched default rather than an answer.
  profileEdited: boolean;
  dropped: boolean;
};

// One pickable match of a Spieltag, as the picker lists it. Byes and
// drop-decided matches never become options — neither can be featured.
export type MotwOption = {
  matchId: string;
  round: number;
  // Division tier for the picker's filter; `groupName` is the sub-division
  // ("Division 1a") the row itself shows.
  tier: number;
  groupName: string;
  playerA: MotwPlayer;
  playerB: MotwPlayer;
  // Already reported. Staff see everything, and a week can be picked while it
  // runs, so the picker marks which matchups are already played.
  reported: boolean;
};

// Where a nominated match stands in the race for the week: the Hauptkandidat
// staff plan to feature, or one of the backups they record in case it falls
// through. Backups are deliberately unordered — one plan is what staff
// communicate, ranking the fallbacks would be state nobody reads.
export type MotwRole = "primary" | "backup";

// A nominated match: the pairing plus its role. Nominating a match holds it
// back like any recording (docs/plans/motw-candidates.md), which is what it
// is — staff record every candidate and confirm afterwards which one became
// the Match of the Week.
export type MotwCandidate = {
  option: MotwOption;
  role: MotwRole;
};

// One Spieltag in the workspace: everything pickable, what is nominated, and
// the confirmation, if any. `selectedMatch` is null only for an inconsistent
// confirmation (the featured match is no longer an option, e.g. a participant
// dropped afterwards) — the view falls back to a bare link.
export type MotwWeek = {
  round: number;
  state: MotwWeekState;
  startsOn: string;
  endsOn: string;
  options: MotwOption[];
  // Nominated matches, Hauptkandidat first, backups in nomination order.
  candidates: MotwCandidate[];
  selection: { matchId: string; youtubeUrl: string | null } | null;
  selectedMatch: MotwOption | null;
  // Mirrors `canSelectRound`: confirm/replace/revoke are offered, rather than
  // just the VOD field. A finished week that was never confirmed stays
  // editable, so a missed week can be backfilled.
  editable: boolean;
};

// Whether the match can produce a VOD at all — the one hard disqualifier for a
// feature that exists to produce one.
//
// "unknown" is its own answer and not a soft "no": a player who never saved
// their profile has `hasCaptureCard: false` by default, which says nothing
// about whether they own one. Staff need to see the difference so they can ask
// rather than skip the matchup.
export type Recordability = "yes" | "no" | "unknown";

export function recordability(candidate: MotwOption): Recordability {
  const players = [candidate.playerA, candidate.playerB];
  if (players.some((player) => player.hasCaptureCard)) {
    return "yes";
  }
  return players.some((player) => !player.profileEdited) ? "unknown" : "no";
}

// --- Division filter ------------------------------------------------------

// The picker filters by division, and the divisions combine rather than
// replacing each other — the MotW is picked across the league, so "Division 1
// and 2" is the normal view, not an edge case.

// What the picker starts on: the top two divisions that exist. They are where
// the featured match almost always comes from, so opening on them saves the
// common case a click; the lower ones are one chip away.
export const DEFAULT_FILTER_TIERS = 2;

export function defaultDivisionFilter(tiers: readonly number[]): Set<number> {
  return new Set(tiers.filter((tier) => tier <= DEFAULT_FILTER_TIERS));
}

// "Alle" is a toggle, not a filter of its own: it selects every division unless
// every one is already selected, in which case it clears the selection.
export function toggleAllDivisions(
  selected: ReadonlySet<number>,
  all: readonly number[],
): Set<number> {
  const complete = all.length > 0 && all.every((tier) => selected.has(tier));
  return complete ? new Set() : new Set(all);
}

export type MotwSortMode = "division" | "rank";

// Both placements added up — the smaller, the higher-stakes the matchup. A
// player without a placement makes the pair unrankable; those sort last rather
// than pretending to a number.
const UNRANKED = Number.MAX_SAFE_INTEGER;

function combinedRank(candidate: MotwOption): number {
  const { rank: a } = candidate.playerA;
  const { rank: b } = candidate.playerB;
  return a === null || b === null ? UNRANKED : a + b;
}

// "division" keeps the incoming tier/position order; "rank" surfaces the
// highest-placed pairings first. Ties fall back to the incoming order, so the
// sort is stable and switching modes back and forth is lossless.
export function sortOptions(
  candidates: readonly MotwOption[],
  mode: MotwSortMode,
): MotwOption[] {
  if (mode === "division") {
    return [...candidates];
  }
  return candidates
    .map((candidate, index) => ({ candidate, index }))
    .sort(
      (a, b) =>
        combinedRank(a.candidate) - combinedRank(b.candidate) ||
        a.index - b.index,
    )
    .map((entry) => entry.candidate);
}

// A nomination as it is stored: the hold of the match, carrying its role.
export type NominatedHold = {
  matchId: string;
  round: number;
  motwRole: MotwRole | null;
};

// Whether a match may be nominated. A candidate is a recording, so the rule is
// the recording rule (`canHold`): only an unreported match of the running or a
// later Spieltag. Byes and drop-decided matches never become options in the
// first place. A match that is out of reach can still be confirmed directly —
// that is the backfill path, with the consequences a late confirmation has
// always had.
export function canNominate(
  option: MotwOption,
  currentRound: number | null,
): boolean {
  return canHold({
    reported: option.reported,
    isBye: false,
    decidedByDrop: false,
    round: option.round,
    currentRound,
  });
}

// One week's nominated matches: Hauptkandidat first, then the backups in the
// order they were nominated (the holds arrive in that order). A nomination
// whose match is no longer an option — a participant dropped after it was
// nominated — is skipped here; the hold itself stays visible in the recordings
// workspace, which is where it is released.
export function weekCandidates(
  options: readonly MotwOption[],
  holds: readonly NominatedHold[],
  round: number,
): MotwCandidate[] {
  const byMatch = new Map(options.map((option) => [option.matchId, option]));
  const candidates: MotwCandidate[] = [];
  for (const hold of holds) {
    if (hold.round !== round || hold.motwRole === null) {
      continue;
    }
    const option = byMatch.get(hold.matchId);
    if (option) {
      candidates.push({ option, role: hold.motwRole });
    }
  }
  return candidates.sort(
    (a, b) => Number(b.role === "primary") - Number(a.role === "primary"),
  );
}

// The workspace's whole season: one week per matchday, in round order, each
// with its options, its nominated candidates and its confirmation. Rounds
// without a matchday row cannot exist (the schedule defines them), so the
// matchdays are the spine.
export function buildMotwWeeks(input: {
  matchdays: readonly MatchdayLite[];
  currentRound: number | null;
  selections: readonly {
    round: number;
    matchId: string;
    youtubeUrl: string | null;
  }[];
  options: readonly MotwOption[];
  holds: readonly NominatedHold[];
}): MotwWeek[] {
  const byRound = new Map<number, MotwOption[]>();
  for (const option of input.options) {
    const list = byRound.get(option.round);
    if (list) {
      list.push(option);
    } else {
      byRound.set(option.round, [option]);
    }
  }

  const confirmedRounds = new Set(input.selections.map((s) => s.round));
  const totalRounds = input.matchdays.length;

  return [...input.matchdays]
    .sort((a, b) => a.round - b.round)
    .map((matchday) => {
      const options = byRound.get(matchday.round) ?? [];
      const selection =
        input.selections.find((s) => s.round === matchday.round) ?? null;
      return {
        round: matchday.round,
        state: weekState(matchday.round, input.currentRound),
        startsOn: matchday.startsOn,
        endsOn: matchday.endsOn,
        options,
        candidates: weekCandidates(options, input.holds, matchday.round),
        selection,
        selectedMatch:
          options.find((o) => o.matchId === selection?.matchId) ?? null,
        editable: canSelectRound({
          round: matchday.round,
          currentRound: input.currentRound,
          totalRounds,
          confirmedRounds,
        }),
      };
    });
}
