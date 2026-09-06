import { z } from "zod";

// What a Discord season sync found and did — stored per window after every
// run (`discord_season_sync_state`) and read by the staff dashboard, which
// therefore never talks to Discord itself.

export const skipReasonSchema = z.enum([
  // The player's auth metadata carries no Discord id — a hub-side problem.
  "no_discord_id",
  // Not in the guild's member list; the membership feature reports these.
  "not_on_server",
  // A role call failed with something other than "not a member".
  "error",
]);
export type SkipReason = z.infer<typeof skipReasonSchema>;

export const seasonDiscordReportSchema = z.object({
  // Sub-divisions whose role and channel both exist on Discord.
  groupsReady: z.number().int().nonnegative(),
  groupsTotal: z.number().int().nonnegative(),
  // Active placed players holding both the Buli-Spieler and their group role.
  playersReady: z.number().int().nonnegative(),
  playersTotal: z.number().int().nonnegative(),
  skipped: z.array(z.object({ name: z.string(), reason: skipReasonSchema })),
  // The first failure that stopped or degraded the run, for the staff card.
  error: z.string().nullable(),
});
export type SeasonDiscordReport = z.infer<typeof seasonDiscordReportSchema>;

export type SeasonDiscordSyncState = {
  ranAt: Date;
  report: SeasonDiscordReport;
};

// A run older than this means the scheduler is not calling the job route
// (every 15 minutes by design); the staff card then says so.
export const STALE_AFTER_MS = 60 * 60 * 1000;

// Whether the staff dashboard should show the Discord card. Silent while
// Discord matches the league; players merely not on the server do not count
// (the Discord-Mitgliedschaft feature already reports them).
export function needsAttention(
  state: SeasonDiscordSyncState | null,
  now: Date,
): boolean {
  if (state === null) {
    return true;
  }
  if (now.getTime() - state.ranAt.getTime() > STALE_AFTER_MS) {
    return true;
  }
  const { report } = state;
  return (
    report.error !== null ||
    report.groupsReady < report.groupsTotal ||
    report.skipped.some((entry) => entry.reason !== "not_on_server")
  );
}

// What the card renders — derived here so the component stays dumb and the
// gallery can show every state from plain data.
export type SeasonDiscordCardView =
  | { kind: "never" }
  | { kind: "stale"; ranAt: Date }
  | {
      kind: "attention";
      ranAt: Date;
      groups: { ready: number; total: number };
      players: { ready: number; total: number };
      error: string | null;
      // Only the hub-side and error skips; non-members are not repeated.
      skipped: { name: string; reason: Exclude<SkipReason, "not_on_server"> }[];
    };

export function cardView(
  state: SeasonDiscordSyncState | null,
  now: Date,
): SeasonDiscordCardView {
  if (state === null) {
    return { kind: "never" };
  }
  if (now.getTime() - state.ranAt.getTime() > STALE_AFTER_MS) {
    return { kind: "stale", ranAt: state.ranAt };
  }
  const { report } = state;
  return {
    kind: "attention",
    ranAt: state.ranAt,
    groups: { ready: report.groupsReady, total: report.groupsTotal },
    players: { ready: report.playersReady, total: report.playersTotal },
    error: report.error,
    skipped: report.skipped.filter(
      (entry): entry is { name: string; reason: "no_discord_id" | "error" } =>
        entry.reason !== "not_on_server",
    ),
  };
}

export function skipReasonLabel(reason: SkipReason): string {
  switch (reason) {
    case "no_discord_id":
      return "keine Discord-ID";
    case "not_on_server":
      return "nicht auf dem Server";
    case "error":
      return "Fehler";
  }
}
