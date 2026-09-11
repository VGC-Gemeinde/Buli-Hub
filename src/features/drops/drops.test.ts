import { describe, expect, it } from "vitest";
import {
  computeStandings,
  type ResultForStandings,
} from "../reporting/standings";
import {
  decidedByDrop,
  dropBannerText,
  type EffectiveResultInput,
  effectiveResult,
} from "./drops";

const base: ResultForStandings = {
  matchId: "m-a",
  playerAId: "a",
  playerBId: "b",
  outcome: "normal",
  winnerId: "a",
  confirmedAt: null,
  games: [{ winnerId: "a" }, { winnerId: "b" }, { winnerId: "a" }],
};

describe("effectiveResult", () => {
  it("passes through when nobody is dropped", () => {
    expect(effectiveResult(base, new Set())).toBe(base);
  });

  it("overrides a played result the dropped player had won", () => {
    const effective = effectiveResult(base, new Set(["a"]));
    expect(effective.outcome).toBe("free_win");
    expect(effective.winnerId).toBe("b");
    expect(effective.confirmedAt).not.toBeNull();
    expect(effective.games).toEqual([]);
  });

  it("decides an unreported match against the dropped player", () => {
    const open = { ...base, outcome: null, winnerId: null, games: [] };
    const effective = effectiveResult(open, new Set(["b"]));
    expect(effective.outcome).toBe("free_win");
    expect(effective.winnerId).toBe("a");
    expect(effective.confirmedAt).not.toBeNull();
  });

  it("confirms a pending free win of the opponent immediately", () => {
    const pending: EffectiveResultInput = {
      ...base,
      outcome: "free_win",
      winnerId: "a",
      confirmedAt: null,
      games: [],
    };
    const effective = effectiveResult(pending, new Set(["b"]));
    expect(effective.outcome).toBe("free_win");
    expect(effective.winnerId).toBe("a");
    expect(effective.confirmedAt).not.toBeNull();
  });

  it("turns a match between two dropped players into a double loss", () => {
    const effective = effectiveResult(base, new Set(["a", "b"]));
    expect(effective.outcome).toBe("double_loss");
    expect(effective.winnerId).toBeNull();
    expect(effective.games).toEqual([]);
  });

  it("leaves byes untouched", () => {
    const bye = { ...base, playerBId: null };
    expect(effectiveResult(bye, new Set(["a"]))).toBe(bye);
  });
});

describe("decidedByDrop", () => {
  it("flags matches with a dropped participant, but never byes", () => {
    expect(
      decidedByDrop({ playerAId: "a", playerBId: "b" }, new Set(["b"])),
    ).toBe(true);
    expect(decidedByDrop({ playerAId: "a", playerBId: "b" }, new Set())).toBe(
      false,
    );
    expect(
      decidedByDrop({ playerAId: "a", playerBId: null }, new Set(["a"])),
    ).toBe(false);
  });
});

describe("standings with the override", () => {
  const roster = [
    { userId: "a", name: "Alice", avatarUrl: null },
    { userId: "b", name: "Bob", avatarUrl: null },
    { userId: "c", name: "Carol", avatarUrl: null },
  ];
  // Round robin: a beat b 2:1; a vs c and b vs c unreported. Then c drops? No —
  // drop b: their played win/loss history stops counting as played.
  const results: ResultForStandings[] = [
    base, // a 2:1 b (a won)
    { ...base, playerBId: "c", outcome: null, winnerId: null, games: [] }, // a–c open
    {
      ...base,
      matchId: "m-b",
      playerAId: "b",
      playerBId: "c",
      outcome: null,
      winnerId: null,
      games: [],
    }, // b–c open
  ];

  it("credits opponents of the dropped player with 2:0 wins", () => {
    const dropped = new Set(["b"]);
    const rows = computeStandings({
      roster,
      results: results.map((r) => effectiveResult(r, dropped)),
    });
    const byId = new Map(rows.map((r) => [r.userId, r]));
    // Alice: real win over Bob becomes a 2:0 free win; a–c stays open.
    expect(byId.get("a")).toMatchObject({ wins: 1, losses: 0, gamesWon: 2 });
    // Carol: the open match against Bob is decided 2:0 for her.
    expect(byId.get("c")).toMatchObject({ wins: 1, losses: 0, gamesWon: 2 });
    // Bob: two 0:2 losses, nothing counted from the played games.
    expect(byId.get("b")).toMatchObject({
      wins: 0,
      losses: 2,
      gamesWon: 0,
      gamesLost: 4,
    });
  });
});

describe("dropBannerText", () => {
  const names = { playerAName: "Alice", playerBName: "Bob" };
  it("names the free-win beneficiary", () => {
    expect(dropBannerText({ ...names, aDropped: true, bDropped: false })).toBe(
      "Alice wurde gedroppt. Das Match zählt als Freewin (2:0) für Bob.",
    );
    expect(dropBannerText({ ...names, aDropped: false, bDropped: true })).toBe(
      "Bob wurde gedroppt. Das Match zählt als Freewin (2:0) für Alice.",
    );
  });
  it("handles the double drop", () => {
    expect(
      dropBannerText({ ...names, aDropped: true, bDropped: true }),
    ).toContain("Doppelniederlage");
  });
});
