import { describe, expect, it } from "vitest";
import type { PublicDivision, PublicMatch } from "../public-league/queries";
import {
  billboardSelection,
  buildMotwWeeks,
  canNominate,
  canSelectRound,
  defaultDivisionFilter,
  findMotw,
  initialMotwRound,
  isYoutubeUrl,
  type MotwOption,
  type MotwPlayer,
  motwTodo,
  recordability,
  selectableRounds,
  sortOptions,
  toggleAllDivisions,
  weekCandidates,
  weekState,
  youtubeUrlSchema,
} from "./motw";

describe("motwTodo", () => {
  const base = { currentRound: 3, totalRounds: 7 };
  const todo = (confirmed: number[], candidates: number[]) =>
    motwTodo({
      ...base,
      confirmedRounds: new Set(confirmed),
      candidateRounds: new Set(candidates),
    });

  it("is urgent when the current round has no candidate at all", () => {
    expect(todo([], [])).toEqual({
      round: 3,
      kind: "nominate",
      urgency: "urgent",
    });
  });

  it("surfaces only the urgent item while the current round is empty", () => {
    // Even a prepared next week does not soften the current round's gap …
    expect(todo([], [4])).toEqual({
      round: 3,
      kind: "nominate",
      urgency: "urgent",
    });
    // … and with both empty, the warning is replaced, not shown alongside.
    expect(todo([], [])).toEqual({
      round: 3,
      kind: "nominate",
      urgency: "urgent",
    });
  });

  it("warns when only the next round is empty", () => {
    expect(todo([], [3])).toEqual({
      round: 4,
      kind: "nominate",
      urgency: "warning",
    });
  });

  it("counts a confirmed round as taken care of", () => {
    expect(todo([3, 4], [])).toBeNull();
  });

  it("is silent while the running week is nominated but undecided", () => {
    // Deciding during the week is normal, the billboard still has last week.
    expect(todo([], [3, 4])).toBeNull();
  });

  it("asks to confirm a finished week whose candidates were never decided", () => {
    // This is the one that holds the billboard on an older week.
    expect(todo([], [2, 3, 4])).toEqual({
      round: 2,
      kind: "confirm",
      urgency: "urgent",
    });
  });

  it("asks about the latest undecided week and outranks an empty current one", () => {
    expect(todo([], [1, 2])).toEqual({
      round: 2,
      kind: "confirm",
      urgency: "urgent",
    });
  });

  it("does not warn past the last round", () => {
    expect(
      motwTodo({
        currentRound: 7,
        totalRounds: 7,
        confirmedRounds: new Set([7]),
        candidateRounds: new Set(),
      }),
    ).toBeNull();
  });

  it("still asks to confirm once the season is over", () => {
    // Without a running round every week is past, so an undecided one counts.
    expect(
      motwTodo({
        currentRound: null,
        totalRounds: 7,
        confirmedRounds: new Set([1]),
        candidateRounds: new Set([1, 7]),
      }),
    ).toEqual({ round: 7, kind: "confirm", urgency: "urgent" });
  });

  it("is silent outside a running round with nothing left to decide", () => {
    expect(
      motwTodo({
        currentRound: null,
        totalRounds: 7,
        confirmedRounds: new Set(),
        candidateRounds: new Set(),
      }),
    ).toBeNull();
  });
});

describe("billboardSelection", () => {
  const s = (round: number) => ({ round, matchId: `m${round}` });

  it("features the running Spieltag's confirmation", () => {
    expect(billboardSelection([s(1), s(2), s(3)], 3)).toEqual(s(3));
  });

  it("carries the previous week while the running one is undecided", () => {
    expect(billboardSelection([s(1), s(2)], 3)).toEqual(s(2));
  });

  it("carries an older week rather than showing nothing", () => {
    // No age limit: an empty billboard is worse than an old one, and the staff
    // todo is what nags about the gap.
    expect(billboardSelection([s(1)], 6)).toEqual(s(1));
  });

  it("never features a week that has not started", () => {
    expect(billboardSelection([s(5)], 3)).toBeNull();
    expect(billboardSelection([s(2), s(5)], 3)).toEqual(s(2));
  });

  it("keeps the last confirmation once the season is over", () => {
    expect(billboardSelection([s(2), s(9)], null)).toEqual(s(9));
  });

  it("is null while the season has no confirmation", () => {
    expect(billboardSelection([], 3)).toBeNull();
  });
});

describe("canSelectRound / selectableRounds", () => {
  const base = { currentRound: 3, totalRounds: 7 };
  const can = (round: number, confirmed: number[] = []) =>
    canSelectRound({ ...base, round, confirmedRounds: new Set(confirmed) });

  it("opens the running round and every one after it", () => {
    expect(can(3)).toBe(true);
    expect(can(7)).toBe(true);
    // Even once picked — the current and future weeks stay replaceable.
    expect(can(3, [3])).toBe(true);
    expect(can(5, [5])).toBe(true);
  });

  it("opens a past round that was never picked", () => {
    // A missed week can still be backfilled, typically once a VOD turns up.
    expect(can(1)).toBe(true);
    expect(can(2, [3])).toBe(true);
  });

  it("closes a past round that already has a pick", () => {
    expect(can(1, [1])).toBe(false);
    expect(can(2, [1, 2, 3])).toBe(false);
  });

  it("rejects a round outside the schedule", () => {
    expect(can(0)).toBe(false);
    expect(can(8)).toBe(false);
  });

  it("collects the same rule into a set", () => {
    expect(selectableRounds(3, 7, new Set([1, 3]))).toEqual(
      // 1 is picked and past → closed; 2 is past but unpicked → open.
      new Set([2, 3, 4, 5, 6, 7]),
    );
    expect(selectableRounds(7, 7)).toEqual(new Set([1, 2, 3, 4, 5, 6, 7]));
  });

  it("still allows backfilling after the season has ended", () => {
    // No running round → every week is past, so only the unpicked ones remain.
    expect(selectableRounds(null, 3, new Set([2]))).toEqual(new Set([1, 3]));
  });
});

describe("weekState", () => {
  it("splits the season around the running round", () => {
    expect(weekState(2, 3)).toBe("past");
    expect(weekState(3, 3)).toBe("current");
    expect(weekState(4, 3)).toBe("future");
  });
  it("treats every round as past outside a running season", () => {
    expect(weekState(1, null)).toBe("past");
    expect(weekState(9, null)).toBe("past");
  });
});

describe("initialMotwRound", () => {
  const open = (
    confirmed: number[],
    candidates: number[],
    currentRound: number | null = 3,
  ) =>
    initialMotwRound({
      totalRounds: 7,
      currentRound,
      confirmedRounds: new Set(confirmed),
      candidateRounds: new Set(candidates),
    });

  it("opens on the running round while it is unconfirmed", () => {
    expect(open([1, 2], [])).toBe(3);
    // Nominated but undecided is exactly where the decision is made.
    expect(open([1, 2], [3])).toBe(3);
  });

  it("opens on a finished week that still needs a decision", () => {
    // The week holding the billboard back beats every other kind of work.
    expect(open([1], [1, 2, 3])).toBe(2);
  });

  it("opens on the first later round without anything, once today is decided", () => {
    expect(open([3, 4], [])).toBe(5);
    expect(open([3], [4])).toBe(5);
  });

  it("falls back to the running round once everything is prepared", () => {
    expect(open([3, 4, 5, 6, 7], [])).toBe(3);
  });

  it("opens on the last round outside a running season", () => {
    expect(open([], [], null)).toBe(7);
  });

  it("never returns a round below 1", () => {
    expect(
      initialMotwRound({
        totalRounds: 0,
        currentRound: null,
        confirmedRounds: new Set(),
        candidateRounds: new Set(),
      }),
    ).toBe(1);
  });
});

describe("defaultDivisionFilter", () => {
  it("preselects the top two divisions", () => {
    expect(defaultDivisionFilter([1, 2, 3, 4])).toEqual(new Set([1, 2]));
  });
  it("never selects a division the season does not have", () => {
    expect(defaultDivisionFilter([1])).toEqual(new Set([1]));
    expect(defaultDivisionFilter([])).toEqual(new Set());
  });
});

describe("toggleAllDivisions", () => {
  const all = [1, 2, 3];

  it("selects everything while something is missing", () => {
    expect(toggleAllDivisions(new Set([1, 2]), all)).toEqual(new Set(all));
    expect(toggleAllDivisions(new Set(), all)).toEqual(new Set(all));
  });

  it("clears the selection only when every division is selected", () => {
    expect(toggleAllDivisions(new Set([1, 2, 3]), all)).toEqual(new Set());
  });

  it("ignores a stale selection outside the season's divisions", () => {
    // A tier that is no longer in the list must not count towards "complete".
    expect(toggleAllDivisions(new Set([1, 2, 9]), all)).toEqual(new Set(all));
  });

  it("does nothing meaningful without divisions", () => {
    expect(toggleAllDivisions(new Set(), [])).toEqual(new Set());
  });
});

describe("sortOptions / weekCandidates / buildMotwWeeks", () => {
  const player = (
    name: string,
    rank: number | null,
    hasCaptureCard = true,
    profileEdited = true,
  ): MotwPlayer => ({
    userId: name,
    name,
    avatarUrl: null,
    streamPhotoUrl: null,
    rank,
    wins: 0,
    losses: 0,
    hasCaptureCard,
    profileEdited,
    dropped: false,
  });
  const option = (
    matchId: string,
    round: number,
    rankA: number | null,
    rankB: number | null,
    captureCards = true,
  ): MotwOption => ({
    matchId,
    round,
    tier: 1,
    groupName: "Division 1a",
    playerA: player(`${matchId}a`, rankA, captureCards),
    playerB: player(`${matchId}b`, rankB, captureCards),
    reported: false,
  });

  it("keeps the incoming order in division mode", () => {
    const list = [
      option("m1", 1, 8, 9),
      option("m2", 1, 1, 2),
      option("m3", 1, 4, 5),
    ];
    expect(sortOptions(list, "division").map((c) => c.matchId)).toEqual([
      "m1",
      "m2",
      "m3",
    ]);
  });

  it("puts the best combined placement first in rank mode", () => {
    const list = [
      option("m1", 1, 8, 9),
      option("m2", 1, 1, 2),
      option("m3", 1, 4, 5),
    ];
    expect(sortOptions(list, "rank").map((c) => c.matchId)).toEqual([
      "m2",
      "m3",
      "m1",
    ]);
  });

  it("sorts unranked pairings last and keeps equal sums stable", () => {
    const list = [
      option("m1", 1, null, 1),
      option("m2", 1, 3, 4),
      option("m3", 1, 2, 5),
      option("m4", 1, null, null),
    ];
    expect(sortOptions(list, "rank").map((c) => c.matchId)).toEqual([
      "m2",
      "m3",
      "m1",
      "m4",
    ]);
  });

  it("answers recordability as yes / no / unknown", () => {
    expect(recordability(option("m1", 1, 1, 2, true))).toBe("yes");

    // One side is enough.
    const halfway = option("m2", 1, 1, 2, false);
    halfway.playerA.hasCaptureCard = true;
    expect(recordability(halfway)).toBe("yes");

    // Both answered the question, and both said no.
    expect(recordability(option("m3", 1, 1, 2, false))).toBe("no");

    // A player who never saved a profile has `hasCaptureCard: false` by
    // default — that is not an answer, so the pairing is unknown, not a no.
    const untouched = option("m4", 1, 1, 2, false);
    untouched.playerB.profileEdited = false;
    expect(recordability(untouched)).toBe("unknown");

    // …unless the other side already has one, which settles it.
    untouched.playerA.hasCaptureCard = true;
    expect(recordability(untouched)).toBe("yes");
  });

  const matchdays = [
    { round: 2, startsOn: "2026-01-12", endsOn: "2026-01-18" },
    { round: 1, startsOn: "2026-01-05", endsOn: "2026-01-11" },
    { round: 3, startsOn: "2026-01-19", endsOn: "2026-01-25" },
  ];

  it("builds one week per matchday in round order, with its state", () => {
    const weeks = buildMotwWeeks({
      matchdays,
      currentRound: 2,
      selections: [],
      options: [],
      holds: [],
    });
    expect(weeks.map((w) => [w.round, w.state])).toEqual([
      [1, "past"],
      [2, "current"],
      [3, "future"],
    ]);
    expect(weeks[0].startsOn).toBe("2026-01-05");
  });

  it("marks a week editable unless it is a past week with a pick", () => {
    const unpicked = buildMotwWeeks({
      matchdays,
      currentRound: 2,
      selections: [],
      options: [],
      holds: [],
    });
    // The past week was missed, so it can still be backfilled.
    expect(unpicked.map((w) => w.editable)).toEqual([true, true, true]);

    const picked = buildMotwWeeks({
      matchdays,
      currentRound: 2,
      selections: [
        { round: 1, matchId: "m1", youtubeUrl: null },
        { round: 2, matchId: "m2", youtubeUrl: null },
      ],
      options: [],
      holds: [],
    });
    // Only the settled past week closes; the running one stays replaceable.
    expect(picked.map((w) => w.editable)).toEqual([false, true, true]);
  });

  it("groups options by round and resolves the confirmation", () => {
    const weeks = buildMotwWeeks({
      matchdays,
      currentRound: 2,
      selections: [{ round: 2, matchId: "m2", youtubeUrl: "https://y" }],
      options: [
        option("m1", 1, 1, 2),
        option("m2", 2, 3, 4),
        option("m3", 2, 5, 6),
      ],
      holds: [],
    });
    expect(weeks[0].options.map((o) => o.matchId)).toEqual(["m1"]);
    expect(weeks[1].options.map((o) => o.matchId)).toEqual(["m2", "m3"]);
    expect(weeks[1].selectedMatch?.matchId).toBe("m2");
    expect(weeks[1].selection?.youtubeUrl).toBe("https://y");
    expect(weeks[2].options).toEqual([]);
    expect(weeks[2].selection).toBeNull();
  });

  it("hangs the week's nominated candidates off the holds", () => {
    const weeks = buildMotwWeeks({
      matchdays,
      currentRound: 2,
      selections: [],
      options: [option("m2", 2, 3, 4), option("m3", 2, 5, 6)],
      holds: [
        { matchId: "m3", round: 2, motwRole: "backup" },
        { matchId: "m2", round: 2, motwRole: "primary" },
      ],
    });
    expect(weeks[1].candidates.map((c) => [c.option.matchId, c.role])).toEqual([
      ["m2", "primary"],
      ["m3", "backup"],
    ]);
    expect(weeks[0].candidates).toEqual([]);
  });

  it("keeps the selection but resolves no match when it left the round", () => {
    const weeks = buildMotwWeeks({
      matchdays,
      currentRound: 2,
      // The featured match dropped out of the pairings (a participant dropped
      // afterwards) — the week still knows it is confirmed.
      selections: [{ round: 2, matchId: "gone", youtubeUrl: null }],
      options: [option("m2", 2, 3, 4)],
      holds: [],
    });
    expect(weeks[1].selection?.matchId).toBe("gone");
    expect(weeks[1].selectedMatch).toBeNull();
  });
});

describe("weekCandidates", () => {
  const option = (matchId: string, round: number): MotwOption => ({
    matchId,
    round,
    tier: 1,
    groupName: "Division 1a",
    playerA: {
      userId: `${matchId}a`,
      name: `${matchId}a`,
      avatarUrl: null,
      streamPhotoUrl: null,
      rank: 1,
      wins: 0,
      losses: 0,
      hasCaptureCard: true,
      profileEdited: true,
      dropped: false,
    },
    playerB: {
      userId: `${matchId}b`,
      name: `${matchId}b`,
      avatarUrl: null,
      streamPhotoUrl: null,
      rank: 2,
      wins: 0,
      losses: 0,
      hasCaptureCard: true,
      profileEdited: true,
      dropped: false,
    },
    reported: false,
  });
  const options = [option("m1", 2), option("m2", 2), option("m3", 3)];

  it("puts the Hauptkandidat first and keeps the backups in order", () => {
    const holds = [
      { matchId: "m2", round: 2, motwRole: "backup" as const },
      { matchId: "m1", round: 2, motwRole: "primary" as const },
    ];
    expect(
      weekCandidates(options, holds, 2).map((c) => [c.option.matchId, c.role]),
    ).toEqual([
      ["m1", "primary"],
      ["m2", "backup"],
    ]);
  });

  it("ignores holds of other rounds and plain recordings", () => {
    const holds = [
      { matchId: "m3", round: 3, motwRole: "primary" as const },
      { matchId: "m1", round: 2, motwRole: null },
    ];
    expect(weekCandidates(options, holds, 2)).toEqual([]);
  });

  it("skips a nomination whose match is no longer a pairing", () => {
    // A participant dropped after the nomination. The hold itself stays
    // visible in the recordings workspace, which is where it is released.
    const holds = [{ matchId: "gone", round: 2, motwRole: "primary" as const }];
    expect(weekCandidates(options, holds, 2)).toEqual([]);
  });
});

describe("canNominate", () => {
  const option = (round: number, reported: boolean): MotwOption =>
    ({ matchId: "m", round, reported }) as MotwOption;

  it("allows the running Spieltag and every later one", () => {
    expect(canNominate(option(3, false), 3)).toBe(true);
    expect(canNominate(option(5, false), 3)).toBe(true);
  });

  it("refuses a reported match, whose result is already public", () => {
    expect(canNominate(option(3, true), 3)).toBe(false);
  });

  it("refuses a past Spieltag and a season without a running round", () => {
    expect(canNominate(option(2, false), 3)).toBe(false);
    expect(canNominate(option(2, false), null)).toBe(false);
  });
});

describe("youtubeUrlSchema", () => {
  it.each([
    "https://www.youtube.com/watch?v=abc123",
    "https://youtube.com/watch?v=abc123",
    "https://m.youtube.com/watch?v=abc123",
    "https://youtu.be/abc123",
    "https://www.youtube.com/live/abc123",
  ])("accepts %s", (url) => {
    expect(youtubeUrlSchema.safeParse(url).success).toBe(true);
  });

  it.each([
    "http://www.youtube.com/watch?v=abc123", // not https
    "https://vimeo.com/12345", // wrong host
    "https://youtube.com.evil.example/watch", // host suffix trick
    "youtube.com/watch?v=abc123", // no scheme
    "not a url",
    "",
  ])("rejects %s", (url) => {
    expect(youtubeUrlSchema.safeParse(url).success).toBe(false);
  });

  it("trims surrounding whitespace", () => {
    const parsed = youtubeUrlSchema.safeParse("  https://youtu.be/abc123  ");
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toBe("https://youtu.be/abc123");
    }
  });

  it("isYoutubeUrl mirrors the schema", () => {
    expect(isYoutubeUrl("https://youtu.be/abc123")).toBe(true);
    expect(isYoutubeUrl("https://twitch.tv/vgc")).toBe(false);
  });
});

describe("findMotw", () => {
  const identity = (id: string) => ({ userId: id, name: id, avatarUrl: null });
  const standing = (userId: string, rank: number) => ({
    userId,
    name: userId,
    avatarUrl: null,
    wins: 0,
    losses: 0,
    points: 0,
    gamesWon: 0,
    gamesLost: 0,
    rank,
  });
  const match = (matchId: string, playerB: string | null): PublicMatch => ({
    matchId,
    round: 2,
    playerA: identity("a"),
    playerB: playerB ? identity(playerB) : null,
    reported: true,
    pending: false,
    scoreA: 2,
    scoreB: 0,
    winnerId: "a",
    isMotw: matchId === "m2",
    embargo: null,
  });
  const divisions: PublicDivision[] = [
    {
      tier: 1,
      name: "Division 1",
      mode: "sub_division",
      divisionStandings: null,
      divisionZones: null,
      divisionGroupLabels: null,
      withheldResults: 0,
      groups: [
        {
          subDivisionId: "sd1",
          name: "Division 1a",
          shortName: "1a",
          standings: [standing("c", 1), standing("a", 4)],
          zones: null,
          matches: [match("m1", "b"), match("m2", "c")],
          withheldResults: 0,
        },
      ],
    },
  ];

  it("marks whether the featured week is the running one", () => {
    const carried = findMotw(
      divisions,
      { round: 2, matchId: "m2", youtubeUrl: null },
      3,
    );
    expect(carried?.isCurrentRound).toBe(false);
  });

  it("finds the selected match with its group name and standings ranks", () => {
    const found = findMotw(
      divisions,
      { round: 2, matchId: "m2", youtubeUrl: "https://youtu.be/x" },
      2,
    );
    expect(found?.match.matchId).toBe("m2");
    expect(found?.groupName).toBe("Division 1a");
    expect(found?.youtubeUrl).toBe("https://youtu.be/x");
    expect(found?.rankA).toBe(4);
    expect(found?.rankB).toBe(1);
  });

  it("falls back to null ranks when a player is not in the table", () => {
    const found = findMotw(
      divisions,
      { round: 2, matchId: "m1", youtubeUrl: null },
      2,
    );
    expect(found?.rankA).toBe(4);
    expect(found?.rankB).toBeNull();
  });

  it("ranks from the Gesamttabelle in division mode", () => {
    const divisionMode: PublicDivision[] = [
      {
        ...divisions[0],
        mode: "division",
        divisionStandings: [standing("a", 7), standing("c", 2)],
      },
    ];
    const found = findMotw(
      divisionMode,
      { round: 2, matchId: "m2", youtubeUrl: null },
      2,
    );
    expect(found?.rankA).toBe(7);
    expect(found?.rankB).toBe(2);
  });

  it("returns null for an unknown match", () => {
    expect(
      findMotw(divisions, { round: 2, matchId: "nope", youtubeUrl: null }, 2),
    ).toBeNull();
  });

  it("returns null for a bye", () => {
    const withBye: PublicDivision[] = [
      {
        ...divisions[0],
        groups: [{ ...divisions[0].groups[0], matches: [match("m3", null)] }],
      },
    ];
    expect(
      findMotw(withBye, { round: 2, matchId: "m3", youtubeUrl: null }, 2),
    ).toBeNull();
  });
});
