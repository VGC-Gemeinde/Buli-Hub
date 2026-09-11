"use server";

import { revalidatePath } from "next/cache";
import { syncMotwVodPost, syncResultPost } from "@/features/discord-posts/sync";
import { droppedIdsForWindow } from "@/features/drops/queries";
import { canHold } from "@/features/recordings/holds";
import {
  clearMotwRole,
  deleteHold,
  nominateHold,
} from "@/features/recordings/queries";
import { getMatchResult } from "@/features/reporting/queries";
import { currentUser } from "@/features/roles/guard";
import { roleAtLeast } from "@/features/roles/roles";
import { currentMatchday } from "@/features/season/dashboard";
import { matchdaysForWindow } from "@/features/season/queries";
import { latestWindow } from "@/features/staff/queries";
import { germanToday } from "@/lib/german-time";
import { type MotwRole, selectableRounds, youtubeUrlSchema } from "./motw";
import {
  deleteMotw,
  matchSelectionContext,
  motwForWindow,
  setMotwYoutubeUrl,
  upsertMotw,
} from "./queries";

export type MotwActionResult = { ok: true } | { ok: false; error: string };

// A candidate or a confirmation changes what the public overview, the
// Spielplan, the match page, both profiles and both staff screens show.
function revalidate(matchId: string | null, playerIds: (string | null)[] = []) {
  revalidatePath("/");
  revalidatePath("/spielplan");
  revalidatePath("/staff");
  revalidatePath("/staff/motw");
  revalidatePath("/staff/aufnahmen");
  if (matchId) {
    revalidatePath(`/match/${matchId}`);
  }
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

// The match a candidacy or confirmation is about, with everything the gates
// need. A string is the error to report.
async function featurableMatch(matchId: string) {
  const context = await matchSelectionContext(matchId);
  if (!context) {
    return "Match nicht gefunden";
  }
  if (context.isBye) {
    return "Ein Spielfrei kann nicht Match of the Week sein";
  }
  const droppedIds = await droppedIdsForWindow(context.windowId);
  if (
    droppedIds.has(context.playerAId) ||
    (context.playerBId !== null && droppedIds.has(context.playerBId))
  ) {
    return "Ein Match mit einem gedroppten Spieler kann nicht Match of the Week sein";
  }
  return context;
}

// The rounds currently open for confirming: the running Spieltag and every
// later one, plus any past Spieltag that was never confirmed (a missed week
// can still be backfilled). A past round with a confirmation is settled.
async function openRounds(
  windowId: string,
  selections: readonly { round: number }[],
): Promise<Set<number>> {
  const matchdays = await matchdaysForWindow(windowId);
  const today = germanToday();
  const current = currentMatchday(matchdays, today)?.round ?? null;
  return selectableRounds(
    current,
    matchdays.length,
    new Set(selections.map((s) => s.round)),
  );
}

// Nominates a match as Hauptkandidat or backup of its own Spieltag. A
// candidate is a recording (docs/plans/motw-candidates.md), so nominating
// holds the match back and the gate is the recording gate: only an open match
// of the running or a later Spieltag. A match that is already held keeps its
// hold and only gains the role.
export async function nominateMotwCandidate(input: {
  matchId: string;
  role: MotwRole;
}): Promise<MotwActionResult> {
  const gate = await staffGate();
  if (!gate.ok) {
    return gate;
  }
  const context = await featurableMatch(input.matchId);
  if (typeof context === "string") {
    return { ok: false, error: context };
  }
  const [result, matchdays] = await Promise.all([
    getMatchResult(input.matchId),
    matchdaysForWindow(context.windowId),
  ]);
  const currentRound = currentMatchday(matchdays, germanToday())?.round ?? null;
  if (result !== null) {
    return {
      ok: false,
      error:
        "Ein gemeldetes Match lässt sich nicht mehr als Kandidat aufnehmen. Das Ergebnis ist bereits öffentlich.",
    };
  }
  if (
    !canHold({
      reported: false,
      isBye: false,
      decidedByDrop: false,
      round: context.round,
      currentRound,
    })
  ) {
    return {
      ok: false,
      error:
        "Nur Matches des aktuellen oder eines kommenden Spieltags lassen sich als Kandidat wählen",
    };
  }
  await nominateHold({
    matchId: input.matchId,
    windowId: context.windowId,
    round: context.round,
    staffId: gate.staffId,
    role: input.role,
  });
  revalidate(input.matchId, [context.playerAId, context.playerBId]);
  // Nothing is posted for an open match; kept so the mirror converges even in
  // the one gap (a result reported between the check and the write).
  await syncResultPost(input.matchId);
  return { ok: true };
}

// Takes a match out of the race. The hold stays and the match stays withheld
// as an ordinary recording: the MotW workspace never ends an embargo, that
// happens under Aufnahmen (or, for the confirmed match, with the VOD link).
export async function dropMotwCandidate(input: {
  matchId: string;
}): Promise<MotwActionResult> {
  const gate = await staffGate();
  if (!gate.ok) {
    return gate;
  }
  const cleared = await clearMotwRole(input.matchId);
  if (!cleared) {
    return { ok: false, error: "Dieses Match ist kein Kandidat" };
  }
  revalidate(input.matchId);
  return { ok: true };
}

// Confirms which match actually is the Match of the Week of its Spieltag. From
// here on the established MotW rules apply: the billboard features it, the row
// carries the permanent pill, and the result stays withheld until the VOD is
// attached. Its recording hold is deleted in the same step, so the MotW
// embargo takes over from the recording embargo without a gap.
//
// A match that was never a candidate can be confirmed too, as long as the
// round has no confirmation yet: that is the backfill path for a week that was
// missed, with the consequence a late confirmation has always had (an
// already-public result is withheld again until the VOD).
export async function confirmMotw(input: {
  matchId: string;
}): Promise<MotwActionResult> {
  const gate = await staffGate();
  if (!gate.ok) {
    return gate;
  }
  const context = await featurableMatch(input.matchId);
  if (typeof context === "string") {
    return { ok: false, error: context };
  }
  const selections = await motwForWindow(context.windowId);
  const rounds = await openRounds(context.windowId, selections);
  if (!rounds.has(context.round)) {
    return {
      ok: false,
      error:
        "Vergangene Spieltage lassen sich nicht mehr umbestätigen. Nur der VOD-Link bleibt änderbar.",
    };
  }
  const previous = selections.find((s) => s.round === context.round) ?? null;
  await upsertMotw({
    windowId: context.windowId,
    round: context.round,
    matchId: input.matchId,
    staffId: gate.staffId,
  });
  await deleteHold(input.matchId);
  revalidate(input.matchId, [context.playerAId, context.playerBId]);
  // Discord mirror: the confirmed match's result post disappears until its VOD
  // is live.
  await syncResultPost(input.matchId);
  if (previous && previous.matchId !== input.matchId) {
    await rehold(previous.matchId, context.windowId, gate.staffId);
  }
  return { ok: true };
}

// Revokes a round's confirmation. The match goes back to being a backup
// candidate rather than becoming public: it was recorded, and publishing it is
// a decision for the recordings workspace.
export async function revokeMotw(input: {
  round: number;
}): Promise<MotwActionResult> {
  const gate = await staffGate();
  if (!gate.ok) {
    return gate;
  }
  const window = await latestWindow();
  if (!window) {
    return { ok: false, error: "Keine laufende Saison" };
  }
  const rounds = await openRounds(window.id, await motwForWindow(window.id));
  if (!rounds.has(input.round)) {
    return {
      ok: false,
      error: "Vergangene Spieltage lassen sich nicht mehr ändern",
    };
  }
  const matchId = await deleteMotw(window.id, input.round);
  revalidate(matchId);
  if (matchId) {
    await rehold(matchId, window.id, gate.staffId);
  }
  return { ok: true };
}

// A match that stops being the confirmed MotW (replaced or revoked) goes back
// under the recording hold it had as a candidate, as a backup. Without this
// the result of a recorded match would go public the moment staff correct a
// confirmation, and land in the results channel with it.
async function rehold(
  matchId: string,
  windowId: string,
  staffId: string,
): Promise<void> {
  const context = await matchSelectionContext(matchId);
  if (context) {
    await nominateHold({
      matchId,
      windowId,
      round: context.round,
      staffId,
      role: "backup",
    });
  }
  revalidatePath(`/match/${matchId}`);
  // No longer featured: a VOD announcement (if any) goes with the
  // confirmation, and the result stays withheld by the hold.
  await syncResultPost(matchId);
  await syncMotwVodPost(matchId);
}

// Attaches, replaces, or (url null/empty) removes the confirmed match's
// YouTube link — allowed for any round, since VOD uploads lag the Spieltag.
export async function saveMotwYoutubeUrl(input: {
  round: number;
  url: string | null;
}): Promise<MotwActionResult> {
  const gate = await staffGate();
  if (!gate.ok) {
    return gate;
  }
  const window = await latestWindow();
  if (!window) {
    return { ok: false, error: "Keine laufende Saison" };
  }
  const trimmed = input.url?.trim() ?? "";
  let url: string | null = null;
  if (trimmed !== "") {
    const parsed = youtubeUrlSchema.safeParse(trimmed);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Ungültiger Link",
      };
    }
    url = parsed.data;
  }
  const matchId = await setMotwYoutubeUrl({
    windowId: window.id,
    round: input.round,
    url,
  });
  if (!matchId) {
    return {
      ok: false,
      error: "Für diesen Spieltag ist kein Match of the Week bestätigt",
    };
  }
  revalidate(matchId);
  // Discord mirror: first link posts the announcement, a changed link edits
  // it, a cleared link deletes it. The link also ends the result embargo, so
  // the result post follows the announcement (and disappears with a cleared
  // link) — announcement first, so the community meets the VOD before the
  // score.
  await syncMotwVodPost(matchId);
  await syncResultPost(matchId);
  return { ok: true };
}
