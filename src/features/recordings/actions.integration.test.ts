import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { divisions, matches, matchResults, subDivisions } from "@/db/schema";
import { createWindow } from "@/features/staff/queries";
import { db } from "@/lib/db";

// The write-time rules: only an open match of the current or a later
// Spieltag can be held (a hold on a public result would retract it), and a
// release always converges the Discord mirror.

const { currentUserMock } = vi.hoisted(() => ({ currentUserMock: vi.fn() }));
vi.mock("@/features/roles/guard", () => ({ currentUser: currentUserMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const { syncResultPostMock } = vi.hoisted(() => ({
  syncResultPostMock: vi.fn(),
}));
vi.mock("@/features/discord-posts/sync", () => ({
  syncResultPost: syncResultPostMock,
}));

const { holdMatch, releaseHold } = await import("./actions");
const { holdsForWindow } = await import("./queries");

const alice = randomUUID();
const bob = randomUUID();
const carol = randomUUID();
const staff = randomUUID();
let windowId: string;
// Rounds 1–4 with round 2 as today's Spieltag.
const matchByRound = new Map<number, string>();
let bye: string;

beforeAll(async () => {
  for (const id of [alice, bob, carol, staff]) {
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
  await db.execute(sql`
    insert into matchdays (window_id, round, starts_on, ends_on) values
      (${windowId}, 1, current_date - 14, current_date - 8),
      (${windowId}, 2, current_date - 3, current_date + 3),
      (${windowId}, 3, current_date + 4, current_date + 10),
      (${windowId}, 4, current_date + 11, current_date + 17)
  `);
  const inserted = await db
    .insert(matches)
    .values([
      ...[1, 2, 3, 4].map((round) => ({
        subDivisionId: subDivision.id,
        round,
        playerAId: alice,
        playerBId: bob,
      })),
      {
        subDivisionId: subDivision.id,
        round: 2,
        playerAId: carol,
        playerBId: null,
      },
    ])
    .returning({
      id: matches.id,
      round: matches.round,
      playerBId: matches.playerBId,
    });
  for (const row of inserted) {
    if (row.playerBId === null) {
      bye = row.id;
    } else {
      matchByRound.set(row.round, row.id);
    }
  }

  currentUserMock.mockResolvedValue({
    userId: staff,
    discordId: "1",
    role: "staff",
    displayName: "Orga",
    username: "orga",
    avatarUrl: null,
  });
});

afterEach(async () => {
  await db.execute(
    sql`delete from recording_holds where window_id = ${windowId}`,
  );
  await db.execute(
    sql`delete from match_results where match_id in (select id from matches where sub_division_id in (select id from sub_divisions where division_id in (select id from divisions where window_id = ${windowId})))`,
  );
  syncResultPostMock.mockClear();
});

afterAll(async () => {
  await db.execute(
    sql`delete from registration_windows where id = ${windowId}`,
  );
  for (const id of [alice, bob, carol, staff]) {
    await db.execute(sql`delete from auth.users where id = ${id}`);
  }
});

describe("holdMatch", () => {
  it("holds an open match of the running Spieltag and of a later one", async () => {
    expect(await holdMatch({ matchId: matchByRound.get(2) as string })).toEqual(
      { ok: true },
    );
    expect(await holdMatch({ matchId: matchByRound.get(4) as string })).toEqual(
      { ok: true },
    );
    expect((await holdsForWindow(windowId)).map((h) => h.round)).toEqual([
      2, 4,
    ]);
    expect(syncResultPostMock).toHaveBeenCalledTimes(2);
  });

  it("rejects a past Spieltag", async () => {
    const result = await holdMatch({ matchId: matchByRound.get(1) as string });
    expect(result.ok).toBe(false);
    expect(await holdsForWindow(windowId)).toEqual([]);
  });

  it("rejects a reported match", async () => {
    const matchId = matchByRound.get(3) as string;
    await db.insert(matchResults).values({
      matchId,
      outcome: "free_win",
      winnerId: alice,
      freeWinReason: "x",
      reportedById: alice,
    });
    const result = await holdMatch({ matchId });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/gemeldet/);
    }
  });

  it("rejects a bye, an unknown match and a second hold", async () => {
    expect((await holdMatch({ matchId: bye })).ok).toBe(false);
    expect((await holdMatch({ matchId: randomUUID() })).ok).toBe(false);
    await holdMatch({ matchId: matchByRound.get(2) as string });
    const again = await holdMatch({ matchId: matchByRound.get(2) as string });
    expect(again.ok).toBe(false);
  });

  it("needs staff", async () => {
    currentUserMock.mockResolvedValueOnce({
      userId: alice,
      discordId: "2",
      role: "player",
      displayName: "Alice",
      username: "alice",
      avatarUrl: null,
    });
    expect(
      (await holdMatch({ matchId: matchByRound.get(2) as string })).ok,
    ).toBe(false);
  });
});

describe("releaseHold", () => {
  it("removes the hold and converges the result post", async () => {
    const matchId = matchByRound.get(2) as string;
    await holdMatch({ matchId });
    syncResultPostMock.mockClear();

    expect(await releaseHold({ matchId })).toEqual({ ok: true });
    expect(await holdsForWindow(windowId)).toEqual([]);
    expect(syncResultPostMock).toHaveBeenCalledWith(matchId);
  });

  it("reports a match that is not held", async () => {
    const result = await releaseHold({
      matchId: matchByRound.get(3) as string,
    });
    expect(result.ok).toBe(false);
    expect(syncResultPostMock).not.toHaveBeenCalled();
  });
});
