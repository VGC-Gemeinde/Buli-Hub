import { describe, expect, it } from "vitest";
import { streamPhotoUrl } from "@/features/stream-photos/photo";
import {
  type MatchInput,
  toStreamMatch,
  toStreamMatchDetail,
} from "./to-stream-match";

const alice = "00000000-0000-0000-0000-00000000000a";
const bob = "00000000-0000-0000-0000-00000000000b";
const carol = "00000000-0000-0000-0000-00000000000c";

const base: MatchInput = {
  id: "m1",
  round: 3,
  tier: 1,
  position: 1,
  playerAId: alice,
  playerBId: bob,
  playerA: {
    displayName: "Alice",
    username: "alice",
    streamPhotoPath: "alice/photo.webp",
  },
  playerB: { displayName: null, username: "bobby", streamPhotoPath: null },
  platform: "showdown",
  reportedAt: new Date("2026-07-03T18:00:00Z"),
  motw: true,
  recording: true,
  games: [
    { gameNumber: 2, winnerId: bob },
    { gameNumber: 1, winnerId: alice },
    { gameNumber: 3, winnerId: alice },
  ],
  sheets: [
    { playerId: bob, ots: "Whimsicott @ Occa Berry" },
    { playerId: alice, ots: "Garchomp @ Life Orb" },
  ],
};

describe("toStreamMatchDetail", () => {
  it("maps names, groups, games in order and sheets by side", () => {
    const match = toStreamMatchDetail(base);
    expect(match).toEqual({
      id: "m1",
      round: 3,
      division: { tier: 1, name: "Division 1" },
      group: { name: "Division 1b", shortName: "1b" },
      playerA: {
        id: alice,
        name: "Alice",
        photoUrl: streamPhotoUrl("alice/photo.webp"),
        // The Discord avatar is no longer part of the stream payload.
        avatarUrl: null,
      },
      playerB: {
        id: bob,
        name: "bobby",
        photoUrl: null,
        avatarUrl: null,
      },
      games: ["a", "b", "a"],
      platform: "showdown",
      motw: true,
      recording: true,
      reportedAt: "2026-07-03T18:00:00.000Z",
      sheets: { a: "Garchomp @ Life Orb", b: "Whimsicott @ Occa Berry" },
    });
  });

  it("falls back to the generic player name without a profile", () => {
    const match = toStreamMatchDetail({ ...base, playerA: null });
    expect(match?.playerA.name).toBe("Discord-Nutzer");
  });

  it("is null for a result without platform or games", () => {
    expect(toStreamMatchDetail({ ...base, platform: null })).toBeNull();
    expect(toStreamMatchDetail({ ...base, games: [] })).toBeNull();
  });

  it("is null when a game winner is neither participant", () => {
    expect(
      toStreamMatchDetail({
        ...base,
        games: [{ gameNumber: 1, winnerId: carol }],
      }),
    ).toBeNull();
  });

  it("is null when a sheet is missing", () => {
    expect(
      toStreamMatchDetail({ ...base, sheets: base.sheets.slice(0, 1) }),
    ).toBeNull();
  });
});

describe("toStreamMatch", () => {
  it("drops photos and sheets", () => {
    const match = toStreamMatch(base);
    expect(match).not.toBeNull();
    expect(match).not.toHaveProperty("sheets");
    expect(match?.playerA).toEqual({ id: alice, name: "Alice" });
    expect(match?.games).toEqual(["a", "b", "a"]);
  });

  it("is null whenever the detail is", () => {
    expect(toStreamMatch({ ...base, platform: null })).toBeNull();
  });
});
