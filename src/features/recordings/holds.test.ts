import { describe, expect, it } from "vitest";
import {
  buildHeldMatches,
  buildRecordingWeeks,
  canHold,
  type RecordingMatch,
  staleHolds,
  staleHoldsSummary,
} from "./holds";

describe("staleHolds", () => {
  const holds = [
    { matchId: "a", round: 2 },
    { matchId: "b", round: 3 },
    { matchId: "c", round: 4 },
  ];

  it("keeps holds of rounds before the current one", () => {
    expect(staleHolds(holds, 3).map((h) => h.matchId)).toEqual(["a"]);
  });

  it("does not count the current round or later ones", () => {
    expect(staleHolds(holds, 2)).toEqual([]);
  });

  it("counts every hold once the season has no current round", () => {
    expect(staleHolds(holds, null)).toHaveLength(3);
  });
});

describe("canHold", () => {
  const ok = {
    reported: false,
    isBye: false,
    decidedByDrop: false,
    round: 3,
    currentRound: 3,
  };

  it("allows an open match of the current or a later Spieltag", () => {
    expect(canHold(ok)).toBe(true);
    expect(canHold({ ...ok, round: 5 })).toBe(true);
  });

  it("rejects a reported match", () => {
    expect(canHold({ ...ok, reported: true })).toBe(false);
  });

  it("rejects byes and drop-decided matches", () => {
    expect(canHold({ ...ok, isBye: true })).toBe(false);
    expect(canHold({ ...ok, decidedByDrop: true })).toBe(false);
  });

  it("rejects past Spieltage and a season without a current round", () => {
    expect(canHold({ ...ok, round: 2 })).toBe(false);
    expect(canHold({ ...ok, currentRound: null })).toBe(false);
  });
});

describe("staleHoldsSummary", () => {
  it("is null without stale holds", () => {
    expect(staleHoldsSummary([])).toBeNull();
  });

  it("counts and says whether every stale hold is reported", () => {
    expect(staleHoldsSummary([{ reported: true }, { reported: true }])).toEqual(
      { count: 2, allReported: true },
    );
    expect(
      staleHoldsSummary([{ reported: true }, { reported: false }]),
    ).toEqual({ count: 2, allReported: false });
  });
});

const identity = (id: string) => ({
  userId: id,
  name: id,
  avatarUrl: null,
  streamPhotoUrl: null,
});
const rm = (
  matchId: string,
  round: number,
  extra: Partial<RecordingMatch> = {},
): RecordingMatch => ({
  matchId,
  round,
  tier: 1,
  groupName: "Division 1a",
  playerA: identity("a"),
  playerB: identity("b"),
  reported: false,
  pendingFreeWin: false,
  decidedByDrop: false,
  held: false,
  endsOn: null,
  ...extra,
});

describe("buildHeldMatches", () => {
  it("lists only held matches, stale ones first, then by round", () => {
    const held = buildHeldMatches(
      [
        rm("m4", 4, { held: true }),
        rm("m3", 3, { held: true }),
        rm("m2", 2, { held: true, reported: true }),
        rm("m1", 1, { held: false }),
        rm("m2b", 2, { held: true, tier: 2, groupName: "Division 2a" }),
      ],
      3,
    );
    expect(held.map((m) => [m.matchId, m.stale])).toEqual([
      ["m2", true],
      ["m2b", true],
      ["m3", false],
      ["m4", false],
    ]);
  });
});

describe("buildRecordingWeeks", () => {
  const matchdays = [
    { round: 1, startsOn: "2026-07-01", endsOn: "2026-07-07" },
    { round: 2, startsOn: "2026-07-08", endsOn: "2026-07-14" },
    { round: 3, startsOn: "2026-07-15", endsOn: "2026-07-21" },
  ];

  it("keeps the current and later Spieltage with their matches", () => {
    const weeks = buildRecordingWeeks({
      matchdays,
      currentRound: 2,
      matches: [rm("m1", 1), rm("m2", 2), rm("m3", 3)],
    });
    expect(weeks.map((w) => [w.round, w.state, w.matches.length])).toEqual([
      [2, "current", 1],
      [3, "future", 1],
    ]);
  });

  it("is empty without a current round", () => {
    expect(
      buildRecordingWeeks({ matchdays, currentRound: null, matches: [] }),
    ).toEqual([]);
  });
});
