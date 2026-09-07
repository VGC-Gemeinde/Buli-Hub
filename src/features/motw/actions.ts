"use server";

import { revalidatePath } from "next/cache";
import { syncMotwVodPost, syncResultPost } from "@/features/discord-posts/sync";
import { droppedIdsForWindow } from "@/features/drops/queries";
import { currentUser } from "@/features/roles/guard";
import { roleAtLeast } from "@/features/roles/roles";
import { currentMatchday } from "@/features/season/dashboard";
import { matchdaysForWindow } from "@/features/season/queries";
import { latestWindow } from "@/features/staff/queries";
import { germanToday } from "@/lib/german-time";
import { selectableRounds, youtubeUrlSchema } from "./motw";
import {
  deleteMotw,
  matchSelectionContext,
  motwForWindow,
  setMotwYoutubeUrl,
  upsertMotw,
} from "./queries";

export type MotwActionResult = { ok: true } | { ok: false; error: string };

// The MotW shows up on the public overview, the match page, and both staff
// screens.
function revalidate(matchId: string | null) {
  revalidatePath("/");
  revalidatePath("/staff");
  revalidatePath("/staff/motw");
  if (matchId) {
    revalidatePath(`/match/${matchId}`);
  }
}

async function staffGate() {
  const current = await currentUser();
  if (!current || !roleAtLeast(current.role, "staff")) {
    return { ok: false as const, error: "Keine Berechtigung" };
  }
  return { ok: true as const, staffId: current.userId };
}

// The rounds currently open for setting a pick: the running Spieltag and every
// later one, plus any past Spieltag that was never picked (a missed week can
// still be backfilled). A past round that already has a pick is settled.
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

// Picks (or replaces) the Match of the Week of the match's own Spieltag.
export async function selectMotw(input: {
  matchId: string;
}): Promise<MotwActionResult> {
  const gate = await staffGate();
  if (!gate.ok) {
    return gate;
  }
  const context = await matchSelectionContext(input.matchId);
  if (!context) {
    return { ok: false, error: "Match nicht gefunden" };
  }
  if (context.isBye) {
    return {
      ok: false,
      error: "Ein Spielfrei kann nicht Match of the Week sein",
    };
  }
  const droppedIds = await droppedIdsForWindow(context.windowId);
  if (
    droppedIds.has(context.playerAId) ||
    (context.playerBId !== null && droppedIds.has(context.playerBId))
  ) {
    return {
      ok: false,
      error:
        "Ein Match mit einem gedroppten Spieler kann nicht Match of the Week sein",
    };
  }
  const selections = await motwForWindow(context.windowId);
  const rounds = await openRounds(context.windowId, selections);
  if (!rounds.has(context.round)) {
    return {
      ok: false,
      error:
        "Vergangene Spieltage lassen sich nicht mehr umwählen. Nur der VOD-Link bleibt änderbar.",
    };
  }
  const previous = selections.find((s) => s.round === context.round) ?? null;
  await upsertMotw({
    windowId: context.windowId,
    round: context.round,
    matchId: input.matchId,
    staffId: gate.staffId,
  });
  revalidate(input.matchId);
  // Discord mirror: the new pick's result post disappears (spoiler); a
  // replaced match gets its public result back and loses its VOD post.
  await syncResultPost(input.matchId);
  if (previous && previous.matchId !== input.matchId) {
    revalidatePath(`/match/${previous.matchId}`);
    await syncResultPost(previous.matchId);
    await syncMotwVodPost(previous.matchId);
  }
  return { ok: true };
}

// Clears the pick of a (current or next) round.
export async function removeMotw(input: {
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
    // No longer featured: its public result may return to the channel; a
    // VOD announcement (if any) goes with the pick.
    await syncResultPost(matchId);
    await syncMotwVodPost(matchId);
  }
  return { ok: true };
}

// Attaches, replaces, or (url null/empty) removes a pick's YouTube link —
// allowed for any round, since VOD uploads can lag the Spieltag.
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
      error: "Für diesen Spieltag ist kein Match of the Week gewählt",
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
