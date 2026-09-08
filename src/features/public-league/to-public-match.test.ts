import { describe, expect, it } from "vitest";
import type { MatchResultLite } from "@/features/reporting/queries";
import { toPublicMatch } from "./queries";

const alice = { userId: "alice", name: "Alice", avatarUrl: null };
const bob = { userId: "bob", name: "Bob", avatarUrl: null };
const match = { id: "m1", round: 3, playerAId: "alice" };
const won: MatchResultLite = {
  matchId: "m1",
  outcome: "normal",
  winnerId: "alice",
  confirmedAt: null,
  disputed: false,
  games: [{ winnerId: "alice" }, { winnerId: "bob" }, { winnerId: "alice" }],
};
const guest = { userId: null, isStaff: false };

describe("toPublicMatch", () => {
  it("maps a reported match from player A's perspective", () => {
    expect(
      toPublicMatch({
        match,
        result: won,
        playerA: alice,
        playerB: bob,
        motw: null,
        held: false,
        viewer: guest,
      }),
    ).toMatchObject({
      reported: true,
      pending: false,
      scoreA: 2,
      scoreB: 1,
      winnerId: "alice",
      isMotw: false,
      embargo: null,
    });
  });

  it('keeps a pending free win "offen"', () => {
    const row = toPublicMatch({
      match,
      result: { ...won, outcome: "free_win", games: [] },
      playerA: alice,
      playerB: bob,
      motw: null,
      held: false,
      viewer: guest,
    });
    expect(row).toMatchObject({
      reported: false,
      pending: true,
      scoreA: null,
      winnerId: null,
    });
  });

  describe("Match of the Week", () => {
    const noVod = { youtubeUrl: null };

    it("withholds the result from a guest before the VOD", () => {
      const row = toPublicMatch({
        match,
        result: won,
        playerA: alice,
        playerB: bob,
        motw: noVod,
        held: false,
        viewer: guest,
      });
      expect(row).toMatchObject({
        reported: true,
        scoreA: null,
        scoreB: null,
        winnerId: null,
        isMotw: true,
        embargo: { reason: "motw", access: "withheld" },
      });
    });

    it("withholds it from a player outside the match", () => {
      const row = toPublicMatch({
        match,
        result: won,
        playerA: alice,
        playerB: bob,
        motw: noVod,
        held: false,
        viewer: { userId: "carol", isStaff: false },
      });
      expect(row.embargo?.access).toBe("withheld");
      expect(row.scoreA).toBeNull();
    });

    it("previews it for a participant and for staff", () => {
      for (const viewer of [
        { userId: "bob", isStaff: false },
        { userId: "carol", isStaff: true },
      ]) {
        const row = toPublicMatch({
          match,
          result: won,
          playerA: alice,
          playerB: bob,
          motw: noVod,
          held: false,
          viewer,
        });
        expect(row.embargo).toEqual({ reason: "motw", access: "preview" });
        expect(row.scoreA).toBe(2);
        expect(row.winnerId).toBe("alice");
      }
    });

    it("keeps the score for everyone once the VOD is attached", () => {
      const row = toPublicMatch({
        match,
        result: won,
        playerA: alice,
        playerB: bob,
        motw: { youtubeUrl: "https://youtu.be/x" },
        held: false,
        viewer: guest,
      });
      expect(row).toMatchObject({
        isMotw: true,
        embargo: null,
        scoreA: 2,
        scoreB: 1,
      });
    });

    it("has nothing to withhold while the match is unreported", () => {
      const row = toPublicMatch({
        match,
        result: null,
        playerA: alice,
        playerB: bob,
        motw: noVod,
        held: false,
        viewer: guest,
      });
      expect(row).toMatchObject({
        reported: false,
        isMotw: true,
        embargo: { reason: "motw", access: "withheld" },
      });
    });
  });

  describe("recording hold", () => {
    it("withholds the result from a guest and strips the score", () => {
      const row = toPublicMatch({
        match,
        result: won,
        playerA: alice,
        playerB: bob,
        motw: null,
        held: true,
        viewer: guest,
      });
      expect(row).toMatchObject({
        reported: true,
        scoreA: null,
        scoreB: null,
        winnerId: null,
        isMotw: false,
        embargo: { reason: "recording", access: "withheld" },
      });
    });

    it("previews it for a participant and for staff", () => {
      for (const viewer of [
        { userId: "alice", isStaff: false },
        { userId: "carol", isStaff: true },
      ]) {
        const row = toPublicMatch({
          match,
          result: won,
          playerA: alice,
          playerB: bob,
          motw: null,
          held: true,
          viewer,
        });
        expect(row.embargo).toEqual({ reason: "recording", access: "preview" });
        expect(row.scoreA).toBe(2);
      }
    });
  });
});
