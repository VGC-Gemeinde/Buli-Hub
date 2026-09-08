import { asc, eq } from "drizzle-orm";
import { recordingHolds } from "@/db/schema";
import { db } from "@/lib/db";

export type RecordingHold = {
  matchId: string;
  round: number;
  heldById: string;
  createdAt: Date;
};

// Every hold of a season, in round order. Feeds the public overview and the
// profile (which rows are withheld), the staff pages and the stream API.
export async function holdsForWindow(
  windowId: string,
): Promise<RecordingHold[]> {
  return db
    .select({
      matchId: recordingHolds.matchId,
      round: recordingHolds.round,
      heldById: recordingHolds.heldById,
      createdAt: recordingHolds.createdAt,
    })
    .from(recordingHolds)
    .where(eq(recordingHolds.windowId, windowId))
    .orderBy(asc(recordingHolds.round), asc(recordingHolds.createdAt));
}

// Whether a match is held. Drives the match page and the Discord result sync.
export async function isHeld(matchId: string): Promise<boolean> {
  const row = await db.query.recordingHolds.findFirst({
    columns: { matchId: true },
    where: eq(recordingHolds.matchId, matchId),
  });
  return row !== undefined;
}

// Sets a hold. A second hold on the same match is a no-op (the primary key
// makes it one row per match, and the action already reports it as held).
export async function insertHold(input: {
  matchId: string;
  windowId: string;
  round: number;
  staffId: string;
}): Promise<void> {
  await db
    .insert(recordingHolds)
    .values({
      matchId: input.matchId,
      windowId: input.windowId,
      round: input.round,
      heldById: input.staffId,
    })
    .onConflictDoNothing();
}

// Releases a hold. Returns whether there was one.
export async function deleteHold(matchId: string): Promise<boolean> {
  const rows = await db
    .delete(recordingHolds)
    .where(eq(recordingHolds.matchId, matchId))
    .returning({ matchId: recordingHolds.matchId });
  return rows.length > 0;
}
