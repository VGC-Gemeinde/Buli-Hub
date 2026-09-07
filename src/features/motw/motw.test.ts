import { describe, expect, it } from "vitest";
import type { PublicDivision, PublicMatch } from "../public-league/queries";
import {
  buildMotwWeeks,
  canSelectRound,
  defaultDivisionFilter,
  findMotw,
  initialMotwRound,
  isYoutubeUrl,
  type MotwCandidate,
  type MotwPlayer,
  motwEmbargo,
  motwTodo,
  recordability,
  selectableRounds,
  sortCandidates,
  toggleAllDivisions,
  weekState,
  withholdScore,
  youtubeUrlSchema,
} from "./motw";

describe("motwTodo", () => {
  const base = { currentRound: 3, totalRounds: 7 };

  it("is urgent when the current round has no pick", () => {
    expect(motwTodo({ ...base, selectedRounds: new Set() })).toEqual({
      round: 3,
      urgency: "urgent",
    });
  });

  it("surfaces only the urgent item while the current round is unpicked", () => {
    // Even a picked next week does not soften the current round's gap …
    expect(motwTodo({ ...base, selectedRounds: new Set([4]) })).toEqual({
      round: 3,
      urgency: "urgent",
    });
    // … and with both unpicked, the warning is replaced, not shown alongside.
    expect(motwTodo({ ...base, selectedRounds: new Set() })).toEqual({
      round: 3,
      urgency: "urgent",
    });
  });

  it("warns when only the next round has no pick", () => {
    expect(motwTodo({ ...base, selectedRounds: new Set([3]) })).toEqual({
      round: 4,
      urgency: "warning",
    });
  });

  it("is silent when current and next are picked", () => {
    expect(motwTodo({ ...base, selectedRounds: new Set([3, 4]) })).toBeNull();
  });

  it("does not warn past the last round", () => {
    expect(
      motwTodo({
        currentRound: 7,
        totalRounds: 7,
        selectedRounds: new Set([7]),
      }),
    ).toBeNull();
  });

  it("is silent outside a running round", () => {
    expect(
      motwTodo({
        currentRound: null,
        totalRounds: 7,
        selectedRounds: new Set(),
      }),
    ).toBeNull();
  });
});

describe("canSelectRound / selectableRounds", () => {
  const base = { currentRound: 3, totalRounds: 7 };
  const can = (round: number, picked: number[] = []) =>
    canSelectRound({ ...base, round, pickedRounds: new Set(picked) });

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
  const base = { totalRounds: 7, currentRound: 3 };

  it("opens on the running round while it has no pick", () => {
    expect(initialMotwRound({ ...base, selectedRounds: new Set([1, 2]) })).toBe(
      3,
    );
  });

  it("opens on the first later round without a pick", () => {
    expect(initialMotwRound({ ...base, selectedRounds: new Set([3, 4]) })).toBe(
      5,
    );
  });

  it("falls back to the running round once everything is picked", () => {
    expect(
      initialMotwRound({
        ...base,
        selectedRounds: new Set([3, 4, 5, 6, 7]),
      }),
    ).toBe(3);
  });

  it("opens on the last round outside a running season", () => {
    expect(
      initialMotwRound({
        totalRounds: 7,
        currentRound: null,
        selectedRounds: new Set(),
      }),
    ).toBe(7);
  });

  it("never returns a round below 1", () => {
    expect(
      initialMotwRound({
        totalRounds: 0,
        currentRound: null,
        selectedRounds: new Set(),
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

describe("sortCandidates / buildMotwWeeks", () => {
  const player = (
    name: string,
    rank: number | null,
    hasCaptureCard = true,
    profileEdited = true,
  ): MotwPlayer => ({
    userId: name,
    name,
    avatarUrl: null,
    rank,
    wins: 0,
    losses: 0,
    hasCaptureCard,
    profileEdited,
    dropped: false,
  });
  const candidate = (
    matchId: string,
    round: number,
    rankA: number | null,
    rankB: number | null,
    captureCards = true,
  ): MotwCandidate => ({
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
      candidate("m1", 1, 8, 9),
      candidate("m2", 1, 1, 2),
      candidate("m3", 1, 4, 5),
    ];
    expect(sortCandidates(list, "division").map((c) => c.matchId)).toEqual([
      "m1",
      "m2",
      "m3",
    ]);
  });

  it("puts the best combined placement first in rank mode", () => {
    const list = [
      candidate("m1", 1, 8, 9),
      candidate("m2", 1, 1, 2),
      candidate("m3", 1, 4, 5),
    ];
    expect(sortCandidates(list, "rank").map((c) => c.matchId)).toEqual([
      "m2",
      "m3",
      "m1",
    ]);
  });

  it("sorts unranked pairings last and keeps equal sums stable", () => {
    const list = [
      candidate("m1", 1, null, 1),
      candidate("m2", 1, 3, 4),
      candidate("m3", 1, 2, 5),
      candidate("m4", 1, null, null),
    ];
    expect(sortCandidates(list, "rank").map((c) => c.matchId)).toEqual([
      "m2",
      "m3",
      "m1",
      "m4",
    ]);
  });

  it("answers recordability as yes / no / unknown", () => {
    expect(recordability(candidate("m1", 1, 1, 2, true))).toBe("yes");

    // One side is enough.
    const halfway = candidate("m2", 1, 1, 2, false);
    halfway.playerA.hasCaptureCard = true;
    expect(recordability(halfway)).toBe("yes");

    // Both answered the question, and both said no.
    expect(recordability(candidate("m3", 1, 1, 2, false))).toBe("no");

    // A player who never saved a profile has `hasCaptureCard: false` by
    // default — that is not an answer, so the pairing is unknown, not a no.
    const untouched = candidate("m4", 1, 1, 2, false);
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
      candidates: [],
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
      candidates: [],
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
      candidates: [],
    });
    // Only the settled past week closes; the running one stays replaceable.
    expect(picked.map((w) => w.editable)).toEqual([false, true, true]);
  });

  it("groups candidates by round and resolves the pick", () => {
    const weeks = buildMotwWeeks({
      matchdays,
      currentRound: 2,
      selections: [{ round: 2, matchId: "m2", youtubeUrl: "https://y" }],
      candidates: [
        candidate("m1", 1, 1, 2),
        candidate("m2", 2, 3, 4),
        candidate("m3", 2, 5, 6),
      ],
    });
    expect(weeks[0].candidates.map((c) => c.matchId)).toEqual(["m1"]);
    expect(weeks[1].candidates.map((c) => c.matchId)).toEqual(["m2", "m3"]);
    expect(weeks[1].selectedMatch?.matchId).toBe("m2");
    expect(weeks[1].selection?.youtubeUrl).toBe("https://y");
    expect(weeks[2].candidates).toEqual([]);
    expect(weeks[2].selection).toBeNull();
  });

  it("keeps the selection but resolves no match when the pick left the round", () => {
    const weeks = buildMotwWeeks({
      matchdays,
      currentRound: 2,
      // The featured match dropped out of the candidate set (a participant
      // dropped afterwards) — the week still knows it has a pick.
      selections: [{ round: 2, matchId: "gone", youtubeUrl: null }],
      candidates: [candidate("m2", 2, 3, 4)],
    });
    expect(weeks[1].selection?.matchId).toBe("gone");
    expect(weeks[1].selectedMatch).toBeNull();
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
    motwEmbargo: null,
  });
  const divisions: PublicDivision[] = [
    {
      tier: 1,
      name: "Division 1",
      mode: "sub_division",
      divisionStandings: null,
      divisionZones: null,
      divisionGroupLabels: null,
      groups: [
        {
          subDivisionId: "sd1",
          name: "Division 1a",
          shortName: "1a",
          standings: [standing("c", 1), standing("a", 4)],
          zones: null,
          matches: [match("m1", "b"), match("m2", "c")],
        },
      ],
    },
  ];

  it("finds the selected match with its group name and standings ranks", () => {
    const found = findMotw(divisions, {
      matchId: "m2",
      youtubeUrl: "https://youtu.be/x",
    });
    expect(found?.match.matchId).toBe("m2");
    expect(found?.groupName).toBe("Division 1a");
    expect(found?.youtubeUrl).toBe("https://youtu.be/x");
    expect(found?.rankA).toBe(4);
    expect(found?.rankB).toBe(1);
  });

  it("falls back to null ranks when a player is not in the table", () => {
    const found = findMotw(divisions, { matchId: "m1", youtubeUrl: null });
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
    const found = findMotw(divisionMode, { matchId: "m2", youtubeUrl: null });
    expect(found?.rankA).toBe(7);
    expect(found?.rankB).toBe(2);
  });

  it("returns null for an unknown match", () => {
    expect(
      findMotw(divisions, { matchId: "nope", youtubeUrl: null }),
    ).toBeNull();
  });

  it("returns null for a bye", () => {
    const withBye: PublicDivision[] = [
      {
        ...divisions[0],
        groups: [{ ...divisions[0].groups[0], matches: [match("m3", null)] }],
      },
    ];
    expect(findMotw(withBye, { matchId: "m3", youtubeUrl: null })).toBeNull();
  });
});

describe("motwEmbargo", () => {
  const noVod = { youtubeUrl: null };
  const withVod = { youtubeUrl: "https://youtu.be/x" };
  const guest = { isStaff: false, isParticipant: false };

  it("does not apply to a match that is not the Match of the Week", () => {
    expect(motwEmbargo({ selection: null, ...guest })).toBeNull();
    expect(
      motwEmbargo({ selection: null, isStaff: true, isParticipant: true }),
    ).toBeNull();
  });

  it("ends for everyone once the VOD is attached", () => {
    expect(motwEmbargo({ selection: withVod, ...guest })).toBeNull();
    expect(
      motwEmbargo({ selection: withVod, isStaff: true, isParticipant: false }),
    ).toBeNull();
  });

  it("withholds the result from guests and foreign players", () => {
    expect(motwEmbargo({ selection: noVod, ...guest })).toBe("withheld");
  });

  it("previews the result for staff and for either participant", () => {
    expect(
      motwEmbargo({ selection: noVod, isStaff: true, isParticipant: false }),
    ).toBe("preview");
    expect(
      motwEmbargo({ selection: noVod, isStaff: false, isParticipant: true }),
    ).toBe("preview");
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
    // Pure: the input is untouched.
    expect(row.scoreA).toBe(2);
  });
});
