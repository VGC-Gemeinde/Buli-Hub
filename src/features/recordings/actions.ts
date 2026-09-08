"use server";

import { revalidatePath } from "next/cache";
import { syncResultPost } from "@/features/discord-posts/sync";
import { droppedIdsForWindow } from "@/features/drops/queries";
import { matchSelectionContext } from "@/features/motw/queries";
import { getMatchResult } from "@/features/reporting/queries";
import { currentUser } from "@/features/roles/guard";
import { roleAtLeast } from "@/features/roles/roles";
import { currentMatchday } from "@/features/season/dashboard";
import { matchdaysForWindow } from "@/features/season/queries";
import { germanToday } from "@/lib/german-time";
import { canHold } from "./holds";
import { deleteHold, insertHold, isHeld } from "./queries";

export type RecordingActionResult = { ok: true } | { ok: false; error: string };

// A hold changes what the public overview, the Spielplan, the match page,
// both profiles and both staff screens show.
function revalidate(matchId: string, playerIds: (string | null)[]) {
  revalidatePath("/");
  revalidatePath("/spielplan");
  revalidatePath("/staff");
  revalidatePath("/staff/aufnahmen");
  revalidatePath(`/match/${matchId}`);
  for (const playerId of playerIds) {
    if (playerId) {
      revalidatePath(`/spieler/${playerId}`);
    }
  }
}

async function staffGate() {
  const current = await currentUser();
  if (!current || !roleAtLeast(current.role, "staff")) {
    return { ok: false as const, error: "Keine Berechtigung" };
  }
  return { ok: true as const, staffId: current.userId };
}

// Marks a match for a recording: its result stays withheld until released.
// Only an open match of the current or a later Spieltag qualifies (`canHold`).
export async function holdMatch(input: {
  matchId: string;
}): Promise<RecordingActionResult> {
  const gate = await staffGate();
  if (!gate.ok) {
    return gate;
  }
  const context = await matchSelectionContext(input.matchId);
  if (!context) {
    return { ok: false, error: "Match nicht gefunden" };
  }
  if (await isHeld(input.matchId)) {
    return { ok: false, error: "Dieses Match wird bereits zurückgehalten" };
  }
  const [result, droppedIds, matchdays] = await Promise.all([
    getMatchResult(input.matchId),
    droppedIdsForWindow(context.windowId),
    matchdaysForWindow(context.windowId),
  ]);
  const currentRound = currentMatchday(matchdays, germanToday())?.round ?? null;
  // A pending free win is not public yet, but it is a result: staff confirm
  // it and it is posted. Holding it would be holding a result. Rejected too.
  const reported = result !== null;
  const decidedByDrop =
    droppedIds.has(context.playerAId) ||
    (context.playerBId !== null && droppedIds.has(context.playerBId));
  if (context.isBye) {
    return { ok: false, error: "Ein Spielfrei lässt sich nicht aufnehmen" };
  }
  if (reported) {
    return {
      ok: false,
      error:
        "Ein gemeldetes Match lässt sich nicht mehr zurückhalten. Das Ergebnis ist bereits öffentlich.",
    };
  }
  if (decidedByDrop) {
    return {
      ok: false,
      error: "Ein durch Drop entschiedenes Match lässt sich nicht aufnehmen",
    };
  }
  if (
    !canHold({
      reported,
      isBye: context.isBye,
      decidedByDrop,
      round: context.round,
      currentRound,
    })
  ) {
    return {
      ok: false,
      error:
        "Nur Matches des aktuellen oder eines kommenden Spieltags lassen sich zurückhalten",
    };
  }
  await insertHold({
    matchId: input.matchId,
    windowId: context.windowId,
    round: context.round,
    staffId: gate.staffId,
  });
  revalidate(input.matchId, [context.playerAId, context.playerBId]);
  // Nothing is posted for an open match; kept so the mirror converges even
  // in the one gap (a result reported between the check and the insert).
  await syncResultPost(input.matchId);
  return { ok: true };
}

// Releases a hold: the result becomes public and, if it is reportable, is
// posted to Discord. Allowed for any hold at any time.
export async function releaseHold(input: {
  matchId: string;
}): Promise<RecordingActionResult> {
  const gate = await staffGate();
  if (!gate.ok) {
    return gate;
  }
  const context = await matchSelectionContext(input.matchId);
  if (!context) {
    return { ok: false, error: "Match nicht gefunden" };
  }
  const released = await deleteHold(input.matchId);
  if (!released) {
    return { ok: false, error: "Dieses Match wird nicht zurückgehalten" };
  }
  revalidate(input.matchId, [context.playerAId, context.playerBId]);
  await syncResultPost(input.matchId);
  return { ok: true };
}
