// The result embargo: a reported result the hub deliberately keeps from the
// public for a while. Two reasons exist, and one rule covers both:
//
// - "motw": the Match of the Week before its VOD is attached
//   (docs/plans/motw-result-embargo.md);
// - "recording": a match staff record for the stream, until they release it
//   (docs/plans/recording-holds.md).
//
// `access` says what this viewer gets. "withheld": the result never reaches
// the client (no score, no winner, no games, no sheets); "preview": staff and
// the two participants see it, marked as not public. Null: no embargo. The
// MotW wins on overlap: its rule is the stricter one (it ends with the VOD,
// not with a click) and its copy and permanent pill are the established ones.

export type EmbargoReason = "motw" | "recording";
export type EmbargoAccess = "withheld" | "preview";
export type ResultEmbargo = {
  reason: EmbargoReason;
  access: EmbargoAccess;
} | null;

export function resultEmbargo(input: {
  // The match's MotW selection, null when it is not the featured match.
  motw: { youtubeUrl: string | null } | null;
  // A recording hold exists for the match.
  held: boolean;
  isStaff: boolean;
  isParticipant: boolean;
}): ResultEmbargo {
  const reason: EmbargoReason | null =
    input.motw !== null && input.motw.youtubeUrl === null
      ? "motw"
      : input.held
        ? "recording"
        : null;
  if (reason === null) {
    return null;
  }
  return {
    reason,
    access: input.isStaff || input.isParticipant ? "preview" : "withheld",
  };
}

// A withheld row keeps `reported` (the match was played, the row is not
// "offen") but loses everything that says who won.
export function withholdScore<
  T extends {
    scoreA: number | null;
    scoreB: number | null;
    winnerId: string | null;
  },
>(row: T): T {
  return { ...row, scoreA: null, scoreB: null, winnerId: null };
}

// --- Aggregates ------------------------------------------------------------

// The matches whose result the public may not see right now
// (docs/plans/standings-embargo.md). A match row can be shown to some viewers
// and hidden from others, because it is about that one match; a table is an
// aggregate about everyone and cannot hide a row without broadcasting it
// through everyone's wins and losses. So the table drops these from its input
// instead, for every viewer alike.
//
// The rule is `resultEmbargo` evaluated for a neutral viewer, so rows and
// tables can never drift apart on what counts as withheld.
export function publicEmbargoedIds(input: {
  motw: readonly { matchId: string; youtubeUrl: string | null }[];
  holds: readonly { matchId: string }[];
}): Set<string> {
  const ids = new Set<string>();
  for (const selection of input.motw) {
    const embargo = resultEmbargo({
      motw: selection,
      held: false,
      isStaff: false,
      isParticipant: false,
    });
    if (embargo) {
      ids.add(selection.matchId);
    }
  }
  for (const hold of input.holds) {
    ids.add(hold.matchId);
  }
  return ids;
}

// Drops the embargoed results from a standings input. A withheld match is
// absent, not present without a winner: a played match nobody won would
// distort both records and still say the match is decided.
export function withoutEmbargoed<T extends { matchId: string }>(
  results: readonly T[],
  embargoed: ReadonlySet<string>,
): T[] {
  return results.filter((result) => !embargoed.has(result.matchId));
}
