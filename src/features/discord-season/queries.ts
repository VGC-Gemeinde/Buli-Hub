import { eq, sql } from "drizzle-orm";
import {
  discordSeasonResources,
  discordSeasonSyncState,
  placements,
} from "@/db/schema";
import { discordIdentityFromUser } from "@/features/auth/identity";
import { listSubDivisions } from "@/features/seeding/queries";
import { db } from "@/lib/db";
import { PLAYER_NAME_FALLBACK, playerName } from "@/lib/player-name";
import type {
  ResourceKind,
  SeasonGroup,
  SeasonPlayer,
  TrackedResource,
} from "./plan";
import {
  type SeasonDiscordReport,
  type SeasonDiscordSyncState,
  seasonDiscordReportSchema,
} from "./report";

// The season's sub-divisions, ordered by tier and position.
export async function listSeasonGroups(
  windowId: string,
): Promise<SeasonGroup[]> {
  const rows = await listSubDivisions(windowId);
  return rows.map((row) => ({
    subDivisionId: row.id,
    tier: row.tier,
    position: row.position,
  }));
}

// Active placed players of a window with their Discord id, which lives in the
// auth metadata. Raw SQL because Drizzle does not manage the auth schema; the
// metadata goes through the same mapper as a real session.
export async function listPlacedPlayers(
  windowId: string,
): Promise<SeasonPlayer[]> {
  const rows = await db.execute<{
    user_id: string;
    sub_division_id: string;
    display_name: string | null;
    username: string | null;
    meta: Record<string, unknown> | null;
  }>(
    sql`select p.user_id, p.sub_division_id, pr.display_name, pr.username,
               u.raw_user_meta_data as meta
        from placements p
        join auth.users u on u.id = p.user_id
        left join profiles pr on pr.user_id = p.user_id
        where p.window_id = ${windowId}
          and p.sub_division_id is not null
          and p.dropped_at is null
        order by p.user_id`,
  );
  return rows.map((row) => ({
    userId: row.user_id,
    subDivisionId: row.sub_division_id,
    name: playerName(row.display_name, row.username) || PLAYER_NAME_FALLBACK,
    discordId: discordIdentityFromUser({
      user_metadata: row.meta ?? {},
    } as Parameters<typeof discordIdentityFromUser>[0]).discordId,
  }));
}

export async function trackedResources(
  windowId: string,
): Promise<TrackedResource[]> {
  return db
    .select({
      subDivisionId: discordSeasonResources.subDivisionId,
      kind: discordSeasonResources.kind,
      discordId: discordSeasonResources.discordId,
    })
    .from(discordSeasonResources)
    .where(eq(discordSeasonResources.windowId, windowId));
}

// Records a created role or channel; re-points the row when the sync had to
// recreate a resource whose Discord object was gone.
export async function recordResource(input: {
  windowId: string;
  subDivisionId: string;
  kind: ResourceKind;
  discordId: string;
}): Promise<void> {
  await db
    .insert(discordSeasonResources)
    .values(input)
    .onConflictDoUpdate({
      target: [
        discordSeasonResources.subDivisionId,
        discordSeasonResources.kind,
      ],
      set: { discordId: input.discordId, createdAt: new Date() },
    });
}

export async function saveSyncState(
  windowId: string,
  ranAt: Date,
  report: SeasonDiscordReport,
): Promise<void> {
  await db
    .insert(discordSeasonSyncState)
    .values({ windowId, ranAt, report })
    .onConflictDoUpdate({
      target: discordSeasonSyncState.windowId,
      set: { ranAt, report },
    });
}

// The last run's state, or null when there was none (or the stored report
// no longer parses, which reads the same to the dashboard: run it again).
export async function getSyncState(
  windowId: string,
): Promise<SeasonDiscordSyncState | null> {
  const row = await db.query.discordSeasonSyncState.findFirst({
    where: eq(discordSeasonSyncState.windowId, windowId),
  });
  if (!row) {
    return null;
  }
  const parsed = seasonDiscordReportSchema.safeParse(row.report);
  return parsed.success ? { ranAt: row.ranAt, report: parsed.data } : null;
}

// Whether the placements table still lists the window at all — the sync is
// pointless (and the schedule gate handles the rest) without placements.
export async function windowHasPlacements(windowId: string): Promise<boolean> {
  const row = await db.query.placements.findFirst({
    columns: { id: true },
    where: eq(placements.windowId, windowId),
  });
  return row !== undefined;
}
