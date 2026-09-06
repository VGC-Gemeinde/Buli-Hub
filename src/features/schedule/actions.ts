"use server";

import { revalidatePath } from "next/cache";
import { syncSeasonDiscord } from "@/features/discord-season/converge";
import { currentUser } from "@/features/roles/guard";
import { roleAtLeast } from "@/features/roles/roles";
import { getSeeding } from "@/features/seeding/queries";
import { latestWindow } from "@/features/staff/queries";
import { registrationState } from "@/features/staff/registration-window";
import { germanToday } from "@/lib/german-time";
import {
  hasSchedule,
  markSchedulePublished,
  persistSchedule,
  subDivisionRosters,
} from "./queries";
import { generateRoundRobin } from "./round-robin";
import {
  spieltagCount,
  spieltagDeadlinesSchema,
  windowsFromDeadlines,
} from "./spieltage";

export type ScheduleResult = { ok: true } | { ok: false; error: string };

// Generates the season's single round-robin per sub-division from a finalized
// seeding and stores the Spieltag calendar. Terminal and one-shot: only while
// the seeding is finalized and no schedule exists yet; the season then runs.
export async function createSchedule(input: {
  deadlines: unknown;
}): Promise<ScheduleResult> {
  const current = await currentUser();
  if (!current || !roleAtLeast(current.role, "staff")) {
    return { ok: false, error: "Keine Berechtigung" };
  }

  const window = await latestWindow();
  if (!window || registrationState(window, new Date()) !== "closed") {
    return { ok: false, error: "Nicht möglich" };
  }

  const seeding = await getSeeding(window.id);
  if (!seeding?.finalizedAt) {
    return {
      ok: false,
      error: "Die Einteilung muss zuerst finalisiert werden",
    };
  }

  if (await hasSchedule(window.id)) {
    return { ok: false, error: "Der Spielplan wurde bereits erstellt" };
  }

  const rosters = await subDivisionRosters(window.id);
  const expected = spieltagCount(
    rosters.map((roster) => roster.userIds.length),
  );
  if (expected === 0) {
    return { ok: false, error: "Zu wenige Spieler für einen Spielplan" };
  }

  const parsed = spieltagDeadlinesSchema.safeParse(input.deadlines);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe",
    };
  }
  const deadlines = parsed.data;

  if (deadlines.length !== expected) {
    return {
      ok: false,
      error: "Die Anzahl der Spieltage passt nicht zur Einteilung",
    };
  }

  // The season starts on generation; week 1's deadline must be after it.
  const seasonStart = germanToday();
  if (deadlines[0] <= seasonStart) {
    return {
      ok: false,
      error: "Der erste Spieltag muss nach dem Saisonstart enden",
    };
  }

  const windows = windowsFromDeadlines(seasonStart, deadlines);
  const matchRows = rosters.flatMap((roster) =>
    generateRoundRobin(roster.userIds).flatMap((pairings, roundIndex) =>
      pairings.map((pairing) => ({
        subDivisionId: roster.subDivisionId,
        round: roundIndex + 1,
        playerAId: pairing.a,
        playerBId: pairing.b,
      })),
    ),
  );

  await persistSchedule(window.id, windows, matchRows);
  revalidatePath("/staff");
  return { ok: true };
}

// Makes the generated schedule visible to players — the season flips from
// schedule_hidden to regular_season everywhere at once. Terminal like the
// steps before it: the timestamp is set once, there is no unpublish.
export async function publishSchedule(): Promise<ScheduleResult> {
  const current = await currentUser();
  if (!current || !roleAtLeast(current.role, "staff")) {
    return { ok: false, error: "Keine Berechtigung" };
  }

  const window = await latestWindow();
  if (!window) {
    return { ok: false, error: "Nicht möglich" };
  }
  if (!(await hasSchedule(window.id))) {
    return { ok: false, error: "Der Spielplan wurde noch nicht erstellt" };
  }
  if (window.schedulePublishedAt !== null) {
    return { ok: false, error: "Die Pairings wurden bereits veröffentlicht" };
  }

  await markSchedulePublished(window.id);
  // The whole app changes at once: landing → Liga-Übersicht, header nav,
  // Spieler-Dashboard, profile, staff hub.
  revalidatePath("/", "layout");
  // Then the Discord server follows: group roles, group channels, player
  // roles. Best-effort and after the publish, so it can neither delay nor
  // block the season; whatever it does not manage, the periodic sync and
  // the staff card's button finish (docs/plans/discord-season-setup.md).
  await syncSeasonDiscord(window.id);
  return { ok: true };
}
