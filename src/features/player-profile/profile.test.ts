import { describe, expect, it } from "vitest";
import type { MatchResultLite } from "@/features/reporting/queries";
import type { PlayerMatch } from "@/features/season/dashboard";
import { profileScheduleRows } from "./profile";

const opponent = { userId: "opp", name: "Falinks", avatarUrl: null };
const match = (
  matchId: string,
  extra: Partial<PlayerMatch> = {},
): PlayerMatch => ({
  matchId,
  round: 1,
  startsOn: "2026-07-01",
  endsOn: "2026-07-07",
  opponent,
  ...extra,
});
const normalResult = (matchId: string): MatchResultLite => ({
  matchId,
  outcome: "normal",
  winnerId: "owner",
  confirmedAt: null,
  disputed: false,
  games: [{ winnerId: "owner" }, { winnerId: "opp" }, { winnerId: "owner" }],
});

describe("profileScheduleRows", () => {
  it("maps a reported match with the owner's score", () => {
    const [row] = profileScheduleRows({
      playerId: "owner",
      viewerId: null,
      viewerIsStaff: false,
      matches: [match("m1")],
      resultByMatchId: new Map([["m1", normalResult("m1")]]),
      motwSelections: [],
    });
    expect(row).toMatchObject({
      reported: true,
      scoreSelf: 2,
      scoreOpponent: 1,
      isMine: false,
      isMotw: false,
    });
  });

  it('keeps unreported and pending free-win matches "offen"', () => {
    const pending: MatchResultLite = {
      ...normalResult("m2"),
      outcome: "free_win",
      games: [],
    };
    const rows = profileScheduleRows({
      playerId: "owner",
      viewerId: null,
      viewerIsStaff: false,
      matches: [match("m1"), match("m2", { round: 2 })],
      resultByMatchId: new Map([["m2", pending]]),
      motwSelections: [],
    });
    expect(rows[0].reported).toBe(false);
    expect(rows[1].reported).toBe(false);
    expect(rows[1].scoreSelf).toBeNull();
  });

  it("marks the viewer's involvement — owner and opponent", () => {
    const asOwner = profileScheduleRows({
      playerId: "owner",
      viewerId: "owner",
      viewerIsStaff: false,
      matches: [match("m1")],
      resultByMatchId: new Map(),
      motwSelections: [],
    });
    expect(asOwner[0].isMine).toBe(true);
    const asOpponent = profileScheduleRows({
      playerId: "owner",
      viewerId: "opp",
      viewerIsStaff: false,
      matches: [match("m1")],
      resultByMatchId: new Map(),
      motwSelections: [],
    });
    expect(asOpponent[0].isMine).toBe(true);
    const asNeutral = profileScheduleRows({
      playerId: "owner",
      viewerId: "someone",
      viewerIsStaff: false,
      matches: [match("m1")],
      resultByMatchId: new Map(),
      motwSelections: [],
    });
    expect(asNeutral[0].isMine).toBe(false);
  });

  it("flags MotW matches and byes", () => {
    const rows = profileScheduleRows({
      playerId: "owner",
      viewerId: null,
      viewerIsStaff: false,
      matches: [match("m1"), match("m2", { round: 2, opponent: null })],
      resultByMatchId: new Map([["m1", normalResult("m1")]]),
      motwSelections: [{ matchId: "m1", youtubeUrl: "https://youtu.be/x" }],
    });
    expect(rows[0].isMotw).toBe(true);
    expect(rows[0].motwEmbargo).toBeNull();
    expect(rows[0].scoreSelf).toBe(2);
    expect(rows[1].opponent).toBeNull();
  });

  describe("Match of the Week before its VOD", () => {
    const base = {
      playerId: "owner",
      matches: [match("m1")],
      resultByMatchId: new Map([["m1", normalResult("m1")]]),
      motwSelections: [{ matchId: "m1", youtubeUrl: null }],
    };

    it("withholds the result from a guest", () => {
      const [row] = profileScheduleRows({
        ...base,
        viewerId: null,
        viewerIsStaff: false,
      });
      expect(row).toMatchObject({
        reported: true,
        scoreSelf: null,
        scoreOpponent: null,
        isMotw: true,
        motwEmbargo: "withheld",
      });
    });

    it("withholds the result from a player outside the match", () => {
      const [row] = profileScheduleRows({
        ...base,
        viewerId: "someone",
        viewerIsStaff: false,
      });
      expect(row.motwEmbargo).toBe("withheld");
      expect(row.scoreSelf).toBeNull();
    });

    it("previews the result for the owner, the opponent and staff", () => {
      for (const viewer of [
        { viewerId: "owner", viewerIsStaff: false },
        { viewerId: "opp", viewerIsStaff: false },
        { viewerId: "someone", viewerIsStaff: true },
      ]) {
        const [row] = profileScheduleRows({ ...base, ...viewer });
        expect(row.motwEmbargo).toBe("preview");
        expect(row.scoreSelf).toBe(2);
        expect(row.scoreOpponent).toBe(1);
      }
    });
  });
});
