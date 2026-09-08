import { describe, expect, it } from "vitest";
import {
  motwVodMessage,
  type ResultMessageInput,
  resultMessage,
  shouldPostResult,
} from "./messages";

const BASE: ResultMessageInput = {
  groupName: "Division 1a",
  round: 3,
  playerAName: "Alice",
  playerBName: "Bob",
  outcome: "normal",
  winnerName: null,
  scoreA: 2,
  scoreB: 1,
  platform: "showdown",
  playerATeamUrl: "https://pokepast.es/aaa",
  playerBTeamUrl: "https://pokepast.es/bbb",
  videoUrl: null,
  replayUrls: [
    "https://replay.pokemonshowdown.com/g1",
    "https://replay.pokemonshowdown.com/g2",
    "https://replay.pokemonshowdown.com/g3",
  ],
  corrected: false,
  matchUrl: "https://hub.example/match/m1",
  isMotw: false,
};

describe("resultMessage", () => {
  it("marks the Match of the Week in the header", () => {
    expect(resultMessage({ ...BASE, isMotw: true })).toContain(
      "__**VGC Bundesliga · Division 1a · Spieltag 3 · Match of the Week**__",
    );
    expect(resultMessage(BASE)).not.toContain("Match of the Week");
  });

  it("renders the full Showdown three-game message", () => {
    expect(resultMessage(BASE)).toBe(
      `__**VGC Bundesliga · Division 1a · Spieltag 3**__

**Alice**  ||2 - 1||  **Bob**

Team von Alice: <https://pokepast.es/aaa>
Team von Bob: <https://pokepast.es/bbb>

Game 1: *<https://replay.pokemonshowdown.com/g1>*
Game 2: *<https://replay.pokemonshowdown.com/g2>*
Game 3: ||*<https://replay.pokemonshowdown.com/g3>*||

Zum Match: <https://hub.example/match/m1>`,
    );
  });

  it("suppresses link previews for everything but the match video", () => {
    const message = resultMessage(BASE);
    // Every URL sits in angle brackets: no embed for teams, replays, hub link.
    const bare = message.match(/(?<!<)https?:\/\/\S+/g) ?? [];
    expect(bare).toEqual([]);
  });

  it("fills the Game-3 slot with game 2's replay as a decoy on a 2-0", () => {
    const message = resultMessage({
      ...BASE,
      scoreA: 2,
      scoreB: 0,
      replayUrls: BASE.replayUrls.slice(0, 2),
    });
    expect(message).toContain(
      "Game 3: ||*<https://replay.pokemonshowdown.com/g2>*||",
    );
    // Same line count as a three-game series — the shape never leaks.
    expect(message.split("\n").length).toBe(
      resultMessage(BASE).split("\n").length,
    );
  });

  it("renders the Cartridge variant: teams + italic video, no game lines", () => {
    const message = resultMessage({
      ...BASE,
      platform: "cartridge",
      replayUrls: [],
      videoUrl: "https://youtu.be/QbxY2WuzCrU",
    });
    // The one link in a result post that keeps its preview.
    expect(message).toContain("Video: *https://youtu.be/QbxY2WuzCrU*");
    expect(message).not.toContain("<https://youtu.be/QbxY2WuzCrU>");
    expect(message).not.toContain("Game 1");
  });

  it("omits the video line when a Cartridge match has none", () => {
    const message = resultMessage({
      ...BASE,
      platform: "cartridge",
      replayUrls: [],
    });
    expect(message).not.toContain("Video:");
  });

  it("renders a free win with the winner inside the spoiler, no teams", () => {
    const message = resultMessage({
      ...BASE,
      outcome: "free_win",
      winnerName: "Bob",
      platform: null,
      playerATeamUrl: null,
      playerBTeamUrl: null,
      replayUrls: [],
    });
    expect(message).toBe(
      `__**VGC Bundesliga · Division 1a · Spieltag 3**__

**Alice**  ||Freewin für Bob||  **Bob**

Zum Match: <https://hub.example/match/m1>`,
    );
  });

  it("renders a double loss without a winner", () => {
    const message = resultMessage({
      ...BASE,
      outcome: "double_loss",
      platform: null,
      playerATeamUrl: null,
      playerBTeamUrl: null,
      replayUrls: [],
    });
    expect(message).toContain("**Alice**  ||Doppelniederlage||  **Bob**");
  });

  it("appends the (korrigiert) marker on corrected results", () => {
    expect(resultMessage({ ...BASE, corrected: true })).toMatch(
      /\*\(korrigiert\)\*$/,
    );
  });

  it("omits the hub link without a base URL", () => {
    expect(resultMessage({ ...BASE, matchUrl: null })).not.toContain(
      "Zum Match",
    );
  });

  it("never bolds only the winner", () => {
    // Both names bold in every variant — anything else leaks the result.
    const message = resultMessage(BASE);
    expect(message).toContain("**Alice**");
    expect(message).toContain("**Bob**");
  });
});

describe("motwVodMessage", () => {
  it("announces the VOD without any result, YouTube link unwrapped", () => {
    expect(
      motwVodMessage({
        round: 3,
        playerAName: "Alice",
        playerBName: "Bob",
        youtubeUrl: "https://youtu.be/xyz",
        matchUrl: "https://hub.example/match/m1",
      }),
    ).toBe(
      `__**VGC Bundesliga · Match of the Week · Spieltag 3**__

**Alice** vs. **Bob**: das VOD ist da!
https://youtu.be/xyz

Zum Match: <https://hub.example/match/m1>`,
    );
  });

  it("omits the hub link without a base URL", () => {
    expect(
      motwVodMessage({
        round: 3,
        playerAName: "Alice",
        playerBName: "Bob",
        youtubeUrl: "https://youtu.be/xyz",
        matchUrl: null,
      }),
    ).not.toContain("Zum Match");
  });
});

describe("shouldPostResult", () => {
  const confirmed = { outcome: "normal" as const, confirmedAt: null };
  const base = { motw: null, held: false, hasDroppedParticipant: false };

  it("posts a public normal result", () => {
    expect(shouldPostResult({ ...base, result: confirmed })).toBe(true);
  });

  it("posts nothing for an unreported match", () => {
    expect(shouldPostResult({ ...base, result: null })).toBe(false);
  });

  it("holds a pending free win until staff confirm it", () => {
    expect(
      shouldPostResult({
        ...base,
        result: { outcome: "free_win", confirmedAt: null },
      }),
    ).toBe(false);
    expect(
      shouldPostResult({
        ...base,
        result: { outcome: "free_win", confirmedAt: new Date() },
      }),
    ).toBe(true);
  });

  it("holds the Match of the Week's result until its VOD is live", () => {
    expect(
      shouldPostResult({
        ...base,
        motw: { youtubeUrl: null },
        result: confirmed,
      }),
    ).toBe(false);
    expect(
      shouldPostResult({
        ...base,
        motw: { youtubeUrl: "https://youtu.be/x" },
        result: confirmed,
      }),
    ).toBe(true);
  });

  it("still holds a pending free win of the Match of the Week after the VOD", () => {
    expect(
      shouldPostResult({
        ...base,
        motw: { youtubeUrl: "https://youtu.be/x" },
        result: { outcome: "free_win", confirmedAt: null },
      }),
    ).toBe(false);
  });

  it("holds a match marked for a recording until staff release it", () => {
    expect(shouldPostResult({ ...base, held: true, result: confirmed })).toBe(
      false,
    );
    expect(
      shouldPostResult({
        ...base,
        held: true,
        motw: { youtubeUrl: "https://youtu.be/x" },
        result: confirmed,
      }),
    ).toBe(false);
  });

  it("never posts drop-decided matches", () => {
    expect(
      shouldPostResult({
        ...base,
        hasDroppedParticipant: true,
        result: confirmed,
      }),
    ).toBe(false);
  });
});
