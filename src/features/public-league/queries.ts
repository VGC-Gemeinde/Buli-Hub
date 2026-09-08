import { markDropped } from "@/features/drops/drops";
import { droppedIdsForWindow } from "@/features/drops/queries";
import { findMotw, type MotwBlockData } from "@/features/motw/motw";
import { motwForWindow } from "@/features/motw/queries";
import { holdsForWindow } from "@/features/recordings/queries";
import { scoreFor } from "@/features/reporting/match-state";
import {
  divisionGroups,
  type MatchResultLite,
  subDivisionResults,
} from "@/features/reporting/queries";
import type { MatchOutcome } from "@/features/reporting/report";
import {
  computeStandings,
  divisionStandings,
  type StandingsRow,
} from "@/features/reporting/standings";
import {
  currentMatchday,
  type Identity,
  type MatchdayLite,
} from "@/features/season/dashboard";
import {
  matchdaysForWindow,
  subDivisionMatches,
} from "@/features/season/queries";
import { assignZones, type Zone } from "@/features/seeding/post-season";
import { divisionsWithGroupSizes } from "@/features/seeding/queries";
import {
  divisionName,
  subDivisionName,
  subDivisionShortName,
} from "@/features/seeding/seeding";
import {
  type ResultEmbargo,
  resultEmbargo,
  withholdScore,
} from "@/features/spoilers/embargo";
import { seasonName } from "@/features/staff/registration-window";
import { PLAYER_NAME_FALLBACK } from "@/lib/player-name";

export type ZoneByUser = Map<string, Zone>;

// One match, from the neutral (player A) perspective.
export type PublicMatch = {
  matchId: string;
  round: number;
  playerA: Identity;
  playerB: Identity | null; // null = bye ("spielfrei")
  reported: boolean;
  pending: boolean; // free win awaiting staff confirmation
  scoreA: number | null;
  scoreB: number | null;
  winnerId: string | null;
  // Match of the Week: the row shows a badge instead of the score, permanently
  // (spoiler protection). The score fields stay filled for the reveal, except
  // while the result is withheld from this viewer (`embargo`).
  isMotw: boolean;
  // The result embargo (MotW before its VOD, or a recording hold): "withheld"
  // rows carry no score/winner at all; "preview" rows (staff, participants)
  // carry it, marked as not public (src/features/spoilers/embargo.ts).
  embargo: ResultEmbargo;
};

// Who is looking: decides whether an embargoed result may be included.
export type OverviewViewer = {
  userId: string | null;
  isStaff: boolean;
};

type MotwSelectionLite = { matchId: string; youtubeUrl: string | null };

export type PublicGroup = {
  subDivisionId: string;
  name: string; // "Division 1a"
  shortName: string; // "1a"
  standings: StandingsRow[];
  zones: ZoneByUser | null; // set only in sub_division mode
  matches: PublicMatch[]; // every round's matches; the view filters by round
};

export type PublicDivision = {
  tier: number;
  name: string; // "Division 1"
  mode: "sub_division" | "division";
  // The merged Gesamttabelle — set only in division mode, where it is the table
  // that decides promotion/relegation. In sub_division mode it is null (no toggle).
  divisionStandings: StandingsRow[] | null;
  divisionZones: ZoneByUser | null;
  divisionGroupLabels: Map<string, string> | null;
  groups: PublicGroup[];
};

export type PublicOverview = {
  seasonName: string;
  currentRound: number | null;
  totalRounds: number;
  matchdays: MatchdayLite[];
  divisions: PublicDivision[];
  // The current Spieltag's Match of the Week for the prominent block, or null
  // (none picked / between rounds). Past picks only keep their row badge.
  motw: MotwBlockData | null;
};

// Maps a division's post-season config to the counts `assignZones` expects.
function zoneCounts(config: {
  championshipPlayoffSlots: number;
  guaranteedPromotions: number;
  promotionPlayoffSlots: number;
  demotionPlayoffSlots: number;
  guaranteedDemotions: number;
}) {
  return {
    champion: config.championshipPlayoffSlots,
    promotions: config.guaranteedPromotions,
    promotionPlayoff: config.promotionPlayoffSlots,
    demotionPlayoff: config.demotionPlayoffSlots,
    demotions: config.guaranteedDemotions,
  };
}

function zoneMap(
  standings: StandingsRow[],
  counts: {
    champion: number;
    promotions: number;
    promotionPlayoff: number;
    demotionPlayoff: number;
    demotions: number;
  },
): ZoneByUser {
  const zones = assignZones({ rowCount: standings.length, ...counts });
  return new Map(standings.map((row, i) => [row.userId, zones[i]]));
}

// Everything the public overview needs for a running season: every division with
// its sub-division tables (+ the Gesamttabelle in division mode), post-season
// zones, and the current matchday's pairings/results per group.
export async function publicLeagueOverview(
  windowId: string,
  seasonNumber: number,
  today: string,
  viewer: OverviewViewer,
): Promise<PublicOverview> {
  const [configs, matchdays, motwSelections, holds, droppedIds] =
    await Promise.all([
      divisionsWithGroupSizes(windowId),
      matchdaysForWindow(windowId),
      motwForWindow(windowId),
      holdsForWindow(windowId),
      droppedIdsForWindow(windowId),
    ]);
  const currentRound = currentMatchday(matchdays, today)?.round ?? null;

  const embargoes: EmbargoSources = {
    motwByMatchId: new Map(motwSelections.map((s) => [s.matchId, s])),
    heldIds: new Set(holds.map((h) => h.matchId)),
  };
  const divisions = await Promise.all(
    [...configs]
      .sort((a, b) => a.tier - b.tier)
      .map((config) => buildDivision(config, embargoes, droppedIds, viewer)),
  );

  // The prominent block features only the running Spieltag's pick.
  const currentSelection =
    motwSelections.find((s) => s.round === currentRound) ?? null;
  const motw = currentSelection ? findMotw(divisions, currentSelection) : null;

  return {
    seasonName: seasonName(seasonNumber),
    currentRound,
    totalRounds: matchdays.length,
    matchdays,
    divisions,
    motw,
  };
}

// What decides a row's embargo: the season's MotW picks and its recording
// holds, both keyed by match id.
type EmbargoSources = {
  motwByMatchId: ReadonlyMap<string, MotwSelectionLite>;
  heldIds: ReadonlySet<string>;
};

async function buildDivision(
  config: Awaited<ReturnType<typeof divisionsWithGroupSizes>>[number],
  embargoes: EmbargoSources,
  droppedIds: ReadonlySet<string>,
  viewer: OverviewViewer,
): Promise<PublicDivision> {
  const groups = await divisionGroups(config.id);
  const counts = zoneCounts(config);
  const mode = config.relevantTable;

  // The merged Gesamttabelle is shown only when it is the relevant table — i.e.
  // in division mode, where it decides promotion/relegation and carries the zones.
  const mergedRaw = mode === "division" ? divisionStandings(groups) : null;
  const merged = mergedRaw ? markDropped(mergedRaw, droppedIds) : null;
  const divisionZones = merged ? zoneMap(merged, counts) : null;
  const divisionGroupLabels = merged
    ? new Map(
        groups.flatMap((group) =>
          group.roster.map(
            (member) =>
              [
                member.userId,
                subDivisionShortName(config.tier, group.position),
              ] as const,
          ),
        ),
      )
    : null;

  const publicGroups = await Promise.all(
    groups.map((group) =>
      buildGroup(
        config.tier,
        group,
        mode,
        counts,
        embargoes,
        droppedIds,
        viewer,
      ),
    ),
  );

  return {
    tier: config.tier,
    name: divisionName(config.tier),
    mode,
    divisionStandings: merged,
    divisionZones,
    divisionGroupLabels,
    groups: publicGroups,
  };
}

async function buildGroup(
  tier: number,
  group: Awaited<ReturnType<typeof divisionGroups>>[number],
  mode: "sub_division" | "division",
  counts: ReturnType<typeof zoneCounts>,
  embargoes: EmbargoSources,
  droppedIds: ReadonlySet<string>,
  viewer: OverviewViewer,
): Promise<PublicGroup> {
  const standings = markDropped(
    computeStandings({ roster: group.roster, results: group.results }),
    droppedIds,
  );
  // Zones sit on the relevant table only: the group table in sub_division mode.
  const zones = mode === "sub_division" ? zoneMap(standings, counts) : null;

  const identityById = new Map(group.roster.map((m) => [m.userId, m]));
  const matches = await allMatches(
    group.subDivisionId,
    identityById,
    embargoes,
    viewer,
  );

  return {
    subDivisionId: group.subDivisionId,
    name: subDivisionName(tier, group.position),
    shortName: subDivisionShortName(tier, group.position),
    standings,
    zones,
    matches,
  };
}

async function allMatches(
  subDivisionId: string,
  identityById: Map<string, Identity>,
  embargoes: EmbargoSources,
  viewer: OverviewViewer,
): Promise<PublicMatch[]> {
  const [matches, resultByMatch] = await Promise.all([
    subDivisionMatches(subDivisionId),
    subDivisionResults(subDivisionId),
  ]);
  const unknown = (id: string): Identity =>
    identityById.get(id) ?? {
      userId: id,
      name: PLAYER_NAME_FALLBACK,
      avatarUrl: null,
    };

  return matches.map((match) =>
    toPublicMatch({
      match,
      result: resultByMatch.get(match.id) ?? null,
      playerA: unknown(match.playerAId),
      playerB: match.playerBId ? unknown(match.playerBId) : null,
      motw: embargoes.motwByMatchId.get(match.id) ?? null,
      held: embargoes.heldIds.has(match.id),
      viewer,
    }),
  );
}

// One overview row from its stored pieces (pure, unit-tested): a pending free
// win stays "offen"; a result under embargo (MotW before its VOD, recording
// hold) is withheld from a viewer who is neither staff nor a participant.
export function toPublicMatch(input: {
  match: { id: string; round: number; playerAId: string };
  result: MatchResultLite | null;
  playerA: Identity;
  playerB: Identity | null;
  motw: { youtubeUrl: string | null } | null;
  held: boolean;
  viewer: OverviewViewer;
}): PublicMatch {
  const { match, result, playerA, playerB, viewer } = input;
  const pending = result?.outcome === "free_win" && result.confirmedAt === null;
  const reported = result !== null && !pending;
  let scoreA: number | null = null;
  let scoreB: number | null = null;
  if (reported && result) {
    const s = scoreFor(match.playerAId, {
      outcome: result.outcome as MatchOutcome,
      winnerId: result.winnerId,
      games: result.games,
    });
    scoreA = s.self;
    scoreB = s.opponent;
  }
  const isParticipant =
    viewer.userId !== null &&
    (viewer.userId === playerA.userId || viewer.userId === playerB?.userId);
  const embargo = resultEmbargo({
    motw: input.motw,
    held: input.held,
    isStaff: viewer.isStaff,
    isParticipant,
  });
  const row: PublicMatch = {
    matchId: match.id,
    round: match.round,
    playerA,
    playerB,
    reported,
    pending,
    scoreA,
    scoreB,
    winnerId: reported ? (result?.winnerId ?? null) : null,
    isMotw: input.motw !== null,
    embargo,
  };
  return embargo?.access === "withheld" ? withholdScore(row) : row;
}
