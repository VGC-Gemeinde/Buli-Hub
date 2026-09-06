import { describe, expect, it } from "vitest";
import {
  cardView,
  needsAttention,
  type SeasonDiscordReport,
  seasonDiscordReportSchema,
  skipReasonLabel,
} from "./report";

const NOW = new Date("2026-09-06T12:00:00Z");
const RECENT = new Date("2026-09-06T11:50:00Z");
const OLD = new Date("2026-09-06T10:50:00Z");

const CONVERGED: SeasonDiscordReport = {
  groupsReady: 4,
  groupsTotal: 4,
  playersReady: 40,
  playersTotal: 40,
  skipped: [],
  error: null,
};

describe("needsAttention", () => {
  it("is silent on a fresh converged report", () => {
    expect(needsAttention({ ranAt: RECENT, report: CONVERGED }, NOW)).toBe(
      false,
    );
  });

  it("raises when no sync ever ran", () => {
    expect(needsAttention(null, NOW)).toBe(true);
  });

  it("raises when the last run is over an hour old", () => {
    expect(needsAttention({ ranAt: OLD, report: CONVERGED }, NOW)).toBe(true);
  });

  it("raises on an error, a missing group, or a hub-side skip", () => {
    expect(
      needsAttention(
        { ranAt: RECENT, report: { ...CONVERGED, error: "HTTP 403" } },
        NOW,
      ),
    ).toBe(true);
    expect(
      needsAttention(
        { ranAt: RECENT, report: { ...CONVERGED, groupsReady: 3 } },
        NOW,
      ),
    ).toBe(true);
    expect(
      needsAttention(
        {
          ranAt: RECENT,
          report: {
            ...CONVERGED,
            skipped: [{ name: "Alice", reason: "no_discord_id" }],
          },
        },
        NOW,
      ),
    ).toBe(true);
  });

  it("stays silent for players who are merely not on the server", () => {
    expect(
      needsAttention(
        {
          ranAt: RECENT,
          report: {
            ...CONVERGED,
            playersReady: 39,
            skipped: [{ name: "Bob", reason: "not_on_server" }],
          },
        },
        NOW,
      ),
    ).toBe(false);
  });
});

describe("cardView", () => {
  it("maps the three states and drops non-member skips", () => {
    expect(cardView(null, NOW)).toEqual({ kind: "never" });
    expect(cardView({ ranAt: OLD, report: CONVERGED }, NOW)).toEqual({
      kind: "stale",
      ranAt: OLD,
    });
    expect(
      cardView(
        {
          ranAt: RECENT,
          report: {
            ...CONVERGED,
            groupsReady: 3,
            error: "x",
            skipped: [
              { name: "Alice", reason: "no_discord_id" },
              { name: "Bob", reason: "not_on_server" },
              { name: "Carol", reason: "error" },
            ],
          },
        },
        NOW,
      ),
    ).toEqual({
      kind: "attention",
      ranAt: RECENT,
      groups: { ready: 3, total: 4 },
      players: { ready: 40, total: 40 },
      error: "x",
      skipped: [
        { name: "Alice", reason: "no_discord_id" },
        { name: "Carol", reason: "error" },
      ],
    });
  });
});

describe("report schema", () => {
  it("round-trips a report and rejects garbage", () => {
    expect(seasonDiscordReportSchema.parse(CONVERGED)).toEqual(CONVERGED);
    expect(
      seasonDiscordReportSchema.safeParse({ groupsReady: "4" }).success,
    ).toBe(false);
  });

  it("labels every skip reason in German", () => {
    expect(skipReasonLabel("no_discord_id")).toBe("keine Discord-ID");
    expect(skipReasonLabel("not_on_server")).toBe("nicht auf dem Server");
    expect(skipReasonLabel("error")).toBe("Fehler");
  });
});
