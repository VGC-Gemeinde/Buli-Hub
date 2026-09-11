import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { divisions, matches, subDivisions } from "@/db/schema";
import { createWindow } from "@/features/staff/queries";
import { db } from "@/lib/db";
import {
  clearMotwRole,
  deleteHold,
  holdsForWindow,
  insertHold,
  isHeld,
  nominateHold,
} from "./queries";

const alice = randomUUID();
const bob = randomUUID();
const staff = randomUUID();
let windowId: string;
let matchR1: string;
let matchR2: string;
// Two pairings of the same Spieltag, for the Hauptkandidat rule.
let candA: string;
let candB: string;

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

  const candidates = await db
    .insert(matches)
    .values([
      {
        subDivisionId: subDivision.id,
        round: 3,
        playerAId: alice,
        playerBId: bob,
      },
      {
        subDivisionId: subDivision.id,
        round: 3,
        playerAId: bob,
        playerBId: alice,
      },
    ])
    .returning({ id: matches.id });
  candA = candidates[0].id;
  candB = candidates[1].id;
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

// A Match-of-the-Week candidate is a hold with a role
// (docs/plans/motw-candidates.md), so both live in one table and one query.
describe("MotW candidacy on a hold", () => {
  it("nominates, promotes and demotes within a Spieltag", async () => {
    await nominateHold({
      matchId: candA,
      windowId,
      round: 3,
      staffId: staff,
      role: "primary",
    });
    await nominateHold({
      matchId: candB,
      windowId,
      round: 3,
      staffId: staff,
      role: "backup",
    });
    const roles = async () =>
      new Map(
        (await holdsForWindow(windowId))
          .filter((h) => h.round === 3)
          .map((h) => [h.matchId, h.motwRole]),
      );
    expect(await roles()).toEqual(
      new Map([
        [candA, "primary"],
        [candB, "backup"],
      ]),
    );

    // Only one Hauptkandidat per Spieltag: promoting the backup demotes the
    // other in the same write, which is what the partial unique index needs.
    await nominateHold({
      matchId: candB,
      windowId,
      round: 3,
      staffId: staff,
      role: "primary",
    });
    expect(await roles()).toEqual(
      new Map([
        [candA, "backup"],
        [candB, "primary"],
      ]),
    );
  });

  it("clears the role without releasing the match", async () => {
    expect(await clearMotwRole(candA)).toBe(true);
    // Still held: the match stays withheld as an ordinary recording.
    expect(await isHeld(candA)).toBe(true);
    expect(
      (await holdsForWindow(windowId)).find((h) => h.matchId === candA)
        ?.motwRole,
    ).toBeNull();
    // Nothing to clear the second time around.
    expect(await clearMotwRole(candA)).toBe(false);
  });

  it("refuses a second Hauptkandidat written past the helper", async () => {
    await expect(
      db.execute(sql`
        update recording_holds set motw_role = 'primary' where match_id = ${candA}
      `),
    ).rejects.toThrow();
  });

  it("loses the candidacy with the hold", async () => {
    expect(await deleteHold(candB)).toBe(true);
    expect(
      (await holdsForWindow(windowId)).map((h) => h.matchId),
    ).not.toContain(candB);
  });
});
