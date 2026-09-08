import { scoreFor } from "@/features/reporting/match-state";
import type { MatchResultLite } from "@/features/reporting/queries";
import type { Identity, PlayerMatch } from "@/features/season/dashboard";
import { type ResultEmbargo, resultEmbargo } from "@/features/spoilers/embargo";

// Pure assembly of the profile page's Spielplan: the player's matches merged
// with (drop-aware, effective) results, MotW flags, and the *viewer's*
// involvement — own results are never spoilers. Scores are given from the
// profile owner's perspective. A result under embargo (MotW without VOD, a
// recording hold) is withheld from viewers who are neither staff nor a
// participant.

export type ProfileScheduleRow = {
  matchId: string;
  round: number;
  startsOn: string;
  endsOn: string;
  opponent: Identity | null; // null = bye ("spielfrei")
  reported: boolean; // a public result exists (pending free wins stay "offen")
  scoreSelf: number | null;
  scoreOpponent: number | null;
  // The viewer participates in this match (owner viewing their own profile,
  // or the opponent viewing) — exempt from spoiler covering.
  isMine: boolean;
  isMotw: boolean;
  embargo: ResultEmbargo;
};

export function profileScheduleRows(input: {
  playerId: string;
  viewerId: string | null;
  viewerIsStaff: boolean;
  matches: readonly PlayerMatch[];
  resultByMatchId: ReadonlyMap<string, MatchResultLite>;
  motwSelections: readonly { matchId: string; youtubeUrl: string | null }[];
  heldMatchIds: ReadonlySet<string>;
}): ProfileScheduleRow[] {
  const motwByMatchId = new Map(
    input.motwSelections.map((s) => [s.matchId, s] as const),
  );
  return input.matches.map((match) => {
    const result = input.resultByMatchId.get(match.matchId) ?? null;
    // A pending (unconfirmed) free win is not public — the row stays "offen".
    const pending =
      result?.outcome === "free_win" && result.confirmedAt === null;
    const reported = result !== null && !pending;
    const score = reported && result ? scoreFor(input.playerId, result) : null;
    const isMine =
      input.viewerId !== null &&
      (input.viewerId === input.playerId ||
        input.viewerId === match.opponent?.userId);
    const motw = motwByMatchId.get(match.matchId) ?? null;
    const embargo = resultEmbargo({
      motw,
      held: input.heldMatchIds.has(match.matchId),
      isStaff: input.viewerIsStaff,
      isParticipant: isMine,
    });
    const row: ProfileScheduleRow = {
      matchId: match.matchId,
      round: match.round,
      startsOn: match.startsOn,
      endsOn: match.endsOn,
      opponent: match.opponent,
      reported,
      scoreSelf: score?.self ?? null,
      scoreOpponent: score?.opponent ?? null,
      isMine,
      isMotw: motw !== null,
      embargo,
    };
    if (embargo?.access !== "withheld") {
      return row;
    }
    // The profile row keeps scores from the owner's perspective, so the
    // shared helper's A/B names do not apply here.
    return { ...row, scoreSelf: null, scoreOpponent: null };
  });
}
