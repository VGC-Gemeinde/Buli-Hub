import { z } from "zod";
import type {
  PublicDivision,
  PublicMatch,
} from "@/features/public-league/queries";
import type { Identity, MatchdayLite } from "@/features/season/dashboard";

// Pure domain logic for the Match of the Week (never translated): the staff
// todo derivation, YouTube-URL validation, and locating the featured match
// inside an already-built public overview.

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

// The staff dashboard's MotW todo. The current Spieltag without a pick is the
// urgent case and replaces the next-week warning; otherwise staff are nudged
// to pick next week's match ahead of time. Null outside a running round or
// once everything (incl. the season's last round) is picked. Selecting is
// never a blocker for anything else — the todo is purely informational.
export type MotwTodo = {
  round: number;
  urgency: "warning" | "urgent";
} | null;

export function motwTodo(input: {
  currentRound: number | null;
  totalRounds: number;
  selectedRounds: ReadonlySet<number>;
}): MotwTodo {
  if (input.currentRound === null) {
    return null;
  }
  if (!input.selectedRounds.has(input.currentRound)) {
    return { round: input.currentRound, urgency: "urgent" };
  }
  const next = input.currentRound + 1;
  if (next <= input.totalRounds && !input.selectedRounds.has(next)) {
    return { round: next, urgency: "warning" };
  }
  return null;
}

// Whether staff may still set (or clear) a round's Match of the Week.
//
// The running Spieltag and every later one are always open, so a week can be
// lined up as far ahead as the schedule goes. A past Spieltag is open only
// while it has **no** pick at all — a week that was missed can still be
// backfilled, typically because a VOD turned up for it afterwards.
//
// What a past round may never do is *change* an existing pick: that would flip
// spoiler protection back onto an already-public result and make Discord delete
// and repost that week's result and VOD messages. Once a finished week has a
// pick it is settled, and only its YouTube link stays editable
// (`saveMotwYoutubeUrl` gates on nothing), because uploads lag the week.
export function canSelectRound(input: {
  round: number;
  currentRound: number | null;
  totalRounds: number;
  pickedRounds: ReadonlySet<number>;
}): boolean {
  const { round, currentRound, totalRounds, pickedRounds } = input;
  if (round < 1 || round > totalRounds) {
    return false;
  }
  if (weekState(round, currentRound) !== "past") {
    return true;
  }
  return !pickedRounds.has(round);
}

// The same rule as a set, for the actions' gate and the view's week model.
export function selectableRounds(
  currentRound: number | null,
  totalRounds: number,
  pickedRounds: ReadonlySet<number> = new Set(),
): Set<number> {
  const rounds = new Set<number>();
  for (let round = 1; round <= totalRounds; round++) {
    if (canSelectRound({ round, currentRound, totalRounds, pickedRounds })) {
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
// work. The running week when it has no pick, else the first later week without
// one, else the running week itself. Outside a running season the season's last
// round — that is where the remaining work (VOD links) sits.
export function initialMotwRound(input: {
  totalRounds: number;
  currentRound: number | null;
  selectedRounds: ReadonlySet<number>;
}): number {
  const { currentRound, totalRounds, selectedRounds } = input;
  if (currentRound === null) {
    return Math.max(1, totalRounds);
  }
  if (!selectedRounds.has(currentRound)) {
    return currentRound;
  }
  for (let round = currentRound + 1; round <= totalRounds; round++) {
    if (!selectedRounds.has(round)) {
      return round;
    }
  }
  return currentRound;
}

// Everything the public prominent block renders. `match.playerB` is guaranteed
// non-null (a bye cannot be selected). The ranks are the players' current
// standings ("Platz {n}" sub-lines) — taken from the table that decides the
// division (the Gesamttabelle in division mode, the group table otherwise).
export type MotwBlockData = {
  match: PublicMatch;
  groupName: string;
  youtubeUrl: string | null;
  rankA: number | null;
  rankB: number | null;
};

// Locates the selected match inside the built overview divisions — the block
// reuses the overview's identities/result state instead of re-querying. Null
// when the match is not part of the overview (should not happen for a
// consistent selection) or is a bye.
export function findMotw(
  divisions: readonly PublicDivision[],
  selection: { matchId: string; youtubeUrl: string | null },
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
  rank: number | null;
  wins: number;
  losses: number;
  hasCaptureCard: boolean;
  // The player has saved their profile at least once. When false,
  // `hasCaptureCard` is an untouched default rather than an answer.
  profileEdited: boolean;
  dropped: boolean;
};

// One pickable match of a Spieltag. Byes and drop-decided matches never become
// candidates — neither can be featured.
export type MotwCandidate = {
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

// One Spieltag in the workspace: its candidates and its pick, if any.
// `selectedMatch` is null only for an inconsistent pick (the featured match is
// no longer a candidate, e.g. a participant dropped afterwards) — the view falls
// back to a bare link.
export type MotwWeek = {
  round: number;
  state: MotwWeekState;
  startsOn: string;
  endsOn: string;
  candidates: MotwCandidate[];
  selection: { matchId: string; youtubeUrl: string | null } | null;
  selectedMatch: MotwCandidate | null;
  // Mirrors `canSelectRound`: pick/replace/remove are offered, rather than just
  // the VOD field. A finished week that was never picked is still editable.
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

export function recordability(candidate: MotwCandidate): Recordability {
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

function combinedRank(candidate: MotwCandidate): number {
  const { rank: a } = candidate.playerA;
  const { rank: b } = candidate.playerB;
  return a === null || b === null ? UNRANKED : a + b;
}

// "division" keeps the incoming tier/position order; "rank" surfaces the
// highest-placed pairings first. Ties fall back to the incoming order, so the
// sort is stable and switching modes back and forth is lossless.
export function sortCandidates(
  candidates: readonly MotwCandidate[],
  mode: MotwSortMode,
): MotwCandidate[] {
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

// The workspace's whole season: one week per matchday, in round order, each
// with its candidates and resolved pick. Rounds without a matchday row cannot
// exist (the schedule defines them), so the matchdays are the spine.
export function buildMotwWeeks(input: {
  matchdays: readonly MatchdayLite[];
  currentRound: number | null;
  selections: readonly {
    round: number;
    matchId: string;
    youtubeUrl: string | null;
  }[];
  candidates: readonly MotwCandidate[];
}): MotwWeek[] {
  const byRound = new Map<number, MotwCandidate[]>();
  for (const candidate of input.candidates) {
    const list = byRound.get(candidate.round);
    if (list) {
      list.push(candidate);
    } else {
      byRound.set(candidate.round, [candidate]);
    }
  }

  const pickedRounds = new Set(input.selections.map((s) => s.round));
  const totalRounds = input.matchdays.length;

  return [...input.matchdays]
    .sort((a, b) => a.round - b.round)
    .map((matchday) => {
      const candidates = byRound.get(matchday.round) ?? [];
      const selection =
        input.selections.find((s) => s.round === matchday.round) ?? null;
      return {
        round: matchday.round,
        state: weekState(matchday.round, input.currentRound),
        startsOn: matchday.startsOn,
        endsOn: matchday.endsOn,
        candidates,
        selection,
        selectedMatch:
          candidates.find((c) => c.matchId === selection?.matchId) ?? null,
        editable: canSelectRound({
          round: matchday.round,
          currentRound: input.currentRound,
          totalRounds,
          pickedRounds,
        }),
      };
    });
}
