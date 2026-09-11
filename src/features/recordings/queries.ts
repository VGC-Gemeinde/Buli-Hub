import { and, asc, eq, isNotNull } from "drizzle-orm";
import { recordingHolds } from "@/db/schema";
import type { MotwRole } from "@/features/motw/motw";
import { db } from "@/lib/db";

export type RecordingHold = {
  matchId: string;
  round: number;
  heldById: string;
  // Set when the hold is also a Match-of-the-Week candidate
  // (docs/plans/motw-candidates.md); null for an ordinary recording.
  motwRole: MotwRole | null;
  createdAt: Date;
};

// Every hold of a season, in round order and, within a round, in the order
// they were set — which is the order the MotW workspace lists the backups in.
// Feeds the public overview and the profile (which rows are withheld), the
// staff pages and the stream API.
export async function holdsForWindow(
  windowId: string,
): Promise<RecordingHold[]> {
  return db
    .select({
      matchId: recordingHolds.matchId,
      round: recordingHolds.round,
      heldById: recordingHolds.heldById,
      motwRole: recordingHolds.motwRole,
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

// Nominates a match as a Match-of-the-Week candidate: it is held like any
// recording, because that is what it is, and carries the role on top. A match
// that is already held keeps its hold and only changes role, so promoting an
// ordinary recording into the race costs nothing.
//
// A new Hauptkandidat demotes the round's previous one to backup in the same
// transaction — the partial unique index would otherwise reject the write.
export async function nominateHold(input: {
  matchId: string;
  windowId: string;
  round: number;
  staffId: string;
  role: MotwRole;
}): Promise<void> {
  await db.transaction(async (tx) => {
    if (input.role === "primary") {
      await tx
        .update(recordingHolds)
        .set({ motwRole: "backup" })
        .where(
          and(
            eq(recordingHolds.windowId, input.windowId),
            eq(recordingHolds.round, input.round),
            eq(recordingHolds.motwRole, "primary"),
          ),
        );
    }
    await tx
      .insert(recordingHolds)
      .values({
        matchId: input.matchId,
        windowId: input.windowId,
        round: input.round,
        heldById: input.staffId,
        motwRole: input.role,
      })
      .onConflictDoUpdate({
        target: recordingHolds.matchId,
        set: { motwRole: input.role },
      });
  });
}

// Takes a match out of the race without publishing anything: the hold stays,
// the match stays withheld as an ordinary recording. Returns whether there was
// a candidate. Releasing is deliberately not reachable from the MotW
// workspace, only from the recordings one.
export async function clearMotwRole(matchId: string): Promise<boolean> {
  const rows = await db
    .update(recordingHolds)
    .set({ motwRole: null })
    .where(
      and(
        eq(recordingHolds.matchId, matchId),
        isNotNull(recordingHolds.motwRole),
      ),
    )
    .returning({ matchId: recordingHolds.matchId });
  return rows.length > 0;
}

// Releases a hold. Returns whether there was one. A candidate loses its
// candidacy with the hold: a public result cannot become the Match of the
// Week.
export async function deleteHold(matchId: string): Promise<boolean> {
  const rows = await db
    .delete(recordingHolds)
    .where(eq(recordingHolds.matchId, matchId))
    .returning({ matchId: recordingHolds.matchId });
  return rows.length > 0;
}
