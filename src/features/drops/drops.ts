// Pure counting override for player drops (docs/plans/player-drops.md).
// Stored results are history and never change; every projection that counts
// or displays results maps matches through `effectiveResult` first, so a
// dropped player's matches count as 2:0 free wins for the opponents — played
// or not — and un-dropping restores everything by simply not overriding.

export type MatchOutcome = "normal" | "free_win" | "double_loss";

export type EffectiveResultInput = {
  playerAId: string;
  playerBId: string | null; // null = bye
  outcome: MatchOutcome | null; // null = unreported
  winnerId: string | null;
  confirmedAt: Date | null;
  games: readonly { winnerId: string }[];
};

// Synthetic confirmation stamp for drop free wins. Projections only check
// non-null; the value itself is never displayed.
export const DROP_CONFIRMED_AT = new Date(0);

// Whether a match is decided by a drop (and therefore not playable,
// reportable, featurable, or postable).
export function decidedByDrop(
  match: { playerAId: string; playerBId: string | null },
  droppedIds: ReadonlySet<string>,
): boolean {
  return (
    match.playerBId !== null &&
    (droppedIds.has(match.playerAId) || droppedIds.has(match.playerBId))
  );
}

// The counting override. One dropped participant → confirmed 2:0 free win
// for the opponent (standings default free wins to 2:0); both dropped →
// double loss. Byes and matches without dropped participants pass through
// unchanged, as does everything when nobody is dropped.
// Generic in the caller's row type: the override rewrites the result fields
// and carries everything else through, so a row that also knows its match id
// (`ResultForStandings`) keeps it.
export function effectiveResult<T extends EffectiveResultInput>(
  input: T,
  droppedIds: ReadonlySet<string>,
): T {
  if (input.playerBId === null || !decidedByDrop(input, droppedIds)) {
    return input;
  }
  const aDropped = droppedIds.has(input.playerAId);
  const bDropped = droppedIds.has(input.playerBId);
  if (aDropped && bDropped) {
    return {
      ...input,
      outcome: "double_loss",
      winnerId: null,
      confirmedAt: DROP_CONFIRMED_AT,
      games: [],
    };
  }
  return {
    ...input,
    outcome: "free_win",
    winnerId: aDropped ? input.playerBId : input.playerAId,
    confirmedAt: DROP_CONFIRMED_AT,
    games: [],
  };
}

// Flags dropped players in assembled standings rows (the "Drop" table tag).
export function markDropped<T extends { userId: string }>(
  rows: readonly T[],
  droppedIds: ReadonlySet<string>,
): (T & { dropped: boolean })[] {
  return rows.map((row) => ({
    ...row,
    dropped: droppedIds.has(row.userId),
  }));
}

// The match-page banner copy for a drop-decided match.
export function dropBannerText(input: {
  playerAName: string;
  playerBName: string;
  aDropped: boolean;
  bDropped: boolean;
}): string {
  if (input.aDropped && input.bDropped) {
    return `${input.playerAName} und ${input.playerBName} wurden gedroppt. Das Match zählt als Doppelniederlage.`;
  }
  const dropped = input.aDropped ? input.playerAName : input.playerBName;
  const opponent = input.aDropped ? input.playerBName : input.playerAName;
  return `${dropped} wurde gedroppt. Das Match zählt als Freewin (2:0) für ${opponent}.`;
}
