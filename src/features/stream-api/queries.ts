import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  divisions,
  matches,
  matchGames,
  matchResults,
  motwSelections,
  profiles,
  recordingHolds,
  subDivisions,
  teamSheets,
} from "@/db/schema";
import { windowPlayerForm } from "@/features/motw/queries";
import { db } from "@/lib/db";
import {
  type MatchInput,
  NO_RECORD,
  type StreamMatch,
  type StreamMatchDetail,
  type StreamRecord,
  toStreamMatch,
  toStreamMatchDetail,
} from "./to-stream-match";

// Read side of the stream API: the played matches of a season with everything
// the mapping needs. Two or three queries per call (matches, games, sheets)
// instead of one per match; a season has a few hundred matches at most.

async function matchInputs(
  windowId: string,
  matchId?: string,
): Promise<MatchInput[]> {
  const pa = alias(profiles, "pa");
  const pb = alias(profiles, "pb");
  const rows = await db
    .select({
      id: matches.id,
      round: matches.round,
      tier: divisions.tier,
      position: subDivisions.position,
      playerAId: matches.playerAId,
      playerBId: matches.playerBId,
      // Flat, not nested: drizzle nullifies a nested object from a left
      // join by its own heuristic, which drops a profile with only a
      // username set.
      aName: pa.displayName,
      aUser: pa.username,
      aPhoto: pa.streamPhotoPath,
      bName: pb.displayName,
      bUser: pb.username,
      bPhoto: pb.streamPhotoPath,
      platform: matchResults.platform,
      reportedAt: matchResults.reportedAt,
      motwId: motwSelections.id,
      heldId: recordingHolds.matchId,
    })
    .from(matches)
    .innerJoin(subDivisions, eq(subDivisions.id, matches.subDivisionId))
    .innerJoin(divisions, eq(divisions.id, subDivisions.divisionId))
    .innerJoin(matchResults, eq(matchResults.matchId, matches.id))
    .leftJoin(pa, eq(pa.userId, matches.playerAId))
    .leftJoin(pb, eq(pb.userId, matches.playerBId))
    .leftJoin(motwSelections, eq(motwSelections.matchId, matches.id))
    .leftJoin(recordingHolds, eq(recordingHolds.matchId, matches.id))
    .where(
      and(
        eq(divisions.windowId, windowId),
        eq(matchResults.outcome, "normal"),
        isNotNull(matches.playerBId),
        matchId ? eq(matches.id, matchId) : undefined,
      ),
    )
    .orderBy(
      asc(matches.round),
      asc(divisions.tier),
      asc(subDivisions.position),
      asc(matches.createdAt),
    );
  if (rows.length === 0) {
    return [];
  }

  const ids = rows.map((row) => row.id);
  const [games, sheets] = await Promise.all([
    db
      .select({
        matchId: matchGames.matchId,
        gameNumber: matchGames.gameNumber,
        winnerId: matchGames.winnerId,
      })
      .from(matchGames)
      .where(inArray(matchGames.matchId, ids)),
    db
      .select({
        matchId: teamSheets.matchId,
        playerId: teamSheets.playerId,
        ots: teamSheets.ots,
      })
      .from(teamSheets)
      .where(inArray(teamSheets.matchId, ids)),
  ]);

  return rows.flatMap((row) => {
    if (row.playerBId === null) {
      return [];
    }
    return [
      {
        id: row.id,
        round: row.round,
        tier: row.tier,
        position: row.position,
        playerAId: row.playerAId,
        playerBId: row.playerBId,
        playerA: {
          displayName: row.aName,
          username: row.aUser,
          streamPhotoPath: row.aPhoto,
        },
        playerB: {
          displayName: row.bName,
          username: row.bUser,
          streamPhotoPath: row.bPhoto,
        },
        platform: row.platform,
        reportedAt: row.reportedAt,
        motw: row.motwId !== null,
        recording: row.heldId !== null,
        games: games
          .filter((g) => g.matchId === row.id)
          .map(({ gameNumber, winnerId }) => ({ gameNumber, winnerId })),
        sheets: sheets
          .filter((s) => s.matchId === row.id)
          .map(({ playerId, ots }) => ({ playerId, ots })),
      },
    ];
  });
}

/** Every played best-of-3 of the season with both team sheets, in schedule order. */
export async function listStreamMatches(
  windowId: string,
): Promise<StreamMatch[]> {
  const inputs = await matchInputs(windowId);
  return inputs.flatMap((input) => toStreamMatch(input) ?? []);
}

/**
 * One played match of the season with sheets, photos and both players' season
 * record; null otherwise. The record is the same tally the standings table
 * shows (`windowPlayerForm`), so the stream and the hub never disagree. It
 * counts every decided match of the season, including ones held for a
 * recording: the stream API carries no embargo, and the hold is flagged as
 * `recording` for the caller to act on.
 */
export async function getStreamMatch(
  windowId: string,
  matchId: string,
): Promise<StreamMatchDetail | null> {
  const [inputs, form] = await Promise.all([
    matchInputs(windowId, matchId),
    windowPlayerForm(windowId),
  ]);
  const [input] = inputs;
  if (!input) {
    return null;
  }
  // A player without a standings row has not been placed in this season.
  const recordOf = (userId: string): StreamRecord => {
    const row = form.get(userId);
    return row ? { wins: row.wins, losses: row.losses } : NO_RECORD;
  };
  return toStreamMatchDetail(input, {
    a: recordOf(input.playerAId),
    b: recordOf(input.playerBId),
  });
}
