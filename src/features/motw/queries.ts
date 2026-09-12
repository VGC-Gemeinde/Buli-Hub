import { and, asc, eq } from "drizzle-orm";
import {
  divisions,
  matches,
  motwSelections,
  profiles,
  subDivisions,
} from "@/db/schema";
import { droppedIdsForWindow } from "@/features/drops/queries";
import { divisionGroups } from "@/features/reporting/queries";
import {
  computeStandings,
  divisionStandings,
} from "@/features/reporting/standings";
import { divisionsWithGroupSizes } from "@/features/seeding/queries";
import { withoutEmbargoed } from "@/features/spoilers/embargo";
import { db } from "@/lib/db";

export type MotwSelection = {
  round: number;
  matchId: string;
  youtubeUrl: string | null;
};

// Every Match-of-the-Week pick of a season, ordered by round — feeds the
// public overview (badges + prominent block) and the staff manager.
export async function motwForWindow(
  windowId: string,
): Promise<MotwSelection[]> {
  return db
    .select({
      round: motwSelections.round,
      matchId: motwSelections.matchId,
      youtubeUrl: motwSelections.youtubeUrl,
    })
    .from(motwSelections)
    .where(eq(motwSelections.windowId, windowId))
    .orderBy(asc(motwSelections.round));
}

// The MotW selection a match carries, or null — drives the match page's
// spoiler protection and YouTube link.
export async function motwByMatchId(
  matchId: string,
): Promise<{ round: number; youtubeUrl: string | null } | null> {
  const row = await db.query.motwSelections.findFirst({
    columns: { round: true, youtubeUrl: true },
    where: eq(motwSelections.matchId, matchId),
  });
  return row ?? null;
}

// A match's season anchor for the selection action: which window/round it
// belongs to, its participants, and whether it is a bye (unselectable). Null
// for an unknown id.
export async function matchSelectionContext(matchId: string): Promise<{
  windowId: string;
  round: number;
  playerAId: string;
  playerBId: string | null;
  isBye: boolean;
} | null> {
  const [row] = await db
    .select({
      windowId: divisions.windowId,
      round: matches.round,
      playerAId: matches.playerAId,
      playerBId: matches.playerBId,
    })
    .from(matches)
    .innerJoin(subDivisions, eq(subDivisions.id, matches.subDivisionId))
    .innerJoin(divisions, eq(divisions.id, subDivisions.divisionId))
    .where(eq(matches.id, matchId))
    .limit(1);
  return row
    ? {
        windowId: row.windowId,
        round: row.round,
        playerAId: row.playerAId,
        playerBId: row.playerBId,
        isBye: row.playerBId === null,
      }
    : null;
}

// Picks (or replaces) the MotW of a round. Replacing clears the YouTube URL —
// it belonged to the previous match.
export async function upsertMotw(input: {
  windowId: string;
  round: number;
  matchId: string;
  staffId: string;
}): Promise<void> {
  await db
    .insert(motwSelections)
    .values({
      windowId: input.windowId,
      round: input.round,
      matchId: input.matchId,
      selectedById: input.staffId,
    })
    .onConflictDoUpdate({
      target: [motwSelections.windowId, motwSelections.round],
      set: {
        matchId: input.matchId,
        youtubeUrl: null,
        selectedById: input.staffId,
        updatedAt: new Date(),
      },
    });
}

// Clears a round's pick. Returns the unselected match id (for revalidation),
// or null when the round had none.
export async function deleteMotw(
  windowId: string,
  round: number,
): Promise<string | null> {
  const rows = await db
    .delete(motwSelections)
    .where(
      and(
        eq(motwSelections.windowId, windowId),
        eq(motwSelections.round, round),
      ),
    )
    .returning({ matchId: motwSelections.matchId });
  return rows[0]?.matchId ?? null;
}

// A player's season form as the staff picker shows it.
export type PlayerForm = {
  rank: number;
  wins: number;
  losses: number;
  dropped: boolean;
};

// Every placed player of a season with their current placement and record,
// keyed by user id — the substance behind a MotW candidate row.
//
// The table a rank comes from is the one that decides the player's division:
// the merged Gesamttabelle in division mode, the sub-division table otherwise.
// That is the same choice `findMotw` makes for the public billboard, so "Platz
// 3" means the same thing in the picker and on the billboard.
export async function windowPlayerForm(
  windowId: string,
  // Matches to leave out of the tally. The staff picker passes nothing and
  // gets the true table; the stream API passes the match it is about plus
  // everything under embargo, so an overlay shows the record a player brings
  // *into* the match (docs/plans/stream-api.md).
  excluded: ReadonlySet<string> = new Set(),
): Promise<Map<string, PlayerForm>> {
  const [configs, droppedIds] = await Promise.all([
    divisionsWithGroupSizes(windowId),
    droppedIdsForWindow(windowId),
  ]);

  const tables = await Promise.all(
    configs.map(async (config) => {
      const raw = await divisionGroups(config.id);
      const groups = raw.map((group) => ({
        ...group,
        results: withoutEmbargoed(group.results, excluded),
      }));
      // `divisionStandings` returns null for unequal group sizes even in
      // division mode; the group tables are then the only comparable ones.
      const merged =
        config.relevantTable === "division" ? divisionStandings(groups) : null;
      if (merged) {
        return merged;
      }
      return groups.flatMap((group) =>
        computeStandings({ roster: group.roster, results: group.results }),
      );
    }),
  );

  const form = new Map<string, PlayerForm>();
  for (const row of tables.flat()) {
    form.set(row.userId, {
      rank: row.rank,
      wins: row.wins,
      losses: row.losses,
      dropped: droppedIds.has(row.userId),
    });
  }
  return form;
}

// What a profile says about a player's setup for the picker.
export type ProfileFlags = {
  hasCaptureCard: boolean;
  // The owner has actually saved their settings at least once. Without this,
  // `hasCaptureCard: false` is a default and not an answer — the picker must
  // not read it as "owns no capture card".
  edited: boolean;
};

export async function profileFlags(): Promise<Map<string, ProfileFlags>> {
  const rows = await db
    .select({
      userId: profiles.userId,
      hasCaptureCard: profiles.hasCaptureCard,
      settingsEditedAt: profiles.settingsEditedAt,
    })
    .from(profiles);
  return new Map(
    rows.map((row) => [
      row.userId,
      {
        hasCaptureCard: row.hasCaptureCard,
        edited: row.settingsEditedAt !== null,
      },
    ]),
  );
}

// Sets or clears (url null) a pick's YouTube URL. Returns the affected match
// id, or null when the round has no pick.
export async function setMotwYoutubeUrl(input: {
  windowId: string;
  round: number;
  url: string | null;
}): Promise<string | null> {
  const rows = await db
    .update(motwSelections)
    .set({ youtubeUrl: input.url, updatedAt: new Date() })
    .where(
      and(
        eq(motwSelections.windowId, input.windowId),
        eq(motwSelections.round, input.round),
      ),
    )
    .returning({ matchId: motwSelections.matchId });
  return rows[0]?.matchId ?? null;
}
