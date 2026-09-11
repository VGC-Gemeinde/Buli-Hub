import type { Identity } from "@/features/season/dashboard";
import type { MatchOutcome } from "./report";

// Pure standings computation. Only finished results count; unreported matches,
// byes, and free wins still pending staff confirmation count for nobody.
//
// Players are ranked by match wins → game differential → head-to-head → game win
// rate. Players equal on all four share a rank, and the next rank skips
// (…, 3, 3, 5, …); resolving a genuine dead heat is left to the postseason feature.
//
// Head-to-head applies to sub-division (group) standings only and is opted out of
// by `divisionStandings` — see the notes on each. The other three keys are
// opponent-independent, so they hold when comparing players from different
// (equal-size) sub-divisions who never met. Full ruleset:
// docs/plans/standings-head-to-head.md.

export type StandingsRow = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  wins: number;
  losses: number;
  points: number;
  gamesWon: number;
  gamesLost: number;
  rank: number;
  // Mid-season drop: the player stays in the table (their matches count as
  // 2:0 free wins for the opponents) with a small marker. Set by the view
  // assembly, not by computeStandings.
  dropped?: boolean;
};

export type ResultForStandings = {
  // The match this result belongs to, so an aggregate can drop the ones the
  // public may not see (docs/plans/standings-embargo.md).
  matchId: string;
  playerAId: string;
  playerBId: string | null; // null = bye
  outcome: MatchOutcome | null; // null = unreported
  winnerId: string | null;
  confirmedAt: Date | null; // free_win is pending until this is set
  // Per-game winners of a normal best-of-3; empty for free_win/double_loss,
  // whose scores are defaulted (2:0 / 0:2) rather than played out.
  games: readonly { winnerId: string }[];
};

// gamesWon / (gamesWon + gamesLost); 0 when no games have counted yet. Used only
// for sort ordering — genuine-tie detection compares the integer tallies.
function gameWinRate(row: { gamesWon: number; gamesLost: number }): number {
  const total = row.gamesWon + row.gamesLost;
  return total === 0 ? 0 : row.gamesWon / total;
}

// A result that decided a match, as winner/loser — or null when it decided
// nothing: a bye and an unreported match are not results yet, a free win is not
// one until staff confirm it, and a double loss has no winner at all. Shared by
// the win tally and the head-to-head counts so the two can never disagree about
// which matches count.
function decidedMatch(
  result: ResultForStandings,
): { winnerId: string; loserId: string } | null {
  const { winnerId, playerAId, playerBId } = result;
  if (playerBId === null) return null;
  if (result.outcome === null) return null;
  if (result.outcome === "free_win" && result.confirmedAt === null) return null;
  if (result.outcome === "double_loss") return null;
  if (winnerId === playerAId) return { winnerId, loserId: playerBId };
  if (winnerId === playerBId) return { winnerId, loserId: playerAId };
  return null;
}

// Head-to-head wins inside each tied block. A block is the set of players level
// on both match wins and game differential — everyone the first two keys leave
// tied. Within a block a player scores one point per match won against another
// member of that same block; wins over anyone else are irrelevant, and the number
// is meaningless outside its block (blocks never compare against each other, they
// already differ on wins or differential).
//
// Ordering by this integer is transitive, so a cycle needs no special case: if A
// beat B, B beat C and C beat A, all three score 1, the level resolves nothing,
// and game win rate takes over. Blocks are deliberately not re-blocked after a
// split — head-to-head lifts a player above the rest of the block, and that is
// the whole of it.
function headToHeadWins(
  rows: readonly StandingsRow[],
  results: readonly ResultForStandings[],
): Map<string, number> {
  const blockOf = new Map<string, string>(
    rows.map((row) => [
      row.userId,
      `${row.wins}:${row.gamesWon - row.gamesLost}`,
    ]),
  );
  const wins = new Map<string, number>(rows.map((row) => [row.userId, 0]));
  for (const result of results) {
    const decided = decidedMatch(result);
    if (decided === null) continue;
    const block = blockOf.get(decided.winnerId);
    if (block === undefined || block !== blockOf.get(decided.loserId)) continue;
    wins.set(decided.winnerId, (wins.get(decided.winnerId) ?? 0) + 1);
  }
  return wins;
}

// Two players place identically iff their match wins, game tallies and
// head-to-head standing all match; equal differential + equal rate forces equal
// gamesWon/gamesLost, so comparing the integers is exact (and avoids comparing the
// derived float rate). Equal wins and game tallies imply equal differential, so
// tied players are always in the same block and their head-to-head counts are
// always comparable.
function tiedForPlacement(
  a: StandingsRow,
  b: StandingsRow,
  h2h: (row: StandingsRow) => number,
): boolean {
  return (
    a.wins === b.wins &&
    a.gamesWon === b.gamesWon &&
    a.gamesLost === b.gamesLost &&
    h2h(a) === h2h(b)
  );
}

export function computeStandings(input: {
  roster: readonly Identity[];
  results: readonly ResultForStandings[];
  // Head-to-head is opponent-dependent, so it only means anything inside a group
  // where everyone played everyone. Defaults to true — sub-division standings are
  // the normal case and `divisionStandings` is the single caller that opts out.
  headToHead?: boolean;
}): StandingsRow[] {
  type Tally = {
    wins: number;
    losses: number;
    gamesWon: number;
    gamesLost: number;
  };
  const tally = new Map<string, Tally>();
  for (const member of input.roster) {
    tally.set(member.userId, { wins: 0, losses: 0, gamesWon: 0, gamesLost: 0 });
  }
  const bump = (id: string | null, key: keyof Tally, by = 1) => {
    const record = id ? tally.get(id) : undefined;
    if (record) {
      record[key] += by;
    }
  };

  for (const result of input.results) {
    if (result.playerBId === null) continue; // bye — no match
    if (result.outcome === null) continue; // unreported
    if (result.outcome === "free_win" && result.confirmedAt === null) continue; // pending

    const { playerAId, playerBId } = result;

    if (result.outcome === "double_loss") {
      // Both forfeit: a match loss and a 0:2 default game loss each.
      bump(playerAId, "losses");
      bump(playerBId, "losses");
      bump(playerAId, "gamesLost", 2);
      bump(playerBId, "gamesLost", 2);
      continue;
    }

    const decided = decidedMatch(result);
    bump(decided?.winnerId ?? null, "wins");
    bump(decided?.loserId ?? null, "losses");

    if (result.outcome === "free_win") {
      // Walkover: awarded as a 2:0 default win, like a no-show.
      bump(decided?.winnerId ?? null, "gamesWon", 2);
      bump(decided?.loserId ?? null, "gamesLost", 2);
      continue;
    }

    // normal: count the actual per-game winners.
    for (const game of result.games) {
      const gameLoserId =
        game.winnerId === playerAId
          ? playerBId
          : game.winnerId === playerBId
            ? playerAId
            : null;
      bump(game.winnerId, "gamesWon");
      bump(gameLoserId, "gamesLost");
    }
  }

  const rows: StandingsRow[] = input.roster.map((member) => {
    const record = tally.get(member.userId) ?? {
      wins: 0,
      losses: 0,
      gamesWon: 0,
      gamesLost: 0,
    };
    return {
      userId: member.userId,
      name: member.name,
      avatarUrl: member.avatarUrl,
      wins: record.wins,
      losses: record.losses,
      points: record.wins * 3,
      gamesWon: record.gamesWon,
      gamesLost: record.gamesLost,
      rank: 0,
    };
  });
  // Blocks are keyed off the finished tallies, so this has to come after them.
  // Opted out: every count is 0, and the level drops out of both the comparator
  // and the tie check.
  const h2hByUser =
    (input.headToHead ?? true)
      ? headToHeadWins(rows, input.results)
      : new Map<string, number>();
  const h2h = (row: StandingsRow) => h2hByUser.get(row.userId) ?? 0;

  rows.sort(
    (a, b) =>
      b.wins - a.wins ||
      b.gamesWon - b.gamesLost - (a.gamesWon - a.gamesLost) ||
      h2h(b) - h2h(a) ||
      gameWinRate(b) - gameWinRate(a) ||
      a.name.localeCompare(b.name, "de"),
  );
  // Standard competition ranking: genuinely tied players share a rank, then the
  // next rank skips the gap. The alphabetical sort above only fixes display order
  // within a tie — it does not split the shared rank.
  let rank = 0;
  rows.forEach((row, i) => {
    if (i === 0 || !tiedForPlacement(rows[i - 1], row, h2h)) {
      rank = i + 1;
    }
    row.rank = rank;
  });
  return rows;
}

export type StandingsGroup = {
  roster: readonly Identity[];
  results: readonly ResultForStandings[];
};

// Standings for a whole division: every sub-division's players in one table.
//
// Head-to-head is switched off here, and that is the point: most pairs in this
// table never played each other, so the tiebreaker does not exist for them.
// Applying it to just the pairs who happen to share a group would be worse than
// either extreme — two players tied at the same rank, one of whom gets a
// head-to-head tiebreak and the other does not, in one table. What remains is
// opponent-independent, so merging the groups and re-running `computeStandings`
// produces a correct combined order — but only when every player has played the
// same number of matches, i.e. all groups are the same size. Returns null when
// that does not hold: fewer than two groups (nothing to combine — the division
// table would equal the sub-division table) or groups of differing roster size
// (unequal matches played, so raw win counts are not comparable). The caller uses
// null to mean "offer no division view".
export function divisionStandings(
  groups: readonly StandingsGroup[],
): StandingsRow[] | null {
  if (groups.length < 2) return null;
  const size = groups[0].roster.length;
  if (groups.some((group) => group.roster.length !== size)) return null;
  return computeStandings({
    roster: groups.flatMap((group) => group.roster),
    results: groups.flatMap((group) => group.results),
    headToHead: false,
  });
}
