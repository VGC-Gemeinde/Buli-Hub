import type { MotwRole } from "@/features/motw/motw";
import type { Identity, MatchdayLite } from "@/features/season/dashboard";

// A player as the recording workspace shows them: identity plus the picture
// the stream would use (docs/plans/stream-photos.md), so staff can see at a
// glance who still owes one.
export type RecordingPlayer = Identity & { streamPhotoUrl: string | null };

// Pure domain logic for recording holds (docs/plans/recording-holds.md): which
// matches staff may hold, which holds have outlived their Spieltag, and how
// the dashboard card sums those up.

// A hold as the staff views and the dashboard reason about it.
export type Hold = {
  matchId: string;
  round: number;
  // A public result exists (a pending free win counts as not reported, the
  // row is still "offen" for everyone).
  reported: boolean;
};

// Holds whose Spieltag is over: the round lies before the current one, or
// there is no current round at all (season finished), in which case every
// hold is stale. Stale holds are what the dashboard warns about.
export function staleHolds<T extends { round: number }>(
  holds: readonly T[],
  currentRound: number | null,
): T[] {
  return holds.filter(
    (hold) => currentRound === null || hold.round < currentRound,
  );
}

// Whether a match may be held. Only a match whose result is not yet public:
// a hold on a reported match would retract a result the hub already shows and
// delete its Discord post. Byes and drop-decided matches have nothing to
// record; past Spieltage are out because a hold there would be stale the
// moment it is set.
export function canHold(input: {
  reported: boolean;
  isBye: boolean;
  decidedByDrop: boolean;
  round: number;
  currentRound: number | null;
}): boolean {
  if (input.reported || input.isBye || input.decidedByDrop) {
    return false;
  }
  return input.currentRound !== null && input.round >= input.currentRound;
}

// The dashboard card's substance: how many stale holds there are and whether
// every one of them already has a result (the card's sub-line differs). Null
// when there is nothing to warn about.
export function staleHoldsSummary(
  stale: readonly { reported: boolean }[],
): { count: number; allReported: boolean } | null {
  if (stale.length === 0) {
    return null;
  }
  return {
    count: stale.length,
    allReported: stale.every((hold) => hold.reported),
  };
}

// --- Staff workspace ------------------------------------------------------

// One match as the workspace shows it: the pairing, where it stands, and
// whether it is held. `reported` is any stored result (a pending free win
// included: staff confirm those, and a hold on one would hold a result).
export type RecordingMatch = {
  matchId: string;
  round: number;
  tier: number;
  groupName: string;
  playerA: RecordingPlayer;
  playerB: RecordingPlayer;
  reported: boolean;
  // A free win awaiting staff confirmation (the "Freewin offen" chip).
  pendingFreeWin: boolean;
  decidedByDrop: boolean;
  held: boolean;
  // Set when the hold is also a Match-of-the-Week candidate
  // (docs/plans/motw-candidates.md), so a release here is visibly a decision
  // about the MotW too.
  motwRole: MotwRole | null;
  endsOn: string | null;
};

// A hold in the "Zurückgehalten" list: the match plus whether its Spieltag
// is over. Stale holds sort first, then by round.
export type HeldMatch = RecordingMatch & { stale: boolean };

// One markable Spieltag: the current one or a later one. Past Spieltage do
// not appear, they cannot be marked (`canHold`).
export type RecordingWeek = {
  round: number;
  state: "current" | "future";
  startsOn: string;
  endsOn: string;
  matches: RecordingMatch[];
};

export function buildHeldMatches(
  matches: readonly RecordingMatch[],
  currentRound: number | null,
): HeldMatch[] {
  const staleIds = new Set(
    staleHolds(
      matches.filter((m) => m.held),
      currentRound,
    ).map((m) => m.matchId),
  );
  return matches
    .filter((m) => m.held)
    .map((m) => ({ ...m, stale: staleIds.has(m.matchId) }))
    .sort(
      (a, b) =>
        Number(b.stale) - Number(a.stale) ||
        a.round - b.round ||
        a.tier - b.tier ||
        a.groupName.localeCompare(b.groupName),
    );
}

export function buildRecordingWeeks(input: {
  matchdays: readonly MatchdayLite[];
  currentRound: number | null;
  matches: readonly RecordingMatch[];
}): RecordingWeek[] {
  const { currentRound } = input;
  if (currentRound === null) {
    return [];
  }
  return [...input.matchdays]
    .filter((day) => day.round >= currentRound)
    .sort((a, b) => a.round - b.round)
    .map((day) => ({
      round: day.round,
      state: day.round === currentRound ? "current" : "future",
      startsOn: day.startsOn,
      endsOn: day.endsOn,
      matches: input.matches.filter((m) => m.round === day.round),
    }));
}
