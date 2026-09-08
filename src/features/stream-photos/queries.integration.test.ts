import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  divisions,
  matches,
  motwSelections,
  profiles,
  recordingHolds,
  subDivisions,
} from "@/db/schema";
import { createWindow } from "@/features/staff/queries";
import { db } from "@/lib/db";
import {
  setStreamPhotoPath,
  streamPhotoPathOf,
  streamPhotoPathsFor,
  streamPlayersOfWindow,
  streamRelevanceOf,
} from "./queries";

// Who the upload is offered to is a database question: the players of the
// featured match and of the matches staff record.

const alice = randomUUID();
const bob = randomUUID();
const carol = randomUUID();
const dave = randomUUID();
const outsider = randomUUID();
const staff = randomUUID();
let windowId: string;
let motwMatch: string;
let heldMatch: string;
let plainMatch: string;

beforeAll(async () => {
  for (const id of [alice, bob, carol, dave, outsider, staff]) {
    await db.execute(sql`insert into auth.users (id) values (${id})`);
  }
  await db
    .insert(profiles)
    .values([
      { userId: alice },
      { userId: bob },
      { userId: carol },
      { userId: dave },
      { userId: outsider },
    ]);
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
  const inserted = await db
    .insert(matches)
    .values([
      {
        subDivisionId: subDivision.id,
        round: 1,
        playerAId: alice,
        playerBId: bob,
      },
      {
        subDivisionId: subDivision.id,
        round: 2,
        playerAId: carol,
        playerBId: dave,
      },
      {
        subDivisionId: subDivision.id,
        round: 3,
        playerAId: outsider,
        playerBId: alice,
      },
    ])
    .returning({ id: matches.id, round: matches.round });
  motwMatch = inserted.find((m) => m.round === 1)?.id as string;
  heldMatch = inserted.find((m) => m.round === 2)?.id as string;
  plainMatch = inserted.find((m) => m.round === 3)?.id as string;

  await db.insert(motwSelections).values({
    windowId,
    round: 1,
    matchId: motwMatch,
    selectedById: staff,
  });
  await db.insert(recordingHolds).values({
    matchId: heldMatch,
    windowId,
    round: 2,
    heldById: staff,
  });
});

afterAll(async () => {
  await db.execute(
    sql`delete from registration_windows where id = ${windowId}`,
  );
  for (const id of [alice, bob, carol, dave, outsider, staff]) {
    await db.execute(sql`delete from auth.users where id = ${id}`);
  }
});

describe("streamRelevanceOf", () => {
  it("marks both players of the Match of the Week", async () => {
    for (const id of [alice, bob]) {
      expect(await streamRelevanceOf(id, windowId)).toEqual({
        isMotwPlayer: true,
        isRecordedPlayer: false,
      });
    }
  });

  it("marks both players of a match held for a recording", async () => {
    for (const id of [carol, dave]) {
      expect(await streamRelevanceOf(id, windowId)).toEqual({
        isMotwPlayer: false,
        isRecordedPlayer: true,
      });
    }
  });

  it("leaves everyone else alone", async () => {
    expect(await streamRelevanceOf(outsider, windowId)).toEqual({
      isMotwPlayer: false,
      isRecordedPlayer: false,
    });
  });

  it("ignores a plain match of the same season", async () => {
    expect(plainMatch).toBeTruthy();
    const relevance = await streamRelevanceOf(outsider, windowId);
    expect(relevance.isMotwPlayer).toBe(false);
  });
});

describe("streamPlayersOfWindow", () => {
  it("is everyone the stream might show", async () => {
    const ids = await streamPlayersOfWindow(windowId);
    expect([...ids].sort()).toEqual([alice, bob, carol, dave].sort());
  });
});

describe("photo paths", () => {
  it("round-trips a path and clears it again", async () => {
    expect(await streamPhotoPathOf(alice)).toBeNull();
    await setStreamPhotoPath(alice, `${alice}/one.webp`);
    expect(await streamPhotoPathOf(alice)).toBe(`${alice}/one.webp`);

    const many = await streamPhotoPathsFor([alice, bob]);
    expect(many.get(alice)).toBe(`${alice}/one.webp`);
    expect(many.has(bob)).toBe(false);

    await setStreamPhotoPath(alice, null);
    expect(await streamPhotoPathOf(alice)).toBeNull();
    expect((await streamPhotoPathsFor([alice])).size).toBe(0);
  });

  it("is empty for an empty request", async () => {
    expect((await streamPhotoPathsFor([])).size).toBe(0);
  });
});
