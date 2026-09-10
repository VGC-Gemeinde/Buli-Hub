import type { Platform } from "@/features/reporting/report";
import {
  divisionName,
  subDivisionName,
  subDivisionShortName,
} from "@/features/seeding/seeding";
import { streamPhotoUrl } from "@/features/stream-photos/photo";
import { playerName } from "@/lib/player-name";

// The stream API payload for one match (docs/plans/stream-api.md): what
// gemeinde-streams needs to show a played match in its Team-Detail overlay.
// Pure mapping from the joined rows; the queries feed it, the tests pin it.

export type Side = "a" | "b";

export type StreamPlayer = { id: string; name: string };

/**
 * A player's record in the running season: match wins and losses out of
 * `computeStandings`, the same tally the standings table and the MotW picker
 * show. Only the match detail carries it, see `toStreamMatch` below.
 */
export type StreamRecord = { wins: number; losses: number };

export type StreamRecords = { a: StreamRecord; b: StreamRecord };

/** A player without a standings row yet, and what the list entry passes. */
export const NO_RECORD: StreamRecord = { wins: 0, losses: 0 };

export type StreamMatch = {
  id: string;
  round: number;
  division: { tier: number; name: string };
  group: { name: string; shortName: string };
  playerA: StreamPlayer;
  playerB: StreamPlayer;
  /** Winner of each game in game order. */
  games: Side[];
  platform: Platform;
  motw: boolean;
  /** Held for a staff recording: the result is not public yet. */
  recording: boolean;
  reportedAt: string;
};

export type StreamMatchDetail = Omit<StreamMatch, "playerA" | "playerB"> & {
  playerA: StreamPlayer & StreamPlayerImages & { record: StreamRecord };
  playerB: StreamPlayer & StreamPlayerImages & { record: StreamRecord };
  /** Open team sheets as Showdown text, one per side. */
  sheets: { a: string; b: string };
};

/**
 * What the stream shows next to a player. `photoUrl` is the picture the
 * player uploaded for exactly this purpose (docs/plans/stream-photos.md);
 * null means they have none and the overlay draws its placeholder.
 *
 * `avatarUrl` is the Discord avatar the hub shows on its own pages. It is
 * **never** delivered here any more and is always null: the two are separate
 * pictures for separate places. The key stays until gemeinde-streams reads
 * `photoUrl`, because its schema still requires it.
 */
export type StreamPlayerImages = {
  photoUrl: string | null;
  /** @deprecated always null, read `photoUrl` instead */
  avatarUrl: null;
};

export type ProfileRow = {
  displayName: string | null;
  username: string | null;
  streamPhotoPath: string | null;
};

export type MatchInput = {
  id: string;
  round: number;
  tier: number;
  position: number;
  playerAId: string;
  playerBId: string;
  playerA: ProfileRow | null;
  playerB: ProfileRow | null;
  platform: Platform | null;
  reportedAt: Date;
  motw: boolean;
  recording: boolean;
  games: { gameNumber: number; winnerId: string }[];
  sheets: { playerId: string; ots: string }[];
};

/**
 * The match as the stream shows it, or null when there is nothing to show: a
 * result without a platform or games (not a played best-of-3), a game whose
 * winner is neither participant, or a missing team sheet.
 */
export function toStreamMatchDetail(
  input: MatchInput,
  records: StreamRecords = { a: NO_RECORD, b: NO_RECORD },
): StreamMatchDetail | null {
  if (input.platform === null || input.games.length === 0) {
    return null;
  }
  const games: Side[] = [];
  for (const game of [...input.games].sort(
    (x, y) => x.gameNumber - y.gameNumber,
  )) {
    if (game.winnerId === input.playerAId) {
      games.push("a");
    } else if (game.winnerId === input.playerBId) {
      games.push("b");
    } else {
      return null;
    }
  }
  const sheetA = input.sheets.find((s) => s.playerId === input.playerAId);
  const sheetB = input.sheets.find((s) => s.playerId === input.playerBId);
  if (!sheetA || !sheetB) {
    return null;
  }
  return {
    id: input.id,
    round: input.round,
    division: { tier: input.tier, name: divisionName(input.tier) },
    group: {
      name: subDivisionName(input.tier, input.position),
      shortName: subDivisionShortName(input.tier, input.position),
    },
    playerA: {
      id: input.playerAId,
      name: playerName(input.playerA?.displayName, input.playerA?.username),
      photoUrl: streamPhotoUrl(input.playerA?.streamPhotoPath ?? null),
      avatarUrl: null,
      record: records.a,
    },
    playerB: {
      id: input.playerBId,
      name: playerName(input.playerB?.displayName, input.playerB?.username),
      photoUrl: streamPhotoUrl(input.playerB?.streamPhotoPath ?? null),
      avatarUrl: null,
      record: records.b,
    },
    games,
    platform: input.platform,
    motw: input.motw,
    recording: input.recording,
    reportedAt: input.reportedAt.toISOString(),
    sheets: { a: sheetA.ots, b: sheetB.ots },
  };
}

/**
 * The list entry: the detail without images, records and sheets. The list is
 * the match picker, which needs none of them, and computing the standings for
 * every match of the season would cost a table per call.
 */
export function toStreamMatch(input: MatchInput): StreamMatch | null {
  const detail = toStreamMatchDetail(input);
  if (!detail) {
    return null;
  }
  const { sheets: _sheets, playerA, playerB, ...rest } = detail;
  return {
    ...rest,
    playerA: { id: playerA.id, name: playerA.name },
    playerB: { id: playerB.id, name: playerB.name },
  };
}
