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

// The write-time rules of the feature: nominating a candidate holds the match
// back (docs/plans/motw-candidates.md) and follows the recording gate, and the
// confirmation follows the round gate — the running Spieltag and every later
// one are open, past ones are settled. Re-confirming a finished week would
// flip spoiler protection back onto an already-public result and make Discord
// repost that week, so the gate is tested from both sides. The other invariant
// checked here: nothing in this feature ever ends an embargo, so a match that
// stops being the confirmed MotW goes back under a hold.

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

const {
  confirmMotw,
  dropMotwCandidate,
  nominateMotwCandidate,
  revokeMotw,
  saveMotwYoutubeUrl,
} = await import("./actions");
const { motwForWindow } = await import("./queries");
const { holdsForWindow } = await import("@/features/recordings/queries");

const alice = randomUUID();
const bob = randomUUID();
const carol = randomUUID();
const dave = randomUUID();
const staff = randomUUID();
let windowId: string;
// The seeded schedule runs rounds 1–4 with round 2 as today's Spieltag.
const matchByRound = new Map<number, string>();
// The second pairing of round 2.
let backup: string;

beforeAll(async () => {
  for (const id of [alice, bob, carol, dave, staff]) {
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
  // A second pairing in the running Spieltag, so a week can have more than one
  // candidate — which is what the whole feature is about.
  const [second] = await db
    .insert(matches)
    .values({
      subDivisionId: subDivision.id,
      round: 2,
      playerAId: carol,
      playerBId: dave,
    })
    .returning({ id: matches.id });
  backup = second.id;

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
  await db.execute(
    sql`delete from recording_holds where window_id = ${windowId}`,
  );
  await db.execute(
    sql`delete from match_results where match_id in (select id from matches where sub_division_id in (select id from sub_divisions where division_id in (select id from divisions where window_id = ${windowId})))`,
  );
});

afterAll(async () => {
  await db.execute(
    sql`delete from registration_windows where id = ${windowId}`,
  );
  for (const id of [alice, bob, carol, dave, staff]) {
    await db.execute(sql`delete from auth.users where id = ${id}`);
  }
});

describe("confirmMotw round gate", () => {
  it("confirms the running Spieltag", async () => {
    const result = await confirmMotw({
      matchId: matchByRound.get(2) as string,
    });
    expect(result).toEqual({ ok: true });
    expect(await motwForWindow(windowId)).toHaveLength(1);
  });

  it("confirms a Spieltag two weeks out", async () => {
    const result = await confirmMotw({
      matchId: matchByRound.get(4) as string,
    });
    expect(result).toEqual({ ok: true });
    expect((await motwForWindow(windowId))[0].round).toBe(4);
  });

  it("backfills a past Spieltag that was never confirmed", async () => {
    // A missed week stays open: deciding late is the normal case here.
    const result = await confirmMotw({
      matchId: matchByRound.get(1) as string,
    });
    expect(result).toEqual({ ok: true });
    expect((await motwForWindow(windowId))[0].round).toBe(1);
  });

  it("refuses to re-confirm a settled past Spieltag", async () => {
    await db.execute(sql`
      insert into motw_selections (window_id, round, match_id, selected_by_id)
      values (${windowId}, 1, ${matchByRound.get(1) as string}, ${staff})
    `);
    // Same round, and the round is settled — even the identical match is out.
    const result = await confirmMotw({
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
    const result = await confirmMotw({
      matchId: matchByRound.get(2) as string,
    });
    expect(result).toEqual({ ok: false, error: "Keine Berechtigung" });
  });
});

describe("revokeMotw round gate", () => {
  it("revokes a future Spieltag's confirmation", async () => {
    await confirmMotw({ matchId: matchByRound.get(3) as string });
    expect(await revokeMotw({ round: 3 })).toEqual({ ok: true });
    expect(await motwForWindow(windowId)).toHaveLength(0);
  });

  it("refuses to revoke a settled past Spieltag", async () => {
    // Written straight to the table: the action itself would not let this in.
    await db.execute(sql`
      insert into motw_selections (window_id, round, match_id, selected_by_id)
      values (${windowId}, 1, ${matchByRound.get(1) as string}, ${staff})
    `);
    const result = await revokeMotw({ round: 1 });
    expect(result.ok).toBe(false);
    expect(await motwForWindow(windowId)).toHaveLength(1);
  });
});

describe("nominateMotwCandidate", () => {
  const running = () => matchByRound.get(2) as string;

  it("holds the match back and marks it as Hauptmatch", async () => {
    const result = await nominateMotwCandidate({
      matchId: running(),
      role: "primary",
    });
    expect(result).toEqual({ ok: true });
    const holds = await holdsForWindow(windowId);
    expect(holds).toHaveLength(1);
    expect(holds[0]).toMatchObject({ matchId: running(), motwRole: "primary" });
  });

  it("keeps an existing recording hold and only adds the role", async () => {
    await db.execute(sql`
      insert into recording_holds (match_id, window_id, round, held_by_id)
      values (${running()}, ${windowId}, 2, ${staff})
    `);
    await nominateMotwCandidate({ matchId: running(), role: "backup" });
    const holds = await holdsForWindow(windowId);
    expect(holds).toHaveLength(1);
    expect(holds[0].motwRole).toBe("backup");
  });

  it("demotes the previous Hauptmatch of the round", async () => {
    await nominateMotwCandidate({ matchId: running(), role: "primary" });
    await nominateMotwCandidate({ matchId: backup, role: "primary" });
    const roles = new Map(
      (await holdsForWindow(windowId)).map((h) => [h.matchId, h.motwRole]),
    );
    expect(roles.get(running())).toBe("backup");
    expect(roles.get(backup)).toBe("primary");
  });

  it("refuses a reported match, whose result is already public", async () => {
    await db.insert(matchResults).values({
      matchId: running(),
      outcome: "free_win",
      winnerId: alice,
      freeWinReason: "x",
      reportedById: alice,
    });
    const result = await nominateMotwCandidate({
      matchId: running(),
      role: "primary",
    });
    expect(result.ok).toBe(false);
    expect(await holdsForWindow(windowId)).toHaveLength(0);
  });

  it("refuses a past Spieltag, where a hold would be stale at once", async () => {
    const result = await nominateMotwCandidate({
      matchId: matchByRound.get(1) as string,
      role: "primary",
    });
    expect(result.ok).toBe(false);
    expect(await holdsForWindow(windowId)).toHaveLength(0);
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
    const result = await nominateMotwCandidate({
      matchId: running(),
      role: "primary",
    });
    expect(result).toEqual({ ok: false, error: "Keine Berechtigung" });
  });
});

describe("dropMotwCandidate", () => {
  it("takes the match out of the race but keeps it withheld", async () => {
    // The MotW workspace never ends an embargo: releasing is an Aufnahmen
    // decision, so the hold survives the drop.
    const matchId = matchByRound.get(2) as string;
    await nominateMotwCandidate({ matchId, role: "primary" });
    expect(await dropMotwCandidate({ matchId })).toEqual({ ok: true });
    const holds = await holdsForWindow(windowId);
    expect(holds).toHaveLength(1);
    expect(holds[0].motwRole).toBeNull();
  });

  it("refuses a match that is not a candidate", async () => {
    const result = await dropMotwCandidate({
      matchId: matchByRound.get(3) as string,
    });
    expect(result.ok).toBe(false);
  });
});

describe("confirmMotw and the holds", () => {
  it("frees the confirmed match and leaves the backups held", async () => {
    const matchId = matchByRound.get(2) as string;
    await nominateMotwCandidate({ matchId, role: "primary" });
    await nominateMotwCandidate({ matchId: backup, role: "backup" });

    expect(await confirmMotw({ matchId })).toEqual({ ok: true });
    // The MotW embargo (until the VOD) takes over from the recording one, so
    // the confirmed match needs no hold; the backup keeps its own.
    const holds = await holdsForWindow(windowId);
    expect(holds.map((h) => h.matchId)).toEqual([backup]);
    expect(holds[0].motwRole).toBe("backup");
  });

  it("puts a replaced confirmation back under a hold", async () => {
    const matchId = matchByRound.get(2) as string;
    await confirmMotw({ matchId });
    await confirmMotw({ matchId: backup });

    const holds = await holdsForWindow(windowId);
    expect(holds.map((h) => [h.matchId, h.motwRole])).toEqual([
      [matchId, "backup"],
    ]);
    expect((await motwForWindow(windowId))[0].matchId).toBe(backup);
  });

  it("puts a revoked confirmation back under a hold", async () => {
    const matchId = matchByRound.get(2) as string;
    await confirmMotw({ matchId });
    expect(await revokeMotw({ round: 2 })).toEqual({ ok: true });

    const holds = await holdsForWindow(windowId);
    expect(holds.map((h) => [h.matchId, h.motwRole])).toEqual([
      [matchId, "backup"],
    ]);
    expect(await motwForWindow(windowId)).toHaveLength(0);
  });
});

describe("saveMotwYoutubeUrl Discord mirror", () => {
  it("posts the VOD announcement before the (now public) result", async () => {
    await confirmMotw({ matchId: matchByRound.get(2) as string });
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
