import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  divisions,
  matchdays,
  matches,
  motwSelections,
  placements,
  profiles,
  recordingHolds,
  subDivisions,
} from "@/db/schema";
import { saveResult } from "@/features/reporting/queries";
import { createWindow } from "@/features/staff/queries";
import { db } from "@/lib/db";
import { getStreamMatch, listStreamMatches } from "./queries";

const alice = randomUUID();
const bob = randomUUID();
const carol = randomUUID();
const dave = randomUUID();
const erin = randomUUID();
const frank = randomUUID();
let windowId: string;
let played: string; // alice vs bob, 2:1, both sheets, MotW
let walkover: string; // carol vs dave, free win
let halfReported: string; // erin vs frank, normal result but one sheet only
let open: string; // alice vs carol, no result
let bye: string; // dave

// The public URL of a stream photo is built from this; CI sets it for the
// build step only, so the assertion below would otherwise depend on the
// ambient environment.
const SUPABASE_URL = "https://sb.test";

beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
  for (const id of [alice, bob, carol, dave, erin, frank]) {
    await db.execute(sql`insert into auth.users (id) values (${id})`);
  }
  await db.insert(profiles).values([
    {
      userId: alice,
      displayName: "Alice",
      // The Discord avatar stays on the profile and out of the payload; the
      // stream photo is what the overlay gets.
      avatarUrl: "https://cdn/alice",
      streamPhotoPath: `${alice}/photo.webp`,
    },
    { userId: bob, username: "bobby" },
    { userId: carol, displayName: "Carol" },
    { userId: dave, displayName: "Dave" },
    { userId: erin, displayName: "Erin" },
    { userId: frank, displayName: "Frank" },
  ]);

  await createWindow(new Date("2026-06-30T18:00:00Z"), alice, 2);
  const rows = await db.execute<{ id: string }>(
    sql`select id from registration_windows where opened_by = ${alice}`,
  );
  windowId = rows[0].id;

  const [division] = await db
    .insert(divisions)
    .values({ windowId, tier: 2 })
    .returning({ id: divisions.id });
  const [group] = await db
    .insert(subDivisions)
    .values({ divisionId: division.id, position: 0 })
    .returning({ id: subDivisions.id });
  // Placed players, so `windowPlayerForm` has a table to compute and the
  // detail payload can carry a real season record.
  await db.insert(placements).values(
    [alice, bob, carol, dave, erin, frank].map((userId) => ({
      windowId,
      userId,
      divisionId: division.id,
      subDivisionId: group.id,
    })),
  );
  await db.insert(matchdays).values([
    { windowId, round: 1, startsOn: "2026-07-01", endsOn: "2026-07-07" },
    { windowId, round: 2, startsOn: "2026-07-08", endsOn: "2026-07-14" },
  ]);

  const insert = async (
    round: number,
    playerAId: string,
    playerBId: string | null,
  ) => {
    const [row] = await db
      .insert(matches)
      .values({ subDivisionId: group.id, round, playerAId, playerBId })
      .returning({ id: matches.id });
    return row.id;
  };
  open = await insert(1, alice, carol);
  played = await insert(2, alice, bob);
  walkover = await insert(1, carol, dave);
  halfReported = await insert(1, erin, frank);
  bye = await insert(2, dave, null);

  await saveResult(
    played,
    {
      outcome: "normal",
      winnerId: alice,
      platform: "showdown",
      videoUrl: null,
      freeWinReason: null,
      discussedWithId: null,
    },
    [
      { gameNumber: 1, winnerId: alice, replayUrl: "https://replay/1" },
      { gameNumber: 2, winnerId: bob, replayUrl: "https://replay/2" },
      { gameNumber: 3, winnerId: alice, replayUrl: "https://replay/3" },
    ],
    [
      { playerId: alice, source: "pokepaste", ots: "Garchomp @ Life Orb" },
      { playerId: bob, source: "import", ots: "Whimsicott @ Occa Berry" },
    ],
    alice,
  );
  await saveResult(
    walkover,
    {
      outcome: "free_win",
      winnerId: carol,
      platform: null,
      videoUrl: null,
      freeWinReason: "Gegner nicht erschienen",
      discussedWithId: null,
    },
    [],
    [],
    carol,
  );
  await saveResult(
    halfReported,
    {
      outcome: "normal",
      winnerId: erin,
      platform: "cartridge",
      videoUrl: null,
      freeWinReason: null,
      discussedWithId: null,
    },
    [
      { gameNumber: 1, winnerId: erin, replayUrl: null },
      { gameNumber: 2, winnerId: erin, replayUrl: null },
    ],
    [{ playerId: erin, source: "import", ots: "Incineroar @ Sitrus Berry" }],
    erin,
  );
  await db.insert(motwSelections).values({
    windowId,
    round: 2,
    matchId: played,
    selectedById: alice,
  });
  await db.insert(recordingHolds).values({
    matchId: played,
    windowId,
    round: 2,
    heldById: alice,
  });
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await db.execute(
    sql`delete from registration_windows where id = ${windowId}`,
  );
  for (const id of [alice, bob, carol, dave, erin, frank]) {
    await db.execute(sql`delete from auth.users where id = ${id}`);
  }
});

describe("listStreamMatches", () => {
  it("lists only played best-of-3s with both sheets", async () => {
    const list = await listStreamMatches(windowId);
    expect(list.map((m) => m.id)).toEqual([played]);
    expect(list[0]).toMatchObject({
      round: 2,
      division: { tier: 2, name: "Division 2" },
      group: { name: "Division 2a", shortName: "2a" },
      playerA: { id: alice, name: "Alice" },
      playerB: { id: bob, name: "bobby" },
      games: ["a", "b", "a"],
      platform: "showdown",
      motw: true,
      recording: true,
    });
    expect(list[0]).not.toHaveProperty("sheets");
  });

  it("is empty for an unknown season", async () => {
    expect(await listStreamMatches(randomUUID())).toEqual([]);
  });
});

describe("getStreamMatch", () => {
  it("carries sheets and the stream photo, never the Discord avatar", async () => {
    const match = await getStreamMatch(windowId, played);
    expect(match?.sheets).toEqual({
      a: "Garchomp @ Life Orb",
      b: "Whimsicott @ Occa Berry",
    });
    expect(match?.playerA.photoUrl).toBe(
      `${SUPABASE_URL}/storage/v1/object/public/stream-photos/${alice}/photo.webp`,
    );
    expect(match?.playerB.photoUrl).toBeNull();
    expect(match?.playerA.avatarUrl).toBeNull();
    expect(match?.playerB.avatarUrl).toBeNull();
  });

  it("carries the season record, the same tally the standings show", async () => {
    const match = await getStreamMatch(windowId, played);
    // Alice won this one, and it is the only decided match either has played.
    expect(match?.playerA.record).toEqual({ wins: 1, losses: 0 });
    expect(match?.playerB.record).toEqual({ wins: 0, losses: 1 });
  });

  it("is null for everything the list does not show", async () => {
    expect(await getStreamMatch(windowId, walkover)).toBeNull();
    expect(await getStreamMatch(windowId, halfReported)).toBeNull();
    expect(await getStreamMatch(windowId, open)).toBeNull();
    expect(await getStreamMatch(windowId, bye)).toBeNull();
    expect(await getStreamMatch(randomUUID(), played)).toBeNull();
  });
});
