import { describe, expect, it } from "vitest";
import {
  deriveSeries,
  isHttpsUrl,
  type ReportInput,
  reportSchema,
  toResultRows,
} from "./report";

const ctx = {
  participants: { playerAId: "a", playerBId: "b" },
  isStaffOrAdmin: (id: string) => id === "staff1" || id === "admin1",
  proofRequired: true,
};
const optionalCtx = { ...ctx, proofRequired: false };
const parse = (input: unknown) => reportSchema(ctx).safeParse(input);
const parseOptional = (input: unknown) =>
  reportSchema(optionalCtx).safeParse(input);
const SHEET_A = { source: "pokepaste" as const, ots: "Garchomp @ Life Orb" };
const SHEET_B = { source: "import" as const, ots: "Whimsicott @ Occa Berry" };
const REPLAY = "https://replay.pokemonshowdown.com/gen9-1";

function normal(overrides: Record<string, unknown> = {}) {
  return {
    outcome: "normal",
    platform: "showdown",
    games: [
      { winnerId: "a", replayUrl: REPLAY },
      { winnerId: "a", replayUrl: REPLAY },
    ],
    playerASheet: SHEET_A,
    playerBSheet: SHEET_B,
    ...overrides,
  };
}

// The form gates the cartridge video field on this too, so a YouTube link
// must pass: only the protocol matters, never the host.
describe("isHttpsUrl", () => {
  it("accepts any https link, YouTube included", () => {
    expect(isHttpsUrl("https://www.youtube.com/watch?v=VkOD8wPFftg")).toBe(
      true,
    );
    expect(isHttpsUrl("https://youtu.be/VkOD8wPFftg")).toBe(true);
    expect(isHttpsUrl("https://replay.pokemonshowdown.com/gen9vgc-1")).toBe(
      true,
    );
  });

  it("rejects http, bare text and empty input", () => {
    expect(isHttpsUrl("http://www.youtube.com/watch?v=x")).toBe(false);
    expect(isHttpsUrl("youtube.com/watch?v=x")).toBe(false);
    expect(isHttpsUrl("")).toBe(false);
  });
});

describe("deriveSeries", () => {
  const s = (winners: string[]) => deriveSeries(winners, "a", "b");
  it("2–0 and 0–2 are decisive in two games", () => {
    expect(s(["a", "a"])).toEqual({ ok: true, winnerId: "a", gamesPlayed: 2 });
    expect(s(["b", "b"])).toEqual({ ok: true, winnerId: "b", gamesPlayed: 2 });
  });
  it("2–1 and 1–2 are decisive in three games", () => {
    expect(s(["a", "b", "a"])).toMatchObject({
      ok: true,
      winnerId: "a",
      gamesPlayed: 3,
    });
    expect(s(["b", "a", "b"])).toMatchObject({ ok: true, winnerId: "b" });
  });
  it("rejects too few / too many", () => {
    expect(s(["a"])).toEqual({ ok: false, reason: "too_few" });
    expect(s([])).toEqual({ ok: false, reason: "too_few" });
    expect(s(["a", "b", "a", "b"])).toEqual({ ok: false, reason: "too_many" });
  });
  it("rejects 1–1 without a decider", () => {
    expect(s(["a", "b"])).toEqual({ ok: false, reason: "not_decisive" });
  });
  it("rejects a game played after the series was decided", () => {
    expect(s(["a", "a", "b"])).toEqual({ ok: false, reason: "extra_game" });
    expect(s(["b", "b", "a"])).toEqual({ ok: false, reason: "extra_game" });
    expect(s(["a", "a", "a"])).toEqual({ ok: false, reason: "extra_game" });
  });
  it("rejects an unknown winner", () => {
    expect(s(["a", "c"])).toEqual({ ok: false, reason: "unknown_player" });
  });
});

describe("reportSchema — normal", () => {
  it("accepts a valid showdown 2–0", () => {
    expect(parse(normal()).success).toBe(true);
  });
  it("accepts a valid cartridge 2–1 with optional video", () => {
    const input = normal({
      platform: "cartridge",
      games: [{ winnerId: "a" }, { winnerId: "b" }, { winnerId: "a" }],
      videoUrl: "https://youtu.be/x",
    });
    expect(parse(input).success).toBe(true);
  });
  it("rejects cartridge without a video where proof is required", () => {
    const input = normal({
      platform: "cartridge",
      games: [{ winnerId: "a" }, { winnerId: "a" }],
    });
    expect(parse(input).success).toBe(false);
  });
  it("rejects a showdown game missing its replay", () => {
    const input = normal({
      games: [{ winnerId: "a", replayUrl: REPLAY }, { winnerId: "a" }],
    });
    expect(parse(input).success).toBe(false);
  });
  it("rejects a game won by a non-participant", () => {
    expect(
      parse(
        normal({
          games: [
            { winnerId: "a", replayUrl: REPLAY },
            { winnerId: "c", replayUrl: REPLAY },
          ],
        }),
      ).success,
    ).toBe(false);
  });
  it("rejects a video on showdown", () => {
    expect(parse(normal({ videoUrl: "https://youtu.be/x" })).success).toBe(
      false,
    );
  });
  it("rejects a missing or malformed team sheet", () => {
    // The sheet's *contents* are validated server-side in the action (the
    // parser lives outside this module); the schema guards the shape.
    expect(parse(normal({ playerBSheet: undefined })).success).toBe(false);
    expect(
      parse(normal({ playerBSheet: { source: "import", ots: "" } })).success,
    ).toBe(false);
    expect(
      parse(normal({ playerBSheet: { source: "elsewhere", ots: "x" } }))
        .success,
    ).toBe(false);
  });
  it("rejects an illegal best-of-3 (game 3 after 2–0)", () => {
    const input = normal({
      games: [
        { winnerId: "a", replayUrl: REPLAY },
        { winnerId: "a", replayUrl: REPLAY },
        { winnerId: "b", replayUrl: REPLAY },
      ],
    });
    expect(parse(input).success).toBe(false);
  });
});

// Divisions below the season's replay-requirement cut: proof is optional,
// but provided links are still format-checked.
describe("reportSchema — proof optional", () => {
  it("accepts showdown without any replays", () => {
    const input = normal({
      games: [{ winnerId: "a" }, { winnerId: "a" }],
    });
    expect(parseOptional(input).success).toBe(true);
  });
  it("accepts showdown with replays on some games only", () => {
    const input = normal({
      games: [{ winnerId: "a", replayUrl: REPLAY }, { winnerId: "a" }],
    });
    expect(parseOptional(input).success).toBe(true);
  });
  it("accepts cartridge without a video", () => {
    const input = normal({
      platform: "cartridge",
      games: [{ winnerId: "a" }, { winnerId: "a" }],
    });
    expect(parseOptional(input).success).toBe(true);
  });
  it("still rejects an invalid replay link", () => {
    const input = normal({
      games: [
        { winnerId: "a", replayUrl: "nicht-mal-eine-url" },
        { winnerId: "a" },
      ],
    });
    expect(parseOptional(input).success).toBe(false);
  });
  it("still rejects an invalid video link", () => {
    const input = normal({
      platform: "cartridge",
      games: [{ winnerId: "a" }, { winnerId: "a" }],
      videoUrl: "http://unverschluesselt.example",
    });
    expect(parseOptional(input).success).toBe(false);
  });
  it("still rejects replays on cartridge and video on showdown", () => {
    expect(
      parseOptional(
        normal({
          platform: "cartridge",
          games: [{ winnerId: "a", replayUrl: REPLAY }, { winnerId: "a" }],
        }),
      ).success,
    ).toBe(false);
    expect(
      parseOptional(normal({ videoUrl: "https://youtu.be/x" })).success,
    ).toBe(false);
  });
});

describe("reportSchema — free win", () => {
  const freeWin = (overrides: Record<string, unknown> = {}) => ({
    outcome: "free_win",
    winnerId: "a",
    freeWinReason: "Gegner nicht erschienen",
    discussedWithId: "staff1",
    ...overrides,
  });

  it("accepts a valid free win", () => {
    expect(parse(freeWin()).success).toBe(true);
  });
  it("rejects a non-participant winner", () => {
    expect(parse(freeWin({ winnerId: "c" })).success).toBe(false);
  });
  it("rejects an empty reason", () => {
    expect(parse(freeWin({ freeWinReason: "   " })).success).toBe(false);
  });
  it("rejects a discussed-with who is not staff/admin", () => {
    expect(parse(freeWin({ discussedWithId: "player9" })).success).toBe(false);
  });
});

const PARTICIPANTS = { playerAId: "a", playerBId: "b" };

describe("toResultRows", () => {
  it("keys each sheet to the player it belongs to", () => {
    const input = parse(normal()).data as ReportInput;
    const { sheets } = toResultRows(input, PARTICIPANTS);
    expect(sheets).toEqual([
      { playerId: "a", ...SHEET_A },
      { playerId: "b", ...SHEET_B },
    ]);
  });

  it("maps a 2–0 to the match winner + game rows", () => {
    const input = parse(normal()).data as ReportInput;
    const { result, games } = toResultRows(input, PARTICIPANTS);
    expect(result.outcome).toBe("normal");
    expect(result.winnerId).toBe("a");
    expect(result.videoUrl).toBeNull();
    expect(games).toEqual([
      { gameNumber: 1, winnerId: "a", replayUrl: REPLAY },
      { gameNumber: 2, winnerId: "a", replayUrl: REPLAY },
    ]);
  });

  it("takes the match winner from the game tally", () => {
    const input = parse(
      normal({
        games: [
          { winnerId: "b", replayUrl: REPLAY },
          { winnerId: "b", replayUrl: REPLAY },
        ],
      }),
    ).data as ReportInput;
    const { result, games } = toResultRows(input, PARTICIPANTS);
    expect(result.winnerId).toBe("b");
    expect(games.every((g) => g.winnerId === "b")).toBe(true);
  });

  it("keeps the cartridge video, drops replays", () => {
    const input = parse(
      normal({
        platform: "cartridge",
        games: [{ winnerId: "a" }, { winnerId: "a" }],
        videoUrl: "https://youtu.be/x",
      }),
    ).data as ReportInput;
    const { result, games } = toResultRows(input, PARTICIPANTS);
    expect(result.videoUrl).toBe("https://youtu.be/x");
    expect(games.every((g) => g.replayUrl === null)).toBe(true);
  });

  it("maps a free win with no games", () => {
    const input = {
      outcome: "free_win" as const,
      winnerId: "b",
      freeWinReason: "no show",
      discussedWithId: "staff1",
    };
    const { result, games, sheets } = toResultRows(input, PARTICIPANTS);
    expect(sheets).toEqual([]);
    expect(result).toMatchObject({
      outcome: "free_win",
      winnerId: "b",
      discussedWithId: "staff1",
      platform: null,
    });
    expect(games).toEqual([]);
  });
});
