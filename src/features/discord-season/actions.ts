"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@/features/roles/guard";
import { roleAtLeast } from "@/features/roles/roles";
import { latestWindow } from "@/features/staff/queries";
import { syncSeasonDiscord } from "./converge";

export type SyncNowResult = { ok: true } | { ok: false; error: string };

// The staff card's "Jetzt abgleichen": one converge run, right now. The
// report lands in the sync state; the re-rendered dashboard shows it.
export async function syncSeasonDiscordNow(): Promise<SyncNowResult> {
  const current = await currentUser();
  if (!current || !roleAtLeast(current.role, "staff")) {
    return { ok: false, error: "Keine Berechtigung" };
  }
  const window = await latestWindow();
  if (!window || window.schedulePublishedAt === null) {
    return { ok: false, error: "Die Pairings sind noch nicht veröffentlicht" };
  }
  const report = await syncSeasonDiscord(window.id);
  if (report === null) {
    return { ok: false, error: "Discord ist nicht konfiguriert" };
  }
  revalidatePath("/staff");
  return report.error === null
    ? { ok: true }
    : { ok: false, error: report.error };
}
