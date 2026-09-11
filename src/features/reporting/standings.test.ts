import { describe, expect, it } from "vitest";
import type { Identity } from "@/features/season/dashboard";
import {
  computeStandings,
  divisionStandings,
  type ResultForStandings,
} from "./standings";

const id = (userId: string, name: string): Identity => ({
  userId,
  name,
  avatarUrl: null,
});
const roster = [id("a", "Charlie"), id("b", "Alice"), id("c", "Bob")];

// A normal best-of-3 the winner took by the given game score (2:0 by default).
const normal = (
  winnerId: string,
  playerAId: string,
  playerBId: string,
  loserGameWins = 0,
): ResultForStandings => {
  const loserId = winnerId === playerAId ? playerBId : playerAId;
  return {
    matchId: `${playerAId}-${playerBId}`,
    playerAId,
    playerBId,
    outcome: "normal",
    winnerId,
    confirmedAt: null,
    games: [
      { winnerId },
      { winnerId },
      ...(loserGameWins > 0 ? [{ winnerId: loserId }] : []),
    ],
  };
};

// A normal match written winner-first, with an explicit loser game count — lets a
// test dial in an exact game tally for one player against throwaway opponents.
const match = (
  winnerId: string,
  loserId: string,
  loserGameWins: 0 | 1,
): ResultForStandings => normal(winnerId, winnerId, loserId, loserGameWins);

describe("computeStandings", () => {
  it("all zero, ordered by name (de) when there are no results", () => {
    const rows = computeStandings({ roster, results: [] });
    expect(rows.map((r) => r.name)).toEqual(["Alice", "Bob", "Charlie"]);
    expect(rows.every((r) => r.points === 0 && r.wins === 0)).toBe(true);
  });

  it("a normal result: winner 3 points + a win, loser a loss, games counted", () => {
    const rows = computeStandings({
      roster,
      results: [normal("a", "a", "b", 1)], // a wins 2:1
    });
    expect(rows.find((r) => r.userId === "a")).toMatchObject({
      wins: 1,
      losses: 0,
      points: 3,
      gamesWon: 2,
      gamesLost: 1,
      rank: 1,
    });
    expect(rows.find((r) => r.userId === "b")).toMatchObject({
      wins: 0,
      losses: 1,
      gamesWon: 1,
      gamesLost: 2,
    });
  });

  it("a pending free win counts for nobody; a confirmed one is a 2:0 default win", () => {
    const freeWin = (confirmedAt: Date | null): ResultForStandings => ({
      matchId: "m-a",
      playerAId: "a",
      playerBId: "b",
      outcome: "free_win",
      winnerId: "a",
      confirmedAt,
      games: [],
    });

    const pending = computeStandings({ roster, results: [freeWin(null)] });
    expect(pending.every((r) => r.points === 0 && r.gamesWon === 0)).toBe(true);

    const confirmed = computeStandings({
      roster,
      results: [freeWin(new Date())],
    });
    expect(confirmed.find((r) => r.userId === "a")).toMatchObject({
      points: 3,
      gamesWon: 2,
      gamesLost: 0,
    });
    expect(confirmed.find((r) => r.userId === "b")).toMatchObject({
      losses: 1,
      gamesWon: 0,
      gamesLost: 2,
    });
  });

  it("a double loss is a 0:2 default loss for both, a win for neither", () => {
    const rows = computeStandings({
      roster,
      results: [
        {
          matchId: "m-a",
          playerAId: "a",
          playerBId: "b",
          outcome: "double_loss",
          winnerId: null,
          confirmedAt: null,
          games: [],
        },
      ],
    });
    for (const userId of ["a", "b"]) {
      expect(rows.find((r) => r.userId === userId)).toMatchObject({
        wins: 0,
        losses: 1,
        gamesWon: 0,
        gamesLost: 2,
      });
    }
  });

  it("byes and unreported matches count for nobody", () => {
    const rows = computeStandings({
      roster,
      results: [
        {
          matchId: "m-a",
          playerAId: "a",
          playerBId: "b",
          outcome: null,
          winnerId: null,
          confirmedAt: null,
          games: [],
        },
        {
          matchId: "m-c",
          playerAId: "c",
          playerBId: null,
          outcome: null,
          winnerId: null,
          confirmedAt: null,
          games: [],
        },
      ],
    });
    expect(rows.every((r) => r.wins === 0 && r.gamesWon === 0)).toBe(true);
  });

  it("differential breaks a tie on match wins", () => {
    // Both x and y beat z, but x sweeps 2:0 (diff +2) and y grinds 2:1 (diff +1).
    const tie = [id("x", "X"), id("y", "Y"), id("z", "Z")];
    const rows = computeStandings({
      roster: tie,
      results: [normal("x", "x", "z"), normal("y", "y", "z", 1)],
    });
    expect(rows.map((r) => r.userId)).toEqual(["x", "y", "z"]);
    expect(rows[0]).toMatchObject({ gamesWon: 2, gamesLost: 0 });
    expect(rows[1]).toMatchObject({ gamesWon: 2, gamesLost: 1 });
  });

  it("game win rate breaks a tie on match wins and differential", () => {
    // p: 7:3 games (diff +4, rate .70); q: 6:2 (diff +4, rate .75). Same wins and
    // differential, so q's higher rate ranks first. Opponents are throwaways.
    const rows = computeStandings({
      roster: [id("p", "P"), id("q", "Q")],
      results: [
        match("p", "p1", 0), // 2:0
        match("p", "p2", 0), // 2:0
        match("p", "p3", 1), // 2:1
        match("p4", "p", 1), // p loses 1:2
        match("q", "q1", 0), // 2:0
        match("q", "q2", 0), // 2:0
        match("q", "q3", 0), // 2:0
        match("q4", "q", 0), // q loses 0:2
      ],
    });
    const p = rows.find((r) => r.userId === "p");
    const q = rows.find((r) => r.userId === "q");
    expect(p).toMatchObject({ wins: 3, gamesWon: 7, gamesLost: 3 });
    expect(q).toMatchObject({ wins: 3, gamesWon: 6, gamesLost: 2 });
    expect(rows.map((r) => r.userId)).toEqual(["q", "p"]);
  });

  it("differential outranks rate when the two conflict", () => {
    // x: 12:5 games (diff +7, rate .706); y: 10:4 (diff +6, rate .714). Rate would
    // favour y, but differential is checked first, so x ranks ahead.
    const rows = computeStandings({
      roster: [id("x", "X"), id("y", "Y")],
      results: [
        match("x", "x1", 0), // 2:0
        match("x", "x2", 0), // 2:0
        match("x", "x3", 0), // 2:0
        match("x", "x4", 0), // 2:0
        match("x", "x5", 1), // 2:1
        match("x6", "x", 1), // x loses 1:2
        match("x7", "x", 1), // x loses 1:2
        match("y", "y1", 0), // 2:0
        match("y", "y2", 0), // 2:0
        match("y", "y3", 0), // 2:0
        match("y", "y4", 0), // 2:0
        match("y", "y5", 0), // 2:0
        match("y6", "y", 0), // y loses 0:2
        match("y7", "y", 0), // y loses 0:2
      ],
    });
    const x = rows.find((r) => r.userId === "x");
    const y = rows.find((r) => r.userId === "y");
    expect(x).toMatchObject({ wins: 5, gamesWon: 12, gamesLost: 5 });
    expect(y).toMatchObject({ wins: 5, gamesWon: 10, gamesLost: 4 });
    expect(rows.map((r) => r.userId)).toEqual(["x", "y"]);
  });

  it("genuinely tied players share a rank and the next rank skips", () => {
    // a and b both go 2:0; c and d both go 0:2 → ranks 1, 1, 3, 3.
    const field = [id("a", "A"), id("b", "B"), id("c", "C"), id("d", "D")];
    const rows = computeStandings({
      roster: field,
      results: [normal("a", "a", "c"), normal("b", "b", "d")],
    });
    const rank = (u: string) => rows.find((r) => r.userId === u)?.rank;
    expect(rank("a")).toBe(1);
    expect(rank("b")).toBe(1);
    expect(rank("c")).toBe(3);
    expect(rank("d")).toBe(3);
  });

  it("ranks are contiguous from 1 when there are no ties", () => {
    const rows = computeStandings({
      roster,
      results: [
        normal("a", "a", "b"),
        normal("a", "a", "c"),
        normal("b", "b", "c"),
      ],
    });
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
  });
});

// Head-to-head only orders players inside a "block" — everyone left level after
// match wins and game differential. These fixtures lean on throwaway opponents
// outside the roster to dial a player's tally to an exact block, and name the
// players so that alphabetical order (the final fallback) would produce a
// different sequence than head-to-head does.
describe("computeStandings — head-to-head", () => {
  // A confirmed walkover: a match win with a 2:0 default score.
  const walkover = (winnerId: string, loserId: string): ResultForStandings => ({
    matchId: `${winnerId}-${loserId}`,
    playerAId: winnerId,
    playerBId: loserId,
    outcome: "free_win",
    winnerId,
    confirmedAt: new Date(),
    games: [],
  });

  it("orders a tied pair by their direct match, on distinct ranks", () => {
    // Zoe and Anna both finish 1 win, 2:2 games. Zoe beat Anna, so she ranks
    // above — and they no longer share a rank, which is the point.
    const rows = computeStandings({
      roster: [id("zoe", "Zoe"), id("anna", "Anna")],
      results: [
        normal("zoe", "zoe", "anna"), // Zoe 2:0
        match("anna", "z1", 0), // Anna beats an outsider 2:0
        match("y1", "zoe", 0), // Zoe loses to an outsider 0:2
      ],
    });
    expect(rows.map((r) => r.userId)).toEqual(["zoe", "anna"]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2]);
  });

  it("orders a tied trio by how many of the trio each one beat", () => {
    // Carla beat Berta and Anna, Berta beat Anna — 2 / 1 / 0 head-to-head wins.
    // All three are padded to 2 wins and 4:4 games, so nothing before or after
    // head-to-head separates them, and alphabetical order would be the exact
    // reverse.
    const rows = computeStandings({
      roster: [id("c", "Carla"), id("b", "Berta"), id("a", "Anna")],
      results: [
        normal("c", "c", "b"), // Carla 2:0 Berta
        normal("c", "c", "a"), // Carla 2:0 Anna
        normal("b", "b", "a"), // Berta 2:0 Anna
        match("y1", "c", 0), // Carla drops two 0:2 to outsiders
        match("y2", "c", 0),
        match("b", "z1", 0), // Berta adds a 2:0 win and a 0:2 loss
        match("z2", "b", 0),
        match("a", "w1", 0), // Anna adds two 2:0 wins
        match("a", "w2", 0),
      ],
    });
    for (const row of rows) {
      expect(row).toMatchObject({ wins: 2, gamesWon: 4, gamesLost: 4 });
    }
    expect(rows.map((r) => r.userId)).toEqual(["c", "b", "a"]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("resolves nothing when the trio's results cycle", () => {
    // Zoe beat Anna, Anna beat Berta, Berta beat Zoe: one head-to-head win each,
    // so the level cannot order them and they stay genuinely tied on a shared
    // rank, displayed alphabetically.
    const rows = computeStandings({
      roster: [id("zoe", "Zoe"), id("anna", "Anna"), id("berta", "Berta")],
      results: [
        normal("zoe", "zoe", "anna"),
        normal("anna", "anna", "berta"),
        normal("berta", "berta", "zoe"),
      ],
    });
    expect(rows.map((r) => r.name)).toEqual(["Anna", "Berta", "Zoe"]);
    expect(rows.map((r) => r.rank)).toEqual([1, 1, 1]);
  });

  it("lifts the player who beat the block, then falls through to game win rate", () => {
    // Zoe beat both Anna and Berta; Anna and Berta never met, so they are level
    // on head-to-head and game win rate decides between them (Berta 6:8 = .429
    // over Anna 4:6 = .400). All three sit on 2 wins and −2 differential.
    const rows = computeStandings({
      roster: [id("zoe", "Zoe"), id("anna", "Anna"), id("berta", "Berta")],
      results: [
        normal("zoe", "zoe", "anna"), // Zoe 2:0
        normal("zoe", "zoe", "berta"), // Zoe 2:0
        match("y1", "zoe", 0), // Zoe drops three 0:2
        match("y2", "zoe", 0),
        match("y3", "zoe", 0),
        match("anna", "z1", 0), // Anna: two 2:0 wins, two 0:2 losses
        match("anna", "z2", 0),
        match("z3", "anna", 0),
        match("z4", "anna", 0),
        match("berta", "w1", 1), // Berta: two 2:1 wins, two 1:2 losses
        match("berta", "w2", 1),
        match("w3", "berta", 1),
        match("w4", "berta", 1),
      ],
    });
    for (const row of rows) {
      expect(row.wins).toBe(2);
      expect(row.gamesWon - row.gamesLost).toBe(-2);
    }
    expect(rows.map((r) => r.userId)).toEqual(["zoe", "berta", "anna"]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("counts a confirmed walkover as a head-to-head win", () => {
    // A free win is a match win in the standings, so it decides the direct
    // meeting too.
    const rows = computeStandings({
      roster: [id("zoe", "Zoe"), id("anna", "Anna")],
      results: [
        walkover("zoe", "anna"),
        match("anna", "z1", 0),
        match("y1", "zoe", 0),
      ],
    });
    expect(rows.map((r) => r.userId)).toEqual(["zoe", "anna"]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2]);
  });

  it("takes nothing from a double loss, an unreported match or a pending free win", () => {
    // None of the three decided a match, so the tied pair stays tied and shares
    // a rank in every case.
    const undecided: ResultForStandings[] = [
      {
        matchId: "m-zoe",
        playerAId: "zoe",
        playerBId: "anna",
        outcome: "double_loss",
        winnerId: null,
        confirmedAt: null,
        games: [],
      },
      {
        matchId: "m-zoe",
        playerAId: "zoe",
        playerBId: "anna",
        outcome: null,
        winnerId: null,
        confirmedAt: null,
        games: [],
      },
      {
        matchId: "m-zoe",
        playerAId: "zoe",
        playerBId: "anna",
        outcome: "free_win",
        winnerId: "zoe",
        confirmedAt: null, // not confirmed by staff yet
        games: [],
      },
    ];
    for (const result of undecided) {
      const rows = computeStandings({
        roster: [id("zoe", "Zoe"), id("anna", "Anna")],
        results: [result, match("zoe", "y1", 0), match("anna", "z1", 0)],
      });
      expect(rows.map((r) => r.name)).toEqual(["Anna", "Zoe"]);
      expect(rows.map((r) => r.rank)).toEqual([1, 1]);
    }
  });

  it("ignores wins over players outside the block", () => {
    // Anna beats the bottom two of the group, Zoe beats nobody, and the pair is
    // level on wins and differential. Anna's wins are outside their block, so
    // head-to-head stays 0:0 and they share a rank.
    const rows = computeStandings({
      roster: [
        id("zoe", "Zoe"),
        id("anna", "Anna"),
        id("x", "Xaver"),
        id("y", "Yannick"),
      ],
      results: [
        normal("anna", "anna", "x"), // Anna 2:0
        normal("anna", "anna", "y"), // Anna 2:0
        match("v1", "anna", 0), // Anna drops two 0:2 to outsiders
        match("v2", "anna", 0),
        match("zoe", "w1", 0), // Zoe: two 2:0 wins, two 0:2 losses
        match("zoe", "w2", 0),
        match("w3", "zoe", 0),
        match("w4", "zoe", 0),
      ],
    });
    const zoe = rows.find((r) => r.userId === "zoe");
    const anna = rows.find((r) => r.userId === "anna");
    expect(zoe).toMatchObject({ wins: 2, gamesWon: 4, gamesLost: 4, rank: 1 });
    expect(anna).toMatchObject({ wins: 2, gamesWon: 4, gamesLost: 4, rank: 1 });
  });

  it("never overrides game differential", () => {
    // Zoe beat Anna directly, but Anna's game record is cleaner (+2 to +1), so
    // they are not in the same block and head-to-head never gets a say.
    const rows = computeStandings({
      roster: [id("zoe", "Zoe"), id("anna", "Anna")],
      results: [
        normal("zoe", "zoe", "anna"), // Zoe 2:0 — the direct match
        match("y1", "zoe", 0), // Zoe loses 0:2
        match("zoe", "y2", 1), // Zoe wins 2:1 → 4:3, diff +1
        match("anna", "z1", 0), // Anna wins 2:0
        match("anna", "z2", 0), // Anna wins 2:0 → 4:2, diff +2
      ],
    });
    expect(rows.map((r) => r.userId)).toEqual(["anna", "zoe"]);
  });
});

describe("divisionStandings", () => {
  it("returns null with fewer than two groups (nothing to combine)", () => {
    const groups = [{ roster: [id("a", "A"), id("b", "B")], results: [] }];
    expect(divisionStandings(groups)).toBeNull();
  });

  it("returns null when groups differ in size (unequal matches played)", () => {
    const groups = [
      { roster: [id("a", "A"), id("b", "B")], results: [] },
      { roster: [id("c", "C")], results: [] },
    ];
    expect(divisionStandings(groups)).toBeNull();
  });

  it("merges equal-size groups and ranks players who never met", () => {
    // Group A: a1 beats a2 2:0 (diff +2). Group B: b1 beats b2 2:1 (diff +1).
    const groupA = {
      roster: [id("a1", "A1"), id("a2", "A2")],
      results: [match("a1", "a2", 0)],
    };
    const groupB = {
      roster: [id("b1", "B1"), id("b2", "B2")],
      results: [match("b1", "b2", 1)],
    };
    const rows = divisionStandings([groupA, groupB]);
    // Winners ranked by differential (a1 +2 over b1 +1), then losers (b2 −1 over
    // a2 −2) — all cross-group, opponent-independent.
    expect(rows?.map((r) => r.userId)).toEqual(["a1", "b1", "b2", "a2"]);
    expect(rows?.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });

  it("drops head-to-head, so a tied pair from one group shares a rank", () => {
    // Zoe and Anna are in the same group, level on wins and differential, and
    // Zoe won their direct match. Their own group table separates them on that;
    // the division table must not, because most pairs in it never met.
    const groupA = {
      roster: [
        id("zoe", "Zoe"),
        id("anna", "Anna"),
        id("a3", "A3"),
        id("a4", "A4"),
      ],
      results: [
        normal("zoe", "zoe", "anna"), // the direct match, Zoe 2:0
        match("a3", "zoe", 0), // Zoe loses 0:2 → 2:2, diff 0
        match("anna", "a4", 0), // Anna wins 2:0 → 2:2, diff 0
      ],
    };
    const groupB = {
      roster: [id("b1", "B1"), id("b2", "B2"), id("b3", "B3"), id("b4", "B4")],
      results: [],
    };

    const group = computeStandings(groupA);
    const rankIn = (rows: typeof group, userId: string) =>
      rows.find((r) => r.userId === userId)?.rank;
    // Group table: head-to-head applies, so Zoe is placed above Anna.
    expect(rankIn(group, "zoe")).toBe(2);
    expect(rankIn(group, "anna")).toBe(3);

    const division = divisionStandings([groupA, groupB]);
    // Division table: head-to-head is off, so the pair is genuinely tied and
    // shares a rank, displayed alphabetically.
    expect(rankIn(division ?? [], "zoe")).toBe(2);
    expect(rankIn(division ?? [], "anna")).toBe(2);
    const order = division?.map((r) => r.userId) ?? [];
    expect(order.indexOf("anna")).toBeLessThan(order.indexOf("zoe"));
  });

  it("shares a rank across groups for genuinely tied players", () => {
    // a1 and b1 both sweep 2:0; a2 and b2 both go 0:2 → ranks 1, 1, 3, 3.
    const groupA = {
      roster: [id("a1", "A1"), id("a2", "A2")],
      results: [match("a1", "a2", 0)],
    };
    const groupB = {
      roster: [id("b1", "B1"), id("b2", "B2")],
      results: [match("b1", "b2", 0)],
    };
    const rows = divisionStandings([groupA, groupB]);
    const rank = (u: string) => rows?.find((r) => r.userId === u)?.rank;
    expect(rank("a1")).toBe(1);
    expect(rank("b1")).toBe(1);
    expect(rank("a2")).toBe(3);
    expect(rank("b2")).toBe(3);
  });
});
