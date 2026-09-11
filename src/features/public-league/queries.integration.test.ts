import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  divisions,
  matchdays,
  matches,
  matchGames,
  matchResults,
  placements,
  profiles,
  subDivisions,
} from "@/db/schema";
import { windowPlayerForm } from "@/features/motw/queries";
import { createWindow } from "@/features/staff/queries";
import { db } from "@/lib/db";
import { publicLeagueOverview } from "./queries";

// The guarantee of docs/plans/standings-embargo.md: a withheld result must not
// reach the public through the table either. Wins and losses are the leak that
// matters, because the Spielplan already says which match is missing from
// them, so the whole result reads off a table that counts it.

const alice = randomUUID();
const bob = randomUUID();
const staff = randomUUID();
let windowId: string;
let matchId: string;

const guest = { userId: null, isStaff: false };
const today = "2026-07-03";

beforeAll(async () => {
  for (const id of [alice, bob, staff]) {
    await db.execute(sql`insert into auth.users (id) values (${id})`);
  }
  await createWindow(new Date("2026-06-30T18:00:00Z"), staff, 1);
  const rows = await db.execute<{ id: string }>(
    sql`select id from registration_windows where opened_by = ${staff}`,
  );
  windowId = rows[0].id;

  const [division] = await db
    .insert(divisions)
    .values({ windowId, tier: 1 })
    .returning({ id: divisions.id });
  const [subDivision] = await db
    .insert(subDivisions)
    .values({ divisionId: division.id, position: 0 })
    .returning({ id: subDivisions.id });
  await db
    .insert(matchdays)
    .values([
      { windowId, round: 1, startsOn: "2026-07-01", endsOn: "2026-07-07" },
    ]);
  await db.insert(profiles).values([
    { userId: alice, displayName: "Alice" },
    { userId: bob, displayName: "Bob" },
  ]);
  await db.insert(placements).values(
    [alice, bob].map((userId) => ({
      windowId,
      userId,
      divisionId: division.id,
      subDivisionId: subDivision.id,
    })),
  );

  const [match] = await db
    .insert(matches)
    .values({
      subDivisionId: subDivision.id,
      round: 1,
      playerAId: alice,
      playerBId: bob,
    })
    .returning({ id: matches.id });
  matchId = match.id;
  // Alice won 2:0 and the result is reported and confirmed.
  await db.insert(matchResults).values({
    matchId,
    outcome: "normal",
    winnerId: alice,
    platform: "cartridge",
    reportedById: alice,
    confirmedAt: new Date(),
  });
  await db.insert(matchGames).values([
    { matchId, gameNumber: 1, winnerId: alice },
    { matchId, gameNumber: 2, winnerId: alice },
  ]);
});

afterEach(async () => {
  await db.execute(
    sql`delete from recording_holds where window_id = ${windowId}`,
  );
  await db.execute(
    sql`delete from motw_selections where window_id = ${windowId}`,
  );
});

async function publicTable() {
  const overview = await publicLeagueOverview(windowId, 1, today, guest);
  const group = overview.divisions[0].groups[0];
  return {
    rows: new Map(
      group.standings.map((row) => [
        row.userId,
        { wins: row.wins, losses: row.losses, gamesWon: row.gamesWon },
      ]),
    ),
    withheld: group.withheldResults,
    divisionWithheld: overview.divisions[0].withheldResults,
    score: group.matches[0].scoreA,
  };
}

async function hold() {
  await db.execute(sql`
    insert into recording_holds (match_id, window_id, round, held_by_id)
    values (${matchId}, ${windowId}, 1, ${staff})
  `);
}

async function featureMotw(youtubeUrl: string | null) {
  await db.execute(sql`
    insert into motw_selections (window_id, round, match_id, youtube_url, selected_by_id)
    values (${windowId}, 1, ${matchId}, ${youtubeUrl}, ${staff})
  `);
}

afterAll(async () => {
  await db.execute(
    sql`delete from registration_windows where id = ${windowId}`,
  );
  for (const id of [alice, bob, staff]) {
    await db.execute(sql`delete from auth.users where id = ${id}`);
  }
});

describe("public standings and the result embargo", () => {
  it("counts a public result", async () => {
    const table = await publicTable();
    expect(table.rows.get(alice)).toEqual({ wins: 1, losses: 0, gamesWon: 2 });
    expect(table.rows.get(bob)).toEqual({ wins: 0, losses: 1, gamesWon: 0 });
    expect(table.withheld).toBe(0);
    expect(table.score).toBe(2);
  });

  it("drops a held result from both players' records", async () => {
    await hold();
    const table = await publicTable();
    // Not "played without a winner": absent. A match counted as played would
    // still say it is decided, and would move the game differential.
    expect(table.rows.get(alice)).toEqual({ wins: 0, losses: 0, gamesWon: 0 });
    expect(table.rows.get(bob)).toEqual({ wins: 0, losses: 0, gamesWon: 0 });
    expect(table.withheld).toBe(1);
    expect(table.divisionWithheld).toBe(1);
    // The row itself is withheld as before, which is what made the table the
    // remaining hole.
    expect(table.score).toBeNull();
  });

  it("drops the Match of the Week until its VOD is attached", async () => {
    await featureMotw(null);
    expect((await publicTable()).rows.get(alice)).toEqual({
      wins: 0,
      losses: 0,
      gamesWon: 0,
    });

    await db.execute(
      sql`update motw_selections set youtube_url = 'https://youtu.be/x' where window_id = ${windowId}`,
    );
    expect((await publicTable()).rows.get(alice)).toEqual({
      wins: 1,
      losses: 0,
      gamesWon: 2,
    });
  });

  it("keeps counting everything for staff tools and the stream", async () => {
    // `windowPlayerForm` feeds the MotW picker's placement and the stream
    // API's record. Neither is public, so neither loses the result.
    await hold();
    const form = await windowPlayerForm(windowId);
    expect(form.get(alice)).toMatchObject({ wins: 1, losses: 0 });
    expect(form.get(bob)).toMatchObject({ wins: 0, losses: 1 });
  });
});
