"use server";

import { revalidatePath } from "next/cache";
import { syncMotwVodPost } from "@/features/discord-posts/sync";
import { selectableRounds } from "@/features/motw/motw";
import {
  deleteMotw,
  matchSelectionContext,
  motwForWindow,
} from "@/features/motw/queries";
import { clearMotwRole, holdsForWindow } from "@/features/recordings/queries";
import { currentUser } from "@/features/roles/guard";
import { roleAtLeast } from "@/features/roles/roles";
import { currentMatchday } from "@/features/season/dashboard";
import { matchdaysForWindow } from "@/features/season/queries";
import { latestWindow } from "@/features/staff/queries";
import { germanToday } from "@/lib/german-time";
import { clearDropped, placementDropState, setDropped } from "./queries";

export type DropActionResult = { ok: true } | { ok: false; error: string };

// Drops touch standings, row scores and match pages everywhere.
function revalidate() {
  revalidatePath("/");
  revalidatePath("/spieler");
  revalidatePath("/staff");
  revalidatePath("/staff/motw");
  revalidatePath("/match/[matchId]", "page");
}

async function staffGate() {
  const current = await currentUser();
  if (!current || !roleAtLeast(current.role, "staff")) {
    return { ok: false as const, error: "Keine Berechtigung" };
  }
  return { ok: true as const, staffId: current.userId };
}

// Drops a placed player: every match of theirs counts as a 2:0 free win for
// the opponent from now on (read-time override — stored results stay
// untouched, see docs/plans/player-drops.md). A scheduled MotW pick
// (current/next round) featuring the player is removed.
export async function dropPlayer(input: {
  userId: string;
  reason: string;
}): Promise<DropActionResult> {
  const gate = await staffGate();
  if (!gate.ok) {
    return gate;
  }
  const window = await latestWindow();
  if (!window) {
    return { ok: false, error: "Keine laufende Saison" };
  }
  const placement = await placementDropState(window.id, input.userId);
  if (!placement) {
    return { ok: false, error: "Spieler ist in dieser Saison nicht platziert" };
  }
  if (placement.droppedAt) {
    return { ok: false, error: "Spieler ist bereits gedroppt" };
  }

  const reason = input.reason.trim();
  if (reason === "") {
    return { ok: false, error: "Bitte einen Grund angeben" };
  }
  await setDropped({
    windowId: window.id,
    userId: input.userId,
    staffId: gate.staffId,
    reason,
  });

  // A scheduled Match of the Week featuring the player is no longer playable
  // — remove the confirmation (and its VOD announcement, if any). Settled past
  // weeks are history and stay.
  const matchdays = await matchdaysForWindow(window.id);
  const today = germanToday();
  const openRounds = selectableRounds(
    currentMatchday(matchdays, today)?.round ?? null,
    matchdays.length,
  );
  const selections = (await motwForWindow(window.id)).filter((selection) =>
    openRounds.has(selection.round),
  );
  for (const selection of selections) {
    const context = await matchSelectionContext(selection.matchId);
    if (
      context &&
      (context.playerAId === input.userId || context.playerBId === input.userId)
    ) {
      await deleteMotw(window.id, selection.round);
      await syncMotwVodPost(selection.matchId);
    }
  }

  // Same for a candidacy: a match with a dropped player can never become the
  // Match of the Week, so it leaves the race. The hold itself stays — releasing
  // a recording is a decision for /staff/aufnahmen, drops do not make it
  // (docs/plans/recording-holds.md).
  const candidates = (await holdsForWindow(window.id)).filter(
    (hold) => hold.motwRole !== null && openRounds.has(hold.round),
  );
  for (const candidate of candidates) {
    const context = await matchSelectionContext(candidate.matchId);
    if (
      context &&
      (context.playerAId === input.userId || context.playerBId === input.userId)
    ) {
      await clearMotwRole(candidate.matchId);
    }
  }

  revalidate();
  return { ok: true };
}

// Un-drop: nothing was destroyed, so clearing the flag restores every match
// to its stored state (played results, open matches, pending free wins).
export async function undropPlayer(input: {
  userId: string;
}): Promise<DropActionResult> {
  const gate = await staffGate();
  if (!gate.ok) {
    return gate;
  }
  const window = await latestWindow();
  if (!window) {
    return { ok: false, error: "Keine laufende Saison" };
  }
  const placement = await placementDropState(window.id, input.userId);
  if (!placement?.droppedAt) {
    return { ok: false, error: "Spieler ist nicht gedroppt" };
  }
  await clearDropped(window.id, input.userId);
  revalidate();
  return { ok: true };
}
