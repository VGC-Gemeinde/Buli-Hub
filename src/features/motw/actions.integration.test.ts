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
import { divisions, matches, subDivisions } from "@/db/schema";
import { createWindow } from "@/features/staff/queries";
import { db } from "@/lib/db";

// The round gate is the one domain rule this feature enforces at write time:
// the running Spieltag and every later one are open, past ones are settled.
// Re-picking a finished week would flip spoiler protection back onto an
// already-public result and make Discord repost that week — so the gate is
// tested from both sides.

const { currentUserMock } = vi.hoisted(() => ({ currentUserMock: vi.fn() }));
vi.mock("@/features/roles/guard", () => ({ currentUser: currentUserMock }));
// revalidatePath needs the request-scoped store Next sets up per render, which
// a test runner has no equivalent of.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// Discord is a downstream mirror, not part of the gate.
const { syncResultPostMock, syncMotwVodPostMock } = vi.hoisted(() => ({
  syncResultPostMock: vi.fn(),
  syncMotwVodPostMock: vi.fn(),
}));
vi.mock("@/features/discord-posts/sync", () => ({
  syncResultPost: syncResultPostMock,
  syncMotwVodPost: syncMotwVodPostMock,
}));

const { removeMotw, saveMotwYoutubeUrl, selectMotw } = await import(
  "./actions"
);
const { motwForWindow } = await import("./queries");

const alice = randomUUID();
const bob = randomUUID();
const staff = randomUUID();
let windowId: string;
// The seeded schedule runs rounds 1–4 with round 2 as today's Spieltag.
const matchByRound = new Map<number, string>();

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

  // Matchdays anchored on today, so `currentMatchday` resolves to round 2
  // whenever the suite runs.
  await db.execute(sql`
    insert into matchdays (window_id, round, starts_on, ends_on) values
      (${windowId}, 1, current_date - 14, current_date - 8),
      (${windowId}, 2, current_date - 3, current_date + 3),
      (${windowId}, 3, current_date + 4, current_date + 10),
      (${windowId}, 4, current_date + 11, current_date + 17)
  `);

  const inserted = await db
    .insert(matches)
    .values(
      [1, 2, 3, 4].map((round) => ({
        subDivisionId: subDivision.id,
        round,
        playerAId: alice,
        playerBId: bob,
      })),
    )
    .returning({ id: matches.id, round: matches.round });
  for (const row of inserted) {
    matchByRound.set(row.round, row.id);
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
    sql`delete from motw_selections where window_id = ${windowId}`,
  );
});

afterAll(async () => {
  await db.execute(
    sql`delete from registration_windows where id = ${windowId}`,
  );
  for (const id of [alice, bob, staff]) {
    await db.execute(sql`delete from auth.users where id = ${id}`);
  }
});

describe("selectMotw round gate", () => {
  it("picks the running Spieltag", async () => {
    const result = await selectMotw({
      matchId: matchByRound.get(2) as string,
    });
    expect(result).toEqual({ ok: true });
    expect(await motwForWindow(windowId)).toHaveLength(1);
  });

  it("picks a Spieltag two weeks out", async () => {
    const result = await selectMotw({
      matchId: matchByRound.get(4) as string,
    });
    expect(result).toEqual({ ok: true });
    expect((await motwForWindow(windowId))[0].round).toBe(4);
  });

  it("backfills a past Spieltag that was never picked", async () => {
    // A missed week stays open — typically it gets a pick once a VOD turns up.
    const result = await selectMotw({
      matchId: matchByRound.get(1) as string,
    });
    expect(result).toEqual({ ok: true });
    expect((await motwForWindow(windowId))[0].round).toBe(1);
  });

  it("refuses to re-pick a past Spieltag that already has one", async () => {
    await db.execute(sql`
      insert into motw_selections (window_id, round, match_id, selected_by_id)
      values (${windowId}, 1, ${matchByRound.get(1) as string}, ${staff})
    `);
    // Same round, and the round is settled — even the identical match is out.
    const result = await selectMotw({
      matchId: matchByRound.get(1) as string,
    });
    expect(result.ok).toBe(false);
    expect(await motwForWindow(windowId)).toHaveLength(1);
  });

  it("rejects a caller without staff rights", async () => {
    currentUserMock.mockResolvedValueOnce({
      userId: alice,
      discordId: "2",
      role: "player",
      displayName: "Alice",
      username: "alice",
      avatarUrl: null,
    });
    const result = await selectMotw({
      matchId: matchByRound.get(2) as string,
    });
    expect(result).toEqual({ ok: false, error: "Keine Berechtigung" });
  });
});

describe("removeMotw round gate", () => {
  it("clears a future Spieltag's pick", async () => {
    await selectMotw({ matchId: matchByRound.get(3) as string });
    expect(await removeMotw({ round: 3 })).toEqual({ ok: true });
    expect(await motwForWindow(windowId)).toHaveLength(0);
  });

  it("refuses to clear a past Spieltag's pick", async () => {
    // Written straight to the table: the action itself would not let this in.
    await db.execute(sql`
      insert into motw_selections (window_id, round, match_id, selected_by_id)
      values (${windowId}, 1, ${matchByRound.get(1) as string}, ${staff})
    `);
    const result = await removeMotw({ round: 1 });
    expect(result.ok).toBe(false);
    expect(await motwForWindow(windowId)).toHaveLength(1);
  });
});

describe("saveMotwYoutubeUrl Discord mirror", () => {
  it("posts the VOD announcement before the (now public) result", async () => {
    await selectMotw({ matchId: matchByRound.get(2) as string });
    syncResultPostMock.mockClear();
    syncMotwVodPostMock.mockClear();

    const result = await saveMotwYoutubeUrl({
      round: 2,
      url: "https://youtu.be/vgc-bundesliga",
    });
    expect(result).toEqual({ ok: true });
    const matchId = matchByRound.get(2) as string;
    expect(syncMotwVodPostMock).toHaveBeenCalledWith(matchId);
    expect(syncResultPostMock).toHaveBeenCalledWith(matchId);
    // The link ends the result embargo; the community meets the VOD first.
    expect(syncMotwVodPostMock.mock.invocationCallOrder[0]).toBeLessThan(
      syncResultPostMock.mock.invocationCallOrder[0],
    );
  });
});
