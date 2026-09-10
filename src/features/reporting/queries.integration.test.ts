import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  divisions,
  matchdays,
  matches,
  motwSelections,
  placements,
  profiles,
  seedings,
  subDivisions,
} from "@/db/schema";
import { createWindow } from "@/features/staff/queries";
import { db } from "@/lib/db";
import {
  confirmFreeWin,
  deleteMatchResult,
  divisionGroups,
  getMatchForReport,
  getMatchResult,
  groupResults,
  listStaffAndAdmins,
  matchOpenDispute,
  matchResolvedDispute,
  openDispute,
  replaceResult,
  resolveDisputeWithChange,
  saveResult,
  subDivisionResults,
  upsertStaffResult,
  windowMatchOverview,
  windowResolvedDisputes,
} from "./queries";
import { computeStandings, divisionStandings } from "./standings";

// The two sheets a normal result always carries, keyed to its participants.
const sheetsFor = (a: string, b: string) => [
  { playerId: a, source: "pokepaste" as const, ots: "Garchomp @ Life Orb" },
  { playerId: b, source: "import" as const, ots: "Whimsicott @ Occa Berry" },
];

const alice = randomUUID();
const bob = randomUUID();
const carol = randomUUID();
const staff = randomUUID();
let windowId: string;
let subDivisionId: string;
let matchAB: string; // alice vs bob
let matchBye: string; // carol bye

beforeAll(async () => {
  for (const id of [alice, bob, carol, staff]) {
    await db.execute(sql`insert into auth.users (id) values (${id})`);
  }
  await db.insert(profiles).values([
    { userId: alice, displayName: "Alice" },
    { userId: bob, displayName: "Bob" },
    { userId: carol, displayName: "Carol" },
    { userId: staff, displayName: "Staffi", role: "staff" },
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
  const [subDivision] = await db
    .insert(subDivisions)
    .values({ divisionId: division.id, position: 0 })
    .returning({ id: subDivisions.id });
  subDivisionId = subDivision.id;
  await db.insert(placements).values(
    [alice, bob, carol].map((userId) => ({
      windowId,
      userId,
      divisionId: division.id,
      subDivisionId,
    })),
  );
  await db.insert(matchdays).values({
    windowId,
    round: 1,
    startsOn: "2026-07-01",
    endsOn: "2026-07-07",
  });

  const inserted = await db
    .insert(matches)
    .values([
      { subDivisionId, round: 1, playerAId: alice, playerBId: bob },
      { subDivisionId, round: 1, playerAId: carol, playerBId: null },
    ])
    .returning({ id: matches.id, playerBId: matches.playerBId });
  matchAB = inserted.find((m) => m.playerBId !== null)?.id ?? "";
  matchBye = inserted.find((m) => m.playerBId === null)?.id ?? "";
});

afterAll(async () => {
  await db.execute(
    sql`delete from registration_windows where id = ${windowId}`,
  );
  for (const id of [alice, bob, carol, staff]) {
    await db.execute(sql`delete from auth.users where id = ${id}`);
  }
});

describe("getMatchForReport", () => {
  it("returns both identities for a real pairing", async () => {
    const match = await getMatchForReport(matchAB);
    expect(match?.playerA.name).toBe("Alice");
    expect(match?.playerB?.name).toBe("Bob");
  });
  it("reports a bye's playerB as null", async () => {
    const match = await getMatchForReport(matchBye);
    expect(match?.playerB).toBeNull();
  });

  it("derives proofRequired from the season's replay rule", async () => {
    // No seeding row (defensive edge) → proof required.
    expect((await getMatchForReport(matchAB))?.proofRequired).toBe(true);

    // Rule covers tier 1 → this division-1 match needs proof.
    await db
      .insert(seedings)
      .values({ windowId, subDivisionSize: 8, replayRequiredTiers: 1 });
    expect((await getMatchForReport(matchAB))?.proofRequired).toBe(true);

    // Rule set to 0 → optional everywhere.
    await db
      .update(seedings)
      .set({ replayRequiredTiers: 0 })
      .where(eq(seedings.windowId, windowId));
    expect((await getMatchForReport(matchAB))?.proofRequired).toBe(false);
  });

  it("never requires proof for the Match of the Week", async () => {
    // Rule covers tier 1 again, so this match would need replays ...
    await db
      .update(seedings)
      .set({ replayRequiredTiers: 1 })
      .where(eq(seedings.windowId, windowId));
    expect((await getMatchForReport(matchAB))?.proofRequired).toBe(true);
    // ... until it is picked as the MotW: recorded on stream, no replay duty.
    await db
      .insert(motwSelections)
      .values({ windowId, round: 1, matchId: matchAB, selectedById: staff });
    expect((await getMatchForReport(matchAB))?.proofRequired).toBe(false);
    await db.delete(motwSelections).where(eq(motwSelections.matchId, matchAB));
    expect((await getMatchForReport(matchAB))?.proofRequired).toBe(true);
  });
});

describe("saveResult + getMatchResult", () => {
  it("round-trips a normal 2–1 result with games", async () => {
    await saveResult(
      matchAB,
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
      sheetsFor(alice, bob),
      alice,
    );
    const stored = await getMatchResult(matchAB);
    expect(stored?.outcome).toBe("normal");
    expect(stored?.winnerId).toBe(alice);
    expect(stored?.games.map((g) => g.winnerId)).toEqual([alice, bob, alice]);
    expect(stored?.confirmedAt).toBeNull();
    // By player, not by row order: the query has no ORDER BY, and every
    // consumer looks a sheet up by player id, so the order carries no
    // meaning. Asserting it made this test fail at random.
    const sources = new Map(
      stored?.sheets.map((sheet) => [sheet.playerId, sheet.source]),
    );
    expect(sources.get(alice)).toBe("pokepaste");
    expect(sources.get(bob)).toBe("import");
    expect(sources.size).toBe(2);
  });

  it("keeps the paste id when a sheet is corrected", async () => {
    // The whole point of upserting on (match_id, player_id): a link already in
    // a Discord message or a screenshot has to survive a correction. Runs on
    // its own match so it cannot disturb the shared fixture.
    const throwaway = randomUUID();
    await db.execute(sql`insert into auth.users (id) values (${throwaway})`);
    const [m] = await db
      .insert(matches)
      .values({ subDivisionId, round: 1, playerAId: alice, playerBId: bob })
      .returning({ id: matches.id });
    const normal = {
      outcome: "normal" as const,
      winnerId: alice,
      platform: "showdown" as const,
      videoUrl: null,
      freeWinReason: null,
      discussedWithId: null,
    };
    const games = [
      { gameNumber: 1, winnerId: alice, replayUrl: null },
      { gameNumber: 2, winnerId: alice, replayUrl: null },
    ];
    await saveResult(m.id, normal, games, sheetsFor(alice, bob), alice);

    const idBefore = (await getMatchResult(m.id))?.sheets.find(
      (sheet) => sheet.playerId === alice,
    )?.id;
    expect(idBefore).toBeTruthy();

    await replaceResult({
      matchId: m.id,
      result: normal,
      games,
      sheets: [
        { playerId: alice, source: "import", ots: "Kingambit @ Chople Berry" },
        { playerId: bob, source: "import", ots: "Whimsicott @ Occa Berry" },
      ],
      staffId: staff,
    });

    const sheetAfter = (await getMatchResult(m.id))?.sheets.find(
      (sheet) => sheet.playerId === alice,
    );
    expect(sheetAfter?.id).toBe(idBefore);
    expect(sheetAfter?.ots).toBe("Kingambit @ Chople Berry");
    expect(sheetAfter?.source).toBe("import");

    await db.execute(sql`delete from matches where id = ${m.id}`);
    await db.execute(sql`delete from auth.users where id = ${throwaway}`);
  });

  it("drops the sheets when a result becomes a free win", async () => {
    // A free win has no games and no teams. Leaving the pastes behind would
    // publish sheets for a match the standings treat as unplayed.
    const throwaway = randomUUID();
    await db.execute(sql`insert into auth.users (id) values (${throwaway})`);
    const [m] = await db
      .insert(matches)
      .values({ subDivisionId, round: 1, playerAId: alice, playerBId: bob })
      .returning({ id: matches.id });
    await saveResult(
      m.id,
      {
        outcome: "normal",
        winnerId: alice,
        platform: "showdown",
        videoUrl: null,
        freeWinReason: null,
        discussedWithId: null,
      },
      [
        { gameNumber: 1, winnerId: alice, replayUrl: null },
        { gameNumber: 2, winnerId: alice, replayUrl: null },
      ],
      sheetsFor(alice, bob),
      alice,
    );
    expect((await getMatchResult(m.id))?.sheets).toHaveLength(2);

    await upsertStaffResult({
      matchId: m.id,
      outcome: "free_win",
      winnerId: alice,
      freeWinReason: "Gegner nicht erschienen",
      staffId: staff,
    });
    expect((await getMatchResult(m.id))?.sheets).toEqual([]);

    await db.execute(sql`delete from matches where id = ${m.id}`);
    await db.execute(sql`delete from auth.users where id = ${throwaway}`);
  });

  it("feeds computeStandings via groupResults (bye + reported)", async () => {
    const rows = await computeStandings({
      roster: [
        { userId: alice, name: "Alice", avatarUrl: null },
        { userId: bob, name: "Bob", avatarUrl: null },
        { userId: carol, name: "Carol", avatarUrl: null },
      ],
      results: await groupResults(subDivisionId),
    });
    expect(rows.find((r) => r.userId === alice)).toMatchObject({
      wins: 1,
      points: 3,
    });
    expect(rows.find((r) => r.userId === bob)?.losses).toBe(1);
    expect(rows.find((r) => r.userId === carol)).toMatchObject({
      wins: 0,
      losses: 0,
    }); // bye counts for nobody
  });

  it("exposes the result + games to the dashboard via subDivisionResults", async () => {
    const byMatch = await subDivisionResults(subDivisionId);
    expect(byMatch.get(matchAB)?.games).toHaveLength(3);
  });

  it("cascades: deleting the match removes result + games + sheets", async () => {
    const throwaway = randomUUID();
    await db.execute(sql`insert into auth.users (id) values (${throwaway})`);
    const [m] = await db
      .insert(matches)
      .values({ subDivisionId, round: 1, playerAId: alice, playerBId: bob })
      .returning({ id: matches.id });
    await saveResult(
      m.id,
      {
        outcome: "free_win",
        winnerId: alice,
        platform: null,
        videoUrl: null,
        freeWinReason: "no show",
        discussedWithId: staff,
      },
      [],
      [],
      alice,
    );
    expect(await getMatchResult(m.id)).not.toBeNull();
    await db.execute(sql`delete from matches where id = ${m.id}`);
    expect(await getMatchResult(m.id)).toBeNull();
    await db.execute(sql`delete from auth.users where id = ${throwaway}`);
  });
});

describe("listStaffAndAdmins", () => {
  it("includes staff/admin and excludes players", async () => {
    const list = await listStaffAndAdmins();
    const ids = list.map((s) => s.userId);
    expect(ids).toContain(staff);
    expect(ids).not.toContain(alice); // alice is a plain player (default role)
  });
});

describe("staff dashboard queries", () => {
  it("windowMatchOverview lists real pairings with identities, excludes byes", async () => {
    const rows = await windowMatchOverview(windowId);
    const ab = rows.find((r) => r.matchId === matchAB);
    expect(ab?.playerA.name).toBe("Alice");
    expect(ab?.playerB.name).toBe("Bob");
    expect(rows.find((r) => r.matchId === matchBye)).toBeUndefined();
  });

  it("upsertStaffResult awards a free win (confirmed) then reopen clears it", async () => {
    const [m] = await db
      .insert(matches)
      .values({ subDivisionId, round: 1, playerAId: alice, playerBId: bob })
      .returning({ id: matches.id });

    await upsertStaffResult({
      matchId: m.id,
      outcome: "free_win",
      winnerId: alice,
      freeWinReason: "opponent forfeited",
      staffId: staff,
    });
    const awarded = await getMatchResult(m.id);
    expect(awarded?.outcome).toBe("free_win");
    expect(awarded?.confirmedAt).not.toBeNull(); // staff award is confirmed
    expect(awarded?.reportedById).toBe(staff);

    await deleteMatchResult(m.id);
    expect(await getMatchResult(m.id)).toBeNull();
    await db.execute(sql`delete from matches where id = ${m.id}`);
  });

  it("upsertStaffResult over an existing result records corrected_by + clears games", async () => {
    const [m] = await db
      .insert(matches)
      .values({ subDivisionId, round: 1, playerAId: alice, playerBId: bob })
      .returning({ id: matches.id });
    await saveResult(
      m.id,
      {
        outcome: "normal",
        winnerId: alice,
        platform: "showdown",
        videoUrl: null,
        freeWinReason: null,
        discussedWithId: null,
      },
      [{ gameNumber: 1, winnerId: alice, replayUrl: "https://replay/1" }],
      sheetsFor(alice, bob),
      alice,
    );

    await upsertStaffResult({
      matchId: m.id,
      outcome: "double_loss",
      winnerId: null,
      freeWinReason: null,
      staffId: staff,
    });
    const corrected = await getMatchResult(m.id);
    expect(corrected?.outcome).toBe("double_loss");
    expect(corrected?.winnerId).toBeNull();
    expect(corrected?.games).toHaveLength(0); // games cleared
    await db.execute(sql`delete from matches where id = ${m.id}`);
  });

  it("confirmFreeWin sets the confirmation on a pending free win", async () => {
    const [m] = await db
      .insert(matches)
      .values({ subDivisionId, round: 1, playerAId: alice, playerBId: bob })
      .returning({ id: matches.id });
    await saveResult(
      m.id,
      {
        outcome: "free_win",
        winnerId: alice,
        platform: null,
        videoUrl: null,
        freeWinReason: "no show",
        discussedWithId: staff,
      },
      [],
      [],
      alice,
    );
    expect((await getMatchResult(m.id))?.confirmedAt).toBeNull();
    await confirmFreeWin(m.id, staff);
    expect((await getMatchResult(m.id))?.confirmedAt).not.toBeNull();
    await db.execute(sql`delete from matches where id = ${m.id}`);
  });
});

describe("disputes", () => {
  it("open → visible in overview + match; second open rejected; resolve clears it", async () => {
    const [m] = await db
      .insert(matches)
      .values({ subDivisionId, round: 1, playerAId: alice, playerBId: bob })
      .returning({ id: matches.id });
    await saveResult(
      m.id,
      {
        outcome: "normal",
        winnerId: alice,
        platform: "showdown",
        videoUrl: null,
        freeWinReason: null,
        discussedWithId: null,
      },
      [{ gameNumber: 1, winnerId: alice, replayUrl: "https://replay/1" }],
      sheetsFor(alice, bob),
      alice,
    );

    await openDispute({
      matchId: m.id,
      openedById: bob,
      reason: "Falscher Sieger",
    });
    expect((await matchOpenDispute(m.id))?.reason).toBe("Falscher Sieger");
    expect(
      (await windowMatchOverview(windowId)).find((r) => r.matchId === m.id)
        ?.dispute?.reason,
    ).toBe("Falscher Sieger");

    // Only one open dispute per match (partial unique index).
    await expect(
      openDispute({ matchId: m.id, openedById: alice, reason: "again" }),
    ).rejects.toThrow();

    await resolveDisputeWithChange({
      matchId: m.id,
      resolution: "upheld",
      note: "Ergebnis bestätigt",
      resolvedById: staff,
      change: { kind: "keep" },
    });
    expect(await matchOpenDispute(m.id)).toBeNull();
    const resolved = await windowResolvedDisputes(windowId);
    expect(resolved.find((d) => d.matchId === m.id)?.resolution).toBe("upheld");
    const decided = await matchResolvedDispute(m.id);
    expect(decided?.note).toBe("Ergebnis bestätigt");
    // The result is untouched by an upheld decision.
    expect((await getMatchResult(m.id))?.winnerId).toBe(alice);

    await db.execute(sql`delete from matches where id = ${m.id}`);
  });

  // The decision's two halves land together: whatever it does to the result and
  // the resolution itself are one transaction.
  it("replace: result rewritten and dispute closed as corrected", async () => {
    const [m] = await db
      .insert(matches)
      .values({ subDivisionId, round: 1, playerAId: alice, playerBId: bob })
      .returning({ id: matches.id });
    await saveResult(
      m.id,
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
        { gameNumber: 2, winnerId: alice, replayUrl: "https://replay/2" },
      ],
      sheetsFor(alice, bob),
      alice,
    );
    await openDispute({ matchId: m.id, openedById: bob, reason: "falsch" });

    await resolveDisputeWithChange({
      matchId: m.id,
      resolution: "corrected",
      note: "Replays zeigen Bob",
      resolvedById: staff,
      change: {
        kind: "replace",
        result: {
          outcome: "normal",
          winnerId: bob,
          platform: "showdown",
          videoUrl: null,
          freeWinReason: null,
          discussedWithId: null,
        },
        games: [
          { gameNumber: 1, winnerId: bob, replayUrl: "https://replay/1" },
          { gameNumber: 2, winnerId: bob, replayUrl: "https://replay/2" },
        ],
        sheets: sheetsFor(alice, bob),
      },
    });

    const result = await getMatchResult(m.id);
    expect(result?.winnerId).toBe(bob);
    expect(result?.games.map((g) => g.winnerId)).toEqual([bob, bob]);
    expect(await matchOpenDispute(m.id)).toBeNull();
    expect((await matchResolvedDispute(m.id))?.resolution).toBe("corrected");

    await db.execute(sql`delete from matches where id = ${m.id}`);
  });

  it("confirm: upholding a pending free win confirms it", async () => {
    const [m] = await db
      .insert(matches)
      .values({ subDivisionId, round: 1, playerAId: alice, playerBId: bob })
      .returning({ id: matches.id });
    await saveResult(
      m.id,
      {
        outcome: "free_win",
        winnerId: alice,
        platform: null,
        videoUrl: null,
        freeWinReason: "no show",
        discussedWithId: staff,
      },
      [],
      [],
      alice,
    );
    await openDispute({ matchId: m.id, openedById: bob, reason: "war da" });

    await resolveDisputeWithChange({
      matchId: m.id,
      resolution: "upheld",
      note: "Kein Termin nachgewiesen",
      resolvedById: staff,
      change: { kind: "confirm" },
    });

    expect((await getMatchResult(m.id))?.confirmedAt).not.toBeNull();
    expect(await matchOpenDispute(m.id)).toBeNull();

    await db.execute(sql`delete from matches where id = ${m.id}`);
  });

  it("delete: resetting the result closes the dispute too", async () => {
    const [m] = await db
      .insert(matches)
      .values({ subDivisionId, round: 1, playerAId: alice, playerBId: bob })
      .returning({ id: matches.id });
    await saveResult(
      m.id,
      {
        outcome: "double_loss",
        winnerId: null,
        platform: null,
        videoUrl: null,
        freeWinReason: null,
        discussedWithId: null,
      },
      [],
      [],
      alice,
    );
    await openDispute({
      matchId: m.id,
      openedById: bob,
      reason: "nie gespielt",
    });

    await resolveDisputeWithChange({
      matchId: m.id,
      resolution: "corrected",
      note: "Bitte neu melden",
      resolvedById: staff,
      change: { kind: "delete" },
    });

    expect(await getMatchResult(m.id)).toBeNull();
    expect(await matchOpenDispute(m.id)).toBeNull();
    expect((await matchResolvedDispute(m.id))?.note).toBe("Bitte neu melden");

    await db.execute(sql`delete from matches where id = ${m.id}`);
  });
});

describe("divisionGroups", () => {
  // A second division under the same window, two equal-size groups (1x/1y),
  // each a single decided match — isolated from the tier-1 fixture above.
  const x1 = randomUUID();
  const x2 = randomUUID();
  const y1 = randomUUID();
  const y2 = randomUUID();
  let divisionId: string;

  beforeAll(async () => {
    for (const id of [x1, x2, y1, y2]) {
      await db.execute(sql`insert into auth.users (id) values (${id})`);
    }
    await db.insert(profiles).values([
      { userId: x1, displayName: "Xander" },
      { userId: x2, displayName: "Xenia" },
      { userId: y1, displayName: "Yanis" },
      { userId: y2, displayName: "Yara" },
    ]);
    const [division] = await db
      .insert(divisions)
      .values({ windowId, tier: 2 })
      .returning({ id: divisions.id });
    divisionId = division.id;
    const [groupX, groupY] = await db
      .insert(subDivisions)
      .values([
        { divisionId, position: 0 },
        { divisionId, position: 1 },
      ])
      .returning({ id: subDivisions.id });
    await db.insert(placements).values([
      { windowId, userId: x1, divisionId, subDivisionId: groupX.id },
      { windowId, userId: x2, divisionId, subDivisionId: groupX.id },
      { windowId, userId: y1, divisionId, subDivisionId: groupY.id },
      { windowId, userId: y2, divisionId, subDivisionId: groupY.id },
    ]);
    const [matchX, matchY] = await db
      .insert(matches)
      .values([
        { subDivisionId: groupX.id, round: 1, playerAId: x1, playerBId: x2 },
        { subDivisionId: groupY.id, round: 1, playerAId: y1, playerBId: y2 },
      ])
      .returning({ id: matches.id });
    const decided = (matchId: string, winner: string, loser: string) =>
      saveResult(
        matchId,
        {
          outcome: "normal",
          winnerId: winner,
          platform: "showdown",
          videoUrl: null,
          freeWinReason: null,
          discussedWithId: null,
        },
        [
          { gameNumber: 1, winnerId: winner, replayUrl: null },
          { gameNumber: 2, winnerId: winner, replayUrl: null },
        ],
        sheetsFor(winner, loser),
        winner,
      ).then(() => loser);
    await decided(matchX.id, x1, x2);
    await decided(matchY.id, y1, y2);
  });

  afterAll(async () => {
    for (const id of [x1, x2, y1, y2]) {
      await db.execute(sql`delete from auth.users where id = ${id}`);
    }
  });

  it("returns each group's roster + results, ordered by position", async () => {
    const groups = await divisionGroups(divisionId);
    expect(groups.map((g) => g.position)).toEqual([0, 1]);
    expect(groups[0].roster.map((r) => r.name)).toEqual(["Xander", "Xenia"]);
    expect(groups[1].roster.map((r) => r.name)).toEqual(["Yanis", "Yara"]);
    expect(groups.every((g) => g.results.length === 1)).toBe(true);
  });

  it("feeds a combined division table via divisionStandings", async () => {
    const rows = divisionStandings(await divisionGroups(divisionId));
    expect(rows).not.toBeNull();
    expect(rows?.map((r) => r.userId).sort()).toEqual([x1, x2, y1, y2].sort());
    // Both group winners swept 2:0 → tied at the top of the division.
    expect(rows?.find((r) => r.userId === x1)?.rank).toBe(1);
    expect(rows?.find((r) => r.userId === y1)?.rank).toBe(1);
  });
});
