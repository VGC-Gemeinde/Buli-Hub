import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  discordSeasonResources,
  divisions,
  placements,
  profiles,
  subDivisions,
} from "@/db/schema";
import { createWindow } from "@/features/staff/queries";
import { db } from "@/lib/db";
import {
  getSyncState,
  listPlacedPlayers,
  listSeasonGroups,
  recordResource,
  saveSyncState,
  trackedResources,
} from "./queries";

const alice = randomUUID();
const bob = randomUUID();
const carol = randomUUID();
const dave = randomUUID();
let windowId: string;
let sd1a: string;
let sd1b: string;

beforeAll(async () => {
  // alice: full identity; bob: no Discord id in the metadata; carol: dropped;
  // dave: placed in a division but not (yet) in a sub-division.
  await db.execute(
    sql`insert into auth.users (id, raw_user_meta_data) values
      (${alice}, ${JSON.stringify({ provider_id: "100000000000000001" })}::jsonb),
      (${bob}, '{}'::jsonb),
      (${carol}, ${JSON.stringify({ provider_id: "100000000000000003" })}::jsonb),
      (${dave}, ${JSON.stringify({ provider_id: "100000000000000004" })}::jsonb)`,
  );
  await db.insert(profiles).values([
    { userId: alice, displayName: "Alice", username: "alice" },
    { userId: bob, displayName: null, username: "bob" },
  ]);
  await createWindow(new Date("2026-06-30T18:00:00Z"), alice, 1);
  const rows = await db.execute<{ id: string }>(
    sql`select id from registration_windows where opened_by = ${alice}`,
  );
  windowId = rows[0].id;

  const [division] = await db
    .insert(divisions)
    .values({ windowId, tier: 1 })
    .returning({ id: divisions.id });
  const groups = await db
    .insert(subDivisions)
    .values([
      { divisionId: division.id, position: 1 },
      { divisionId: division.id, position: 0 },
    ])
    .returning({ id: subDivisions.id, position: subDivisions.position });
  sd1a = groups.find((g) => g.position === 0)?.id as string;
  sd1b = groups.find((g) => g.position === 1)?.id as string;
  await db.insert(placements).values([
    { windowId, userId: alice, divisionId: division.id, subDivisionId: sd1a },
    { windowId, userId: bob, divisionId: division.id, subDivisionId: sd1b },
    {
      windowId,
      userId: carol,
      divisionId: division.id,
      subDivisionId: sd1a,
      droppedAt: new Date(),
    },
    { windowId, userId: dave, divisionId: division.id },
  ]);
});

afterAll(async () => {
  await db.execute(
    sql`delete from registration_windows where id = ${windowId}`,
  );
  for (const id of [alice, bob, carol, dave]) {
    await db.execute(sql`delete from profiles where user_id = ${id}`);
    await db.execute(sql`delete from auth.users where id = ${id}`);
  }
});

describe("listSeasonGroups", () => {
  it("lists the sub-divisions by tier and position", async () => {
    expect(await listSeasonGroups(windowId)).toEqual([
      { subDivisionId: sd1a, tier: 1, position: 0 },
      { subDivisionId: sd1b, tier: 1, position: 1 },
    ]);
  });
});

describe("listPlacedPlayers", () => {
  it("returns active grouped players with name and Discord id", async () => {
    const players = await listPlacedPlayers(windowId);
    expect(players.map((p) => p.userId).sort()).toEqual([alice, bob].sort());
    expect(players.find((p) => p.userId === alice)).toEqual({
      userId: alice,
      name: "Alice",
      discordId: "100000000000000001",
      subDivisionId: sd1a,
    });
    // No Discord id in the metadata → null, the plan skips them by name.
    expect(players.find((p) => p.userId === bob)).toEqual({
      userId: bob,
      name: "bob",
      discordId: null,
      subDivisionId: sd1b,
    });
  });
});

describe("resources", () => {
  it("records, re-points and lists tracked resources per window", async () => {
    await recordResource({
      windowId,
      subDivisionId: sd1a,
      kind: "group_role",
      discordId: "r-1",
    });
    await recordResource({
      windowId,
      subDivisionId: sd1a,
      kind: "group_channel",
      discordId: "c-1",
    });
    // The role was recreated: same (sub-division, kind), new id.
    await recordResource({
      windowId,
      subDivisionId: sd1a,
      kind: "group_role",
      discordId: "r-2",
    });
    expect(await trackedResources(windowId)).toEqual(
      expect.arrayContaining([
        { subDivisionId: sd1a, kind: "group_role", discordId: "r-2" },
        { subDivisionId: sd1a, kind: "group_channel", discordId: "c-1" },
      ]),
    );
    expect(await trackedResources(windowId)).toHaveLength(2);
  });

  it("dies with its sub-division", async () => {
    await db.insert(discordSeasonResources).values({
      windowId,
      subDivisionId: sd1b,
      kind: "group_role",
      discordId: "r-1b",
    });
    await db.execute(sql`delete from sub_divisions where id = ${sd1b}`);
    expect(
      (await trackedResources(windowId)).some((r) => r.subDivisionId === sd1b),
    ).toBe(false);
  });
});

describe("sync state", () => {
  it("is null before a run, then the last run's report", async () => {
    expect(await getSyncState(windowId)).toBeNull();
    const report = {
      groupsReady: 1,
      groupsTotal: 2,
      playersReady: 1,
      playersTotal: 2,
      skipped: [{ name: "bob", reason: "no_discord_id" as const }],
      error: null,
    };
    await saveSyncState(windowId, new Date("2026-09-06T10:00:00Z"), report);
    await saveSyncState(windowId, new Date("2026-09-06T10:15:00Z"), {
      ...report,
      groupsReady: 2,
    });
    expect(await getSyncState(windowId)).toEqual({
      ranAt: new Date("2026-09-06T10:15:00Z"),
      report: { ...report, groupsReady: 2 },
    });
  });

  it("reads an unparseable stored report as no state", async () => {
    await db.execute(
      sql`update discord_season_sync_state set report = '{"bogus": true}'::jsonb where window_id = ${windowId}`,
    );
    expect(await getSyncState(windowId)).toBeNull();
  });
});
