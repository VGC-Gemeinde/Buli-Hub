import { and, eq, inArray, isNotNull, or } from "drizzle-orm";
import {
  divisions,
  matches,
  motwSelections,
  profiles,
  recordingHolds,
  subDivisions,
} from "@/db/schema";
import { db } from "@/lib/db";

// Reads and writes for the stream photo. The picture itself lives in
// Supabase Storage; the row only carries its object path.

export async function streamPhotoPathOf(
  userId: string,
): Promise<string | null> {
  const row = await db.query.profiles.findFirst({
    columns: { streamPhotoPath: true },
    where: eq(profiles.userId, userId),
  });
  return row?.streamPhotoPath ?? null;
}

// The photo paths of several players at once, for the staff lists. Only
// players who have one appear in the map.
export async function streamPhotoPathsFor(
  userIds: readonly string[],
): Promise<Map<string, string>> {
  if (userIds.length === 0) {
    return new Map();
  }
  const rows = await db
    .select({ userId: profiles.userId, path: profiles.streamPhotoPath })
    .from(profiles)
    .where(
      and(
        inArray(profiles.userId, [...userIds]),
        isNotNull(profiles.streamPhotoPath),
      ),
    );
  return new Map(
    rows.flatMap((row) => (row.path ? [[row.userId, row.path] as const] : [])),
  );
}

// Whether the player is one of the people the stream is about to show: a
// participant of the Match of the Week, or of a match marked for a
// recording. Decides whether /profil offers the upload at all.
export async function streamRelevanceOf(
  userId: string,
  windowId: string,
): Promise<{ isMotwPlayer: boolean; isRecordedPlayer: boolean }> {
  const participant = or(
    eq(matches.playerAId, userId),
    eq(matches.playerBId, userId),
  );
  const [motw, recorded] = await Promise.all([
    db
      .select({ matchId: matches.id })
      .from(motwSelections)
      .innerJoin(matches, eq(matches.id, motwSelections.matchId))
      .where(and(eq(motwSelections.windowId, windowId), participant))
      .limit(1),
    db
      .select({ matchId: matches.id })
      .from(recordingHolds)
      .innerJoin(matches, eq(matches.id, recordingHolds.matchId))
      .where(and(eq(recordingHolds.windowId, windowId), participant))
      .limit(1),
  ]);
  return {
    isMotwPlayer: motw.length > 0,
    isRecordedPlayer: recorded.length > 0,
  };
}

// Every player of a season whose match is featured or marked, for the staff
// views that want to know who still owes a photo.
export async function streamPlayersOfWindow(
  windowId: string,
): Promise<Set<string>> {
  const rows = await db
    .select({ a: matches.playerAId, b: matches.playerBId })
    .from(matches)
    .innerJoin(subDivisions, eq(subDivisions.id, matches.subDivisionId))
    .innerJoin(divisions, eq(divisions.id, subDivisions.divisionId))
    .leftJoin(motwSelections, eq(motwSelections.matchId, matches.id))
    .leftJoin(recordingHolds, eq(recordingHolds.matchId, matches.id))
    .where(
      and(
        eq(divisions.windowId, windowId),
        or(isNotNull(motwSelections.id), isNotNull(recordingHolds.matchId)),
      ),
    );
  const ids = new Set<string>();
  for (const row of rows) {
    ids.add(row.a);
    if (row.b) {
      ids.add(row.b);
    }
  }
  return ids;
}

export async function setStreamPhotoPath(
  userId: string,
  path: string | null,
): Promise<void> {
  await db
    .update(profiles)
    .set({
      streamPhotoPath: path,
      streamPhotoUpdatedAt: path === null ? null : new Date(),
      updatedAt: new Date(),
    })
    .where(eq(profiles.userId, userId));
}
