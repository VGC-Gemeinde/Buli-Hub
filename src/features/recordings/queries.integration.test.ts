import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { divisions, matches, subDivisions } from "@/db/schema";
import { createWindow } from "@/features/staff/queries";
import { db } from "@/lib/db";
import { deleteHold, holdsForWindow, insertHold, isHeld } from "./queries";

const alice = randomUUID();
const bob = randomUUID();
const staff = randomUUID();
let windowId: string;
let matchR1: string;
let matchR2: string;

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
        playerAId: bob,
        playerBId: alice,
      },
    ])
    .returning({ id: matches.id, round: matches.round });
  matchR1 = inserted.find((m) => m.round === 1)?.id as string;
  matchR2 = inserted.find((m) => m.round === 2)?.id as string;
});

afterAll(async () => {
  await db.execute(
    sql`delete from registration_windows where id = ${windowId}`,
  );
  for (const id of [alice, bob, staff]) {
    await db.execute(sql`delete from auth.users where id = ${id}`);
  }
});

describe("recording holds", () => {
  it("starts empty", async () => {
    expect(await holdsForWindow(windowId)).toEqual([]);
    expect(await isHeld(matchR1)).toBe(false);
  });

  it("holds a match once, lists it by round, and releases it", async () => {
    await insertHold({ matchId: matchR2, windowId, round: 2, staffId: staff });
    await insertHold({ matchId: matchR1, windowId, round: 1, staffId: staff });
    // A second hold on the same match is a no-op, not an error.
    await insertHold({ matchId: matchR1, windowId, round: 1, staffId: staff });

    const holds = await holdsForWindow(windowId);
    expect(holds.map((h) => [h.matchId, h.round, h.heldById])).toEqual([
      [matchR1, 1, staff],
      [matchR2, 2, staff],
    ]);
    expect(await isHeld(matchR1)).toBe(true);

    expect(await deleteHold(matchR1)).toBe(true);
    expect(await deleteHold(matchR1)).toBe(false);
    expect(await isHeld(matchR1)).toBe(false);
    expect((await holdsForWindow(windowId)).map((h) => h.matchId)).toEqual([
      matchR2,
    ]);
  });

  it("dies with its match", async () => {
    await db.execute(sql`delete from matches where id = ${matchR2}`);
    expect(await holdsForWindow(windowId)).toEqual([]);
  });
});
