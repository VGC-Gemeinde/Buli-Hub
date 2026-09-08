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
