import { describe, expect, it } from "vitest";
import {
  publicEmbargoedIds,
  resultEmbargo,
  withholdScore,
  withoutEmbargoed,
} from "./embargo";

describe("resultEmbargo", () => {
  const noVod = { youtubeUrl: null };
  const withVod = { youtubeUrl: "https://youtu.be/x" };
  const guest = { isStaff: false, isParticipant: false };
  const staff = { isStaff: true, isParticipant: false };
  const participant = { isStaff: false, isParticipant: true };

  it("does not apply to a plain match", () => {
    expect(resultEmbargo({ motw: null, held: false, ...guest })).toBeNull();
    expect(
      resultEmbargo({
        motw: null,
        held: false,
        isStaff: true,
        isParticipant: true,
      }),
    ).toBeNull();
  });

  it("ends the MotW embargo for everyone once the VOD is attached", () => {
    expect(resultEmbargo({ motw: withVod, held: false, ...guest })).toBeNull();
    expect(resultEmbargo({ motw: withVod, held: false, ...staff })).toBeNull();
  });

  it("withholds the MotW result from guests and foreign players", () => {
    expect(resultEmbargo({ motw: noVod, held: false, ...guest })).toEqual({
      reason: "motw",
      access: "withheld",
    });
  });

  it("previews the MotW result for staff and for either participant", () => {
    expect(resultEmbargo({ motw: noVod, held: false, ...staff })).toEqual({
      reason: "motw",
      access: "preview",
    });
    expect(resultEmbargo({ motw: noVod, held: false, ...participant })).toEqual(
      { reason: "motw", access: "preview" },
    );
  });

  it("withholds a held match's result from the public", () => {
    expect(resultEmbargo({ motw: null, held: true, ...guest })).toEqual({
      reason: "recording",
      access: "withheld",
    });
  });

  it("previews a held match's result for staff and participants", () => {
    expect(resultEmbargo({ motw: null, held: true, ...staff })).toEqual({
      reason: "recording",
      access: "preview",
    });
    expect(resultEmbargo({ motw: null, held: true, ...participant })).toEqual({
      reason: "recording",
      access: "preview",
    });
  });

  it("lets the MotW rule win while its VOD is missing", () => {
    expect(resultEmbargo({ motw: noVod, held: true, ...guest })).toEqual({
      reason: "motw",
      access: "withheld",
    });
  });

  it("keeps a held MotW withheld after the VOD, as a recording", () => {
    expect(resultEmbargo({ motw: withVod, held: true, ...guest })).toEqual({
      reason: "recording",
      access: "withheld",
    });
  });
});

describe("withholdScore", () => {
  it("clears score and winner but keeps the row reported", () => {
    const row = {
      matchId: "m1",
      reported: true,
      scoreA: 2,
      scoreB: 1,
      winnerId: "a",
    };
    expect(withholdScore(row)).toEqual({
      matchId: "m1",
      reported: true,
      scoreA: null,
      scoreB: null,
      winnerId: null,
    });
  });
});

describe("publicEmbargoedIds / withoutEmbargoed", () => {
  // What a table has to drop: a row can be hidden from one viewer, an
  // aggregate cannot (docs/plans/standings-embargo.md).
  it("collects the MotW without a VOD and every hold", () => {
    const ids = publicEmbargoedIds({
      motw: [
        { matchId: "m1", youtubeUrl: null },
        { matchId: "m2", youtubeUrl: "https://youtu.be/x" },
      ],
      holds: [{ matchId: "m3" }],
    });
    expect([...ids].sort()).toEqual(["m1", "m3"]);
  });

  it("is empty without an embargo", () => {
    expect(publicEmbargoedIds({ motw: [], holds: [] }).size).toBe(0);
  });

  it("drops exactly those results from a standings input", () => {
    const results = [{ matchId: "m1" }, { matchId: "m2" }, { matchId: "m3" }];
    expect(withoutEmbargoed(results, new Set(["m1", "m3"]))).toEqual([
      { matchId: "m2" },
    ]);
    expect(withoutEmbargoed(results, new Set())).toHaveLength(3);
  });
});
