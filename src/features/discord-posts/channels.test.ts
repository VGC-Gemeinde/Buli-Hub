import { afterEach, describe, expect, it, vi } from "vitest";
import { resultChannelFor, resultChannels } from "./channels";

const CHANNELS = { topResults: "top", otherResults: "other", motw: "motw" };

describe("resultChannelFor", () => {
  it("routes Division 1 and 2 to the top results channel", () => {
    expect(resultChannelFor(1, CHANNELS)).toBe("top");
    expect(resultChannelFor(2, CHANNELS)).toBe("top");
  });

  it("routes every lower division to the other results channel", () => {
    expect(resultChannelFor(3, CHANNELS)).toBe("other");
    expect(resultChannelFor(9, CHANNELS)).toBe("other");
  });
});

describe("resultChannels", () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  afterEach(() => {
    error.mockClear();
  });

  const ALL = {
    DISCORD_RESULTS_TOP_CHANNEL_ID: "top",
    DISCORD_RESULTS_CHANNEL_ID: "other",
    DISCORD_MOTW_CHANNEL_ID: "motw",
  };

  it("is null and silent when nothing is configured", () => {
    expect(resultChannels({})).toBeNull();
    expect(
      resultChannels({
        DISCORD_RESULTS_TOP_CHANNEL_ID: "",
        DISCORD_RESULTS_CHANNEL_ID: "",
        DISCORD_MOTW_CHANNEL_ID: "",
      }),
    ).toBeNull();
    expect(error).not.toHaveBeenCalled();
  });

  it("returns the three ids when all are set", () => {
    expect(resultChannels(ALL)).toEqual(CHANNELS);
    expect(error).not.toHaveBeenCalled();
  });

  it("accepts the same id for all three channels", () => {
    expect(
      resultChannels({
        DISCORD_RESULTS_TOP_CHANNEL_ID: "one",
        DISCORD_RESULTS_CHANNEL_ID: "one",
        DISCORD_MOTW_CHANNEL_ID: "one",
      }),
    ).toEqual({ topResults: "one", otherResults: "one", motw: "one" });
  });

  it.each([
    ["DISCORD_RESULTS_TOP_CHANNEL_ID"],
    ["DISCORD_RESULTS_CHANNEL_ID"],
    ["DISCORD_MOTW_CHANNEL_ID"],
  ])("is null and logs when %s is missing", (name) => {
    const env = { ...ALL, [name]: "" };
    expect(resultChannels(env)).toBeNull();
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]?.[0]).toContain(name);
  });

  it("names every missing variable when only one is set", () => {
    expect(resultChannels({ DISCORD_RESULTS_CHANNEL_ID: "other" })).toBeNull();
    expect(error.mock.calls[0]?.[0]).toContain(
      "DISCORD_RESULTS_TOP_CHANNEL_ID, DISCORD_MOTW_CHANNEL_ID",
    );
  });
});
