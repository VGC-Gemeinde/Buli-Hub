import { randomUUID } from "node:crypto";
import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import {
  disputes,
  divisions,
  matches,
  matchGames,
  matchResults,
  motwSelections,
  placements,
  profiles,
  registrations,
  subDivisions,
  teamSheets,
} from "@/db/schema";
import { TOP_RESULT_TIERS } from "@/features/discord-posts/channels";
import { syncResultPost } from "@/features/discord-posts/sync";
import type {
  Platform,
  PlayerStatus,
} from "@/features/registration/registration";
import {
  markSchedulePublished,
  persistSchedule,
  subDivisionRosters,
} from "@/features/schedule/queries";
import { generateRoundRobin } from "@/features/schedule/round-robin";
import {
  defaultDeadlines,
  spieltagCount,
  windowsFromDeadlines,
} from "@/features/schedule/spieltage";
import { currentMatchday } from "@/features/season/dashboard";
import { matchdaysForWindow } from "@/features/season/queries";
import {
  divisionModeAvailable,
  validatePostSeason,
} from "@/features/seeding/post-season";
import {
  assignPlayersToDivision,
  divisionsWithGroupSizes,
  finalizeSeeding,
  generateSubDivisionsForDivision,
  listDivisions,
  listSeedingPlayers,
  savePostSeasonConfig,
  saveReplayRequirement,
  saveSeedingConfig,
} from "@/features/seeding/queries";
import { latestWindow } from "@/features/staff/queries";
import { db } from "@/lib/db";
import { SEED_SHEET_A, SEED_SHEET_B } from "./teamsheets";

// Dev-only test-data generator: a closed registration window filled with fake
// registered players so staff can exercise the seeding tool at realistic
// volume. Fake users are tagged by email so they can be cleared without
// touching the dev personas.
const SEED_EMAIL_PREFIX = "seed-";
const SEED_EMAIL_DOMAIN = "@example.test";

// Inserts fake users as *complete* GoTrue accounts, not bare (id, email) rows.
// The impersonation tool (/dev/login-as) signs a browser in by asking GoTrue
// for a magic link, and GoTrue 500s on a user that is missing the operational
// columns (`aud`, `role`, `instance_id`, a confirmed email) or has no matching
// `auth.identities` row — the same shape `admin.createUser` produces for the
// personas. Without this, seeded players are listed in the picker but cannot be
// impersonated. `auth.identities` cascades on user delete, so clearSeedData
// needs no extra cleanup.
const GOTRUE_INSTANCE = "00000000-0000-0000-0000-000000000000";

async function insertSeedAuthUsers(
  users: { id: string; email: string }[],
): Promise<void> {
  const appMeta = JSON.stringify({ provider: "email", providers: ["email"] });
  const userMeta = JSON.stringify({ email_verified: true });
  const userRows = users.map(
    ({ id, email }) =>
      // The token columns must be '' and not NULL: GoTrue scans them into
      // non-nullable Go strings on every read, and a NULL makes it 500 (its
      // error body is empty — the "{}" the impersonation route used to show).
      // `admin.createUser` sets them to '', which is what a persona login does;
      // a direct insert defaults them to NULL, so they are set explicitly here.
      sql`(${id}, ${email}, 'authenticated', 'authenticated', ${GOTRUE_INSTANCE},
        now(), now(), now(),
        ${appMeta}::jsonb, ${userMeta}::jsonb,
        false, false,
        '', '', '', '')`,
  );
  await db.execute(
    sql`insert into auth.users
      (id, email, aud, role, instance_id,
       email_confirmed_at, created_at, updated_at,
       raw_app_meta_data, raw_user_meta_data,
       is_sso_user, is_anonymous,
       confirmation_token, recovery_token, email_change_token_new, email_change)
     values ${sql.join(userRows, sql`, `)}`,
  );

  // One email-provider identity per user — provider_id and the `sub` claim are
  // the user id, mirroring a real email signup.
  const identityRows = users.map(
    ({ id, email }) =>
      // Cast the jsonb_build_object arguments — inside it the params are
      // otherwise untyped and Postgres cannot infer them ($n type error).
      // `auth.identities.email` is a generated column (derived from
      // identity_data->>'email'), so it is deliberately not in the column list.
      sql`(${id}, ${id}, jsonb_build_object('sub', ${id}::text, 'email', ${email}::text, 'email_verified', true),
        'email', now(), now(), now())`,
  );
  await db.execute(
    sql`insert into auth.identities
      (provider_id, user_id, identity_data, provider,
       last_sign_in_at, created_at, updated_at)
     values ${sql.join(identityRows, sql`, `)}`,
  );
}

const NAME_POOL = [
  "Kuro",
  "Falinks",
  "Pawmi",
  "Wooloo",
  "Mika",
  "Nico",
  "Luca",
  "Finn",
  "Jonas",
  "Lena",
  "Sophie",
  "Tim",
  "Maxi",
  "Ben",
  "Paul",
  "Emma",
  "Mia",
  "Noah",
  "Leon",
  "Elias",
  "Hannah",
  "Jara",
  "Sven",
  "Timo",
  "Kira",
  "Ravi",
  "Dennis",
  "Anna",
  "Lars",
  "Marek",
];

// Only new players are ever asked for their achievements (the veteran branch of
// the registration form does not have the field), and it is optional there — so
// a realistic sheet has a filled Erfolge column for most, but not all, new
// players. The mix is deliberate: short entries, long ones that must truncate,
// and a few that are honest about having none.
const ACHIEVEMENT_POOL = [
  "Top 16 Regional Dortmund",
  "Platz 3 bei der Herbst-Bo3",
  "Regional Top 8 Stuttgart",
  "Meister Saison 8",
  "Day 2 auf der EUIC 2025",
  "2x Top Cut bei lokalen Cups",
  "Nichts Großes, spiele hauptsächlich Ladder",
  "Platz 1 im Community-Turnier der VGC Gemeinde",
  "Top 32 bei den German Nationals, dazu mehrere Top Cuts auf kleineren Regionals und ein zweiter Platz bei einem Online-Cup mit 128 Teilnehmern",
  "Beste Ladder-Platzierung 1850 auf Showdown",
  "Halbfinale im Bundesliga-Pokal Saison 7",
  "Top 4 Midseason Showdown",
  "Zwei Jahre in Folge Top 64 auf der Worlds-Ladder",
  "Erster Platz bei einem lokalen Turnier in Köln, seitdem regelmäßig im Top Cut der Regionals",
] as const;

export type SeedRegistration = {
  displayName: string;
  username: string;
  platform: Platform;
  status: PlayerStatus;
  skillSelfRating: number | null;
  greatestAchievements: string | null;
  participatedBefore: boolean | null;
  prevSeason: string | null;
  prevName: string | null;
  prevDivision: number | null;
  prevPlacement: number | null;
};

// Pure: builds `count` registration specs. `rng` is injectable so the mix is
// testable; defaults to Math.random.
export function buildSeedRegistrations(
  count: number,
  rng: () => number = Math.random,
): SeedRegistration[] {
  const pick = <T>(arr: readonly T[]) => arr[Math.floor(rng() * arr.length)];
  const specs: SeedRegistration[] = [];
  for (let i = 0; i < count; i++) {
    const base = pick(NAME_POOL);
    const displayName = `${base}${Math.floor(rng() * 900) + 100}`;
    const username = `${base.toLowerCase()}_${i}`;
    const platform: Platform = rng() < 0.6 ? "showdown" : "cartridge";
    const returning = rng() < 0.3;
    if (returning) {
      specs.push({
        displayName,
        username,
        platform,
        status: "returning",
        skillSelfRating: null,
        greatestAchievements: null,
        participatedBefore: true,
        prevSeason: `Saison ${Math.floor(rng() * 4) + 1}`,
        prevName: displayName,
        prevDivision: Math.floor(rng() * 5) + 1,
        prevPlacement: Math.floor(rng() * 8) + 1,
      });
    } else {
      specs.push({
        displayName,
        username,
        platform,
        status: "new",
        skillSelfRating: Math.floor(rng() * 11),
        greatestAchievements: rng() < 0.75 ? pick(ACHIEVEMENT_POOL) : null,
        participatedBefore: false,
        prevSeason: null,
        prevName: null,
        prevDivision: null,
        prevPlacement: null,
      });
    }
  }
  return specs;
}

// Removes all seeding/registration test data and the generated fake users
// (windows first so the opened_by FK does not block deleting the users).
export async function clearSeedData() {
  await db.execute(sql`delete from registration_windows`);
  await db.execute(
    sql`delete from auth.users where email like ${`${SEED_EMAIL_PREFIX}%${SEED_EMAIL_DOMAIN}`}`,
  );
}

// The shape a seeded league is built to. `groupsPerDivision` (in tier order)
// switches the player distribution from round-robin to exact slices, which is
// the only way to give divisions different group counts; `divisionTableTier`
// marks the one division decided by its Gesamttabelle.
export type DevSeedingShape = {
  divisionCount: number;
  size: number;
  groupsPerDivision?: readonly number[];
  divisionTableTier?: number;
};

// The default shape of a seeded running season: seven divisions of two groups,
// except Division 4 with five — and Division 4 alone is decided by its
// Gesamttabelle, everything else by group tables.
//
// Both oddities are deliberate. A uniform two-division season never exercised
// the division-mode ranking path or an irregular group count, so bugs in either
// only showed up against production data. This shape keeps a league-sized
// division list (the MotW picker's filter, the Liga-Übersicht switcher) and both
// table modes present in every local season.
export const DEV_DIVISION_GROUPS = [2, 2, 2, 5, 2, 2, 2] as const;
export const DEV_GROUP_SIZE = 8;
export const DEV_DIVISION_TABLE_TIER = 4;

export function devShapePlayerCount(
  groupsPerDivision: readonly number[],
  size: number,
): number {
  return groupsPerDivision.reduce((sum, groups) => sum + groups, 0) * size;
}

export const DEV_SEASON_SHAPE: DevSeedingShape = {
  divisionCount: DEV_DIVISION_GROUPS.length,
  size: DEV_GROUP_SIZE,
  groupsPerDivision: DEV_DIVISION_GROUPS,
  divisionTableTier: DEV_DIVISION_TABLE_TIER,
};

// Builds the seeding up to the grouping step: creates the divisions,
// distributes players across them and generates sub-divisions. Post-season
// rules and finalize are deliberately left out — this is the state right before
// the "Auf- & Abstieg" step.
async function groupDevSeeding(
  windowId: string,
  shape: DevSeedingShape,
): Promise<void> {
  await saveSeedingConfig(windowId, shape.size, shape.divisionCount);
  const players = await listSeedingPlayers(windowId);
  const divisions = (await listDivisions(windowId)).sort(
    (a, b) => a.tier - b.tier,
  );
  if (divisions.length === 0) {
    return;
  }

  const byDivision = new Map<string, string[]>();
  const { groupsPerDivision } = shape;
  if (groupsPerDivision) {
    // Exact slices: `generateSubDivisions` derives the group count from a
    // division's player count, so `groups × size` players is what makes a
    // division come out at the requested number of equal groups.
    let index = 0;
    divisions.forEach((division, i) => {
      const take = (groupsPerDivision[i] ?? 1) * shape.size;
      byDivision.set(
        division.id,
        players.slice(index, index + take).map((player) => player.userId),
      );
      index += take;
    });
    // A miscounted registration total would otherwise silently drop players;
    // park the remainder in the last division instead.
    if (index < players.length) {
      const last = divisions[divisions.length - 1];
      byDivision
        .get(last.id)
        ?.push(...players.slice(index).map((player) => player.userId));
    }
  } else {
    players.forEach((player, i) => {
      const division = divisions[i % divisions.length];
      const list = byDivision.get(division.id);
      if (list) {
        list.push(player.userId);
      } else {
        byDivision.set(division.id, [player.userId]);
      }
    });
  }

  for (const [divisionId, userIds] of byDivision) {
    await assignPlayersToDivision(windowId, userIds, divisionId);
  }
  for (const division of divisions) {
    await generateSubDivisionsForDivision(windowId, division.id);
  }
}

// Builds a complete, finalized seeding from the window's registered players:
// grouping plus valid post-season rules and the replay decision, then
// finalize. Lets the "Spielplan erstellen" flow be exercised without
// hand-running the seeding tool.
async function finalizeDevSeeding(
  windowId: string,
  shape: DevSeedingShape,
): Promise<void> {
  await groupDevSeeding(windowId, shape);
  await applyDevPostSeason(windowId, shape.divisionTableTier);
  // Mirrors the league's real rule: proof mandatory in divisions 1 + 2.
  await saveReplayRequirement(windowId, 2);
  await finalizeSeeding(windowId);
}

// A valid, balanced post-season config so seeded seasons behave like real
// finalized ones (finalize requires it). Baseline: playoff-only paths (all
// guaranteed 0 → balances trivially, works for any structure). When there are
// exactly two divisions with equal-size groups, use a richer demo: the top
// division demotes one per group and the bottom promotes the same total via its
// global division table — so the Gesamttabelle + guaranteed zones are exercised.
async function applyDevPostSeason(
  windowId: string,
  divisionTableTier?: number,
): Promise<void> {
  const divs = (await divisionsWithGroupSizes(windowId)).sort(
    (a, b) => a.tier - b.tier,
  );
  if (divs.length === 0) {
    return;
  }

  const configs = divs.map((division, i) => ({
    divisionId: division.id,
    relevantTable: "sub_division" as "sub_division" | "division",
    guaranteedPromotions: 0,
    guaranteedDemotions: 0,
    promotionPlayoffSlots: i === 0 ? 0 : 1,
    demotionPlayoffSlots: i === divs.length - 1 ? 0 : 1,
    // Top division always gets a title playoff so the champion zone is seeded.
    championshipPlayoffSlots: i === 0 ? 2 : 0,
  }));

  const richDemo =
    divs.length === 2 && divs.every((d) => divisionModeAvailable(d.groupSizes));
  if (richDemo) {
    const demoteTotal = divs[0].groupSizes.length; // 1 per group of the top division
    configs[0] = {
      divisionId: divs[0].id,
      relevantTable: "sub_division",
      guaranteedPromotions: 0,
      guaranteedDemotions: 1,
      promotionPlayoffSlots: 0,
      demotionPlayoffSlots: 0,
      championshipPlayoffSlots: 2,
    };
    configs[1] = {
      divisionId: divs[1].id,
      relevantTable: "division",
      guaranteedPromotions: demoteTotal,
      guaranteedDemotions: 0,
      promotionPlayoffSlots: 0,
      demotionPlayoffSlots: 0,
      championshipPlayoffSlots: 0,
    };
  }

  // One division decided by its Gesamttabelle rather than the group tables, so
  // every consumer of "the table that decides a division" meets both modes.
  if (divisionTableTier != null) {
    const index = divs.findIndex((d) => d.tier === divisionTableTier);
    if (index >= 0 && divisionModeAvailable(divs[index].groupSizes)) {
      configs[index].relevantTable = "division";
    }
  }

  const valid =
    validatePostSeason(
      divs.map((d, i) => ({
        tier: d.tier,
        groupSizes: d.groupSizes,
        relevantTable: configs[i].relevantTable,
        guaranteedPromotions: configs[i].guaranteedPromotions,
        guaranteedDemotions: configs[i].guaranteedDemotions,
        promotionPlayoffSlots: configs[i].promotionPlayoffSlots,
        demotionPlayoffSlots: configs[i].demotionPlayoffSlots,
        championshipPlayoffSlots: configs[i].championshipPlayoffSlots,
      })),
    ).length === 0;
  await savePostSeasonConfig(windowId, configs, valid);
}

// Generates the season's schedule from a finalized seeding. Published (the
// default), it starts two weeks in the past so the Spieler-Dashboard shows a
// mid-season state; unpublished it starts today, matching the real
// schedule_hidden flow right after "Spielplan erstellen".
async function generateDevSchedule(
  windowId: string,
  publish = true,
): Promise<void> {
  const rosters = await subDivisionRosters(windowId);
  const count = spieltagCount(rosters.map((roster) => roster.userIds.length));
  if (count === 0) {
    return;
  }
  const seasonStart = (
    publish ? new Date(Date.now() - 14 * 86_400_000) : new Date()
  )
    .toISOString()
    .slice(0, 10);
  const deadlines = defaultDeadlines(seasonStart, count);
  const windows = windowsFromDeadlines(seasonStart, deadlines);
  const matchRows = rosters.flatMap((roster) =>
    generateRoundRobin(roster.userIds).flatMap((pairings, roundIndex) =>
      pairings.map((pairing) => ({
        subDivisionId: roster.subDivisionId,
        round: roundIndex + 1,
        playerAId: pairing.a,
        playerBId: pairing.b,
      })),
    ),
  );
  await persistSchedule(windowId, windows, matchRows);
  if (publish) {
    await markSchedulePublished(windowId);
  }
}

// Writes a normal best-of-3 result the way a player report stores it (result
// row + game rows with replay links).
async function insertNormalResult(
  matchId: string,
  a: string,
  b: string,
  winner: string,
  sweep: boolean,
): Promise<void> {
  const loser = winner === a ? b : a;
  const games = sweep ? [winner, winner] : [winner, loser, winner];
  await db.insert(matchResults).values({
    matchId,
    outcome: "normal",
    winnerId: winner,
    platform: "showdown",
    reportedById: a,
  });
  await db.insert(teamSheets).values([
    { matchId, playerId: a, source: "import", ots: SEED_SHEET_A },
    { matchId, playerId: b, source: "pokepaste", ots: SEED_SHEET_B },
  ]);
  await db.insert(matchGames).values(
    games.map((w, i) => ({
      matchId,
      gameNumber: i + 1,
      winnerId: w,
      replayUrl: `https://replay.pokemonshowdown.com/seed-${i + 1}`,
    })),
  );
}

// Dev-only: reports up to `count` open (unreported, non-bye) matches of the
// latest season like real player reports — including the Discord result-post
// sync, so the result channels can be exercised end to end (set the three
// channel ids, see `discord-posts/channels.ts`; without them the sync is
// silently skipped). Matches alternate between the top divisions and the
// rest so both result channels see traffic. Alternating winners, a 2-0 sweep
// every third match. Returns how many matches were reported.
export async function reportDevResults(count: number): Promise<number> {
  const window = await latestWindow();
  if (!window) {
    return 0;
  }
  const candidates = await db
    .select({
      id: matches.id,
      playerAId: matches.playerAId,
      playerBId: matches.playerBId,
      tier: divisions.tier,
    })
    .from(matches)
    .innerJoin(subDivisions, eq(subDivisions.id, matches.subDivisionId))
    .innerJoin(divisions, eq(divisions.id, subDivisions.divisionId))
    .leftJoin(matchResults, eq(matchResults.matchId, matches.id))
    .where(
      and(
        eq(divisions.windowId, window.id),
        isNotNull(matches.playerBId),
        isNull(matchResults.matchId),
      ),
    )
    .orderBy(asc(matches.round), asc(matches.id));
  const top = candidates.filter((m) => m.tier <= TOP_RESULT_TIERS);
  const rest = candidates.filter((m) => m.tier > TOP_RESULT_TIERS);
  const open: typeof candidates = [];
  while (open.length < count && (top.length > 0 || rest.length > 0)) {
    const next =
      open.length % 2 === 0
        ? (top.shift() ?? rest.shift())
        : (rest.shift() ?? top.shift());
    if (next) {
      open.push(next);
    }
  }

  let index = 0;
  for (const match of open) {
    const a = match.playerAId;
    const b = match.playerBId as string;
    await insertNormalResult(
      match.id,
      a,
      b,
      index % 2 === 0 ? a : b,
      index % 3 === 0,
    );
    // Sequential on purpose: Discord's per-channel rate limit is ~5 messages
    // per 5 seconds; the round trips pace the burst.
    await syncResultPost(match.id);
    index++;
  }
  return open.length;
}

// Fills the season with varied, lived-in results so the dashboards and
// standings have something to chew on. Past rounds are mostly reported with
// mixed winners and 2:0/2:1 scores, plus one of each edge state (overdue,
// pending free win, confirmed free win, double loss); the current round is
// half-reported (the rest "offen"); future rounds stay open.
async function seedDevResults(
  windowId: string,
  staffId: string,
): Promise<void> {
  const days = await matchdaysForWindow(windowId);
  const today = new Date().toISOString().slice(0, 10);
  const currentRound = currentMatchday(days, today)?.round ?? 1;

  const all = (
    await db
      .select({
        id: matches.id,
        round: matches.round,
        playerAId: matches.playerAId,
        playerBId: matches.playerBId,
      })
      .from(matches)
      .innerJoin(subDivisions, eq(subDivisions.id, matches.subDivisionId))
      .innerJoin(divisions, eq(divisions.id, subDivisions.divisionId))
      .where(eq(divisions.windowId, windowId))
      .orderBy(asc(matches.round), asc(matches.id))
  ).filter((match) => match.playerBId !== null);

  const reportNormal = insertNormalResult;

  // Reported normal matches (matchId + participants) to hang disputes on.
  const reportedNormal: { matchId: string; a: string; b: string }[] = [];
  // The current round's Match of the Week (first reported current-round match,
  // so block + badge + spoiler reveal all have something to show).
  let motwMatchId: string | null = null;

  let past = 0;
  let current = 0;
  for (const match of all) {
    const a = match.playerAId;
    const b = match.playerBId as string;

    if (match.round < currentRound) {
      const k = past++;
      if (k === 0) continue; // overdue (unreported past)
      if (k === 1) {
        await db.insert(matchResults).values({
          matchId: match.id,
          outcome: "free_win",
          winnerId: a,
          freeWinReason: "Gegner war trotz mehrerer Anfragen nicht erreichbar.",
          discussedWithId: staffId,
          reportedById: a,
        }); // pending confirmation
        continue;
      }
      if (k === 2) {
        await db.insert(matchResults).values({
          matchId: match.id,
          outcome: "free_win",
          winnerId: b,
          freeWinReason: "Kein gemeinsamer Termin gefunden.",
          discussedWithId: staffId,
          reportedById: b,
          confirmedById: staffId,
          confirmedAt: new Date(),
        }); // confirmed → counts
        continue;
      }
      if (k === 3) {
        await db.insert(matchResults).values({
          matchId: match.id,
          outcome: "double_loss",
          winnerId: null,
          reportedById: a,
        });
        continue;
      }
      await reportNormal(match.id, a, b, k % 2 === 0 ? a : b, k % 3 === 0);
      reportedNormal.push({ matchId: match.id, a, b });
      continue;
    }

    if (match.round === currentRound) {
      const k = current++;
      if (k % 2 === 0) {
        await reportNormal(match.id, a, b, k % 4 === 0 ? a : b, false);
        motwMatchId ??= match.id;
      }
      // odd → left "offen" this week
    }
    // future rounds stay open
  }

  // Feature it as the Match of the Week — with a VOD link, so the public
  // block shows both the YouTube button and the spoiler-protected result.
  if (motwMatchId) {
    await db.insert(motwSelections).values({
      windowId,
      round: currentRound,
      matchId: motwMatchId,
      youtubeUrl: "https://www.youtube.com/watch?v=vgc-bundesliga",
      selectedById: staffId,
    });
  }

  // Drop one player (not a MotW participant) so tables, row scores, match
  // pages and the staff Drops list all show the state.
  const motwMatch = all.find((m) => m.id === motwMatchId);
  const dropCandidate = [...all]
    .reverse()
    .find(
      (m) =>
        m.playerAId !== motwMatch?.playerAId &&
        m.playerAId !== motwMatch?.playerBId,
    );
  if (dropCandidate) {
    await db
      .update(placements)
      .set({
        droppedAt: new Date(),
        droppedById: staffId,
        dropReason: "Inaktivität, mehrfach nicht erreichbar.",
      })
      .where(
        and(
          eq(placements.windowId, windowId),
          eq(placements.userId, dropCandidate.playerAId),
        ),
      );
  }

  // One open dispute (loser contests the result) and one already resolved, so
  // both the "Angefochten" worklist and the resolved history have content.
  if (reportedNormal[0]) {
    const m = reportedNormal[0];
    await db.insert(disputes).values({
      matchId: m.matchId,
      openedById: m.b,
      reason: "Spiel 2 ging an mich, das Ergebnis stimmt nicht.",
    });
  }
  if (reportedNormal[1]) {
    const m = reportedNormal[1];
    await db.insert(disputes).values({
      matchId: m.matchId,
      openedById: m.b,
      reason: "Falscher Sieger gemeldet.",
      status: "resolved",
      resolution: "upheld",
      resolvedById: m.a,
      resolvedAt: new Date(),
      note: "Beide Replays geprüft, das gemeldete Ergebnis stimmt.",
    });
  }
}

export async function generateSeedData(
  count: number,
  opts: {
    // Everyone placed and grouped, post-season rules still unset.
    grouped?: boolean;
    finalize?: boolean;
    schedule?: boolean;
    // Schedule generated but not yet published (schedule_hidden) — the staff
    // "Pairings veröffentlichen" flow. Implies finalize; ignored when
    // `schedule` is set.
    unpublishedSchedule?: boolean;
    includeUserId?: string;
    size?: number;
    divisionCount?: number;
    // Exact league shape. When set it dictates the registration count too —
    // the slices only come out even at `sum(groups) × size` players, so `count`
    // is ignored rather than silently reshaping the divisions.
    shape?: DevSeedingShape;
  } = {},
): Promise<{ windowId: string; staffId: string }> {
  // A schedule needs a finalized seeding to build from.
  const finalize = opts.finalize || opts.schedule || opts.unpublishedSchedule;
  await clearSeedData();

  const shape: DevSeedingShape = opts.shape ?? {
    divisionCount: opts.divisionCount ?? 2,
    size: opts.size ?? 8,
  };
  const shapeCount = shape.groupsPerDivision
    ? devShapePlayerCount(shape.groupsPerDivision, shape.size) -
      (opts.includeUserId ? 1 : 0)
    : count;

  const specs = buildSeedRegistrations(shapeCount);
  const ids: string[] = specs.map(() => randomUUID());

  // Fake auth users (one multi-row insert), then their profiles.
  await insertSeedAuthUsers(
    specs.map((_, i) => ({
      id: ids[i],
      email: `${SEED_EMAIL_PREFIX}${i}${SEED_EMAIL_DOMAIN}`,
    })),
  );
  // Profile mix. `has_capture_card` can only be true because the owner saved
  // their settings, so the seed keeps that invariant: a player who never
  // touched their profile is always `false`, and that `false` means "unknown",
  // not "owns none". All three states the MotW picker distinguishes therefore
  // occur — roughly a quarter never filled anything in, and of the rest two
  // thirds own a capture card.
  const editedAt = new Date();
  await db.insert(profiles).values(
    specs.map((spec, i) => {
      const untouched = i % 4 === 3;
      // Membership mix on its own cadence, so all combinations occur: every
      // fifth player was never checked (null — the fail-open state), the rest
      // are members except the occasional confirmed leaver, so the staff
      // section shows both buckets and the roster stamp at scale.
      const membershipUnknown = i % 5 === 4;
      return {
        userId: ids[i],
        displayName: spec.displayName,
        username: spec.username,
        hasCaptureCard: !untouched && i % 3 !== 2,
        settingsEditedAt: untouched ? null : editedAt,
        guildMember: membershipUnknown ? null : i % 9 !== 3,
        guildMemberCheckedAt: membershipUnknown ? null : editedAt,
      };
    }),
  );

  // A staff member: opens the window and is the "besprochen mit" contact on
  // player-reported free wins. Not registered — staff don't play the season.
  const staffId = randomUUID();
  await insertSeedAuthUsers([
    { id: staffId, email: `${SEED_EMAIL_PREFIX}staff${SEED_EMAIL_DOMAIN}` },
  ]);
  await db.insert(profiles).values({
    userId: staffId,
    displayName: "Orga Team",
    username: "orga",
    role: "staff",
  });

  // A closed window opened by the staff member, then the registrations.
  const [window] = await db.execute<{ id: string }>(
    sql`insert into registration_windows (opened_at, closes_at, opened_by, season_number)
        values (now() - interval '40 days', now() - interval '1 day', ${staffId}, 9)
        returning id`,
  );

  await db.insert(registrations).values(
    specs.map((spec, i) => ({
      windowId: window.id,
      userId: ids[i],
      platform: spec.platform,
      status: spec.status,
      participatedBefore: spec.participatedBefore,
      prevSeason: spec.prevSeason,
      prevName: spec.prevName,
      prevDivision: spec.prevDivision,
      prevPlacement: spec.prevPlacement,
      skillSelfRating: spec.skillSelfRating,
      greatestAchievements: spec.greatestAchievements,
    })),
  );

  // Register the signed-in persona too, so a running-season seed populates
  // *their* Spieler-Dashboard. Their profile already exists (created on
  // /dev/login), so only a registration row is added — before finalizing, so
  // they get placed with everyone else.
  if (opts.includeUserId && !ids.includes(opts.includeUserId)) {
    await db
      .insert(registrations)
      .values({
        windowId: window.id,
        userId: opts.includeUserId,
        platform: "showdown",
        status: "new",
        participatedBefore: false,
        skillSelfRating: 7,
        greatestAchievements: "Top 8 bei der Bundesliga-Endrunde Saison 8",
      })
      .onConflictDoNothing();
  }

  if (finalize) {
    await finalizeDevSeeding(window.id, shape);
  } else if (opts.grouped) {
    await groupDevSeeding(window.id, shape);
  }
  if (opts.schedule) {
    await generateDevSchedule(window.id);
    await seedDevResults(window.id, staffId);
  } else if (opts.unpublishedSchedule) {
    await generateDevSchedule(window.id, false);
  }

  return { windowId: window.id, staffId };
}

// A running season whose sub-divisions are all the same size, so the division
// table shows up on the Spieler-Dashboard — it only appears when every group in
// a division is equal size. Two divisions of 24 players each split into three
// groups of 8 (…1a / 1b / 1c). The signed-in persona is registered and placed,
// landing in one of the equal groups. The fake count is chosen so the total —
// with or without the persona — is 48 and always divides evenly.
const EVEN_DIVISION_COUNT = 2;
const EVEN_SUB_DIVISION_SIZE = 8;
const EVEN_TOTAL_PLAYERS = 48;

export async function generateEvenRunningSeason(
  includeUserId?: string,
): Promise<void> {
  const fakeCount = EVEN_TOTAL_PLAYERS - (includeUserId ? 1 : 0);
  await generateSeedData(fakeCount, {
    schedule: true,
    includeUserId,
    size: EVEN_SUB_DIVISION_SIZE,
    divisionCount: EVEN_DIVISION_COUNT,
  });
}

// A three-division running season with the signed-in persona placed in the
// **middle** division — the only one that can have all four zones (direct
// promotion + playoff and direct demotion + playoff). Two variants differ only in
// how that middle division is decided: its global Gesamttabelle, or one
// Gruppentabelle per group. Every division has two equal groups of 8 (16 each,
// 48 total), so the Gesamttabelle option is available.
const LADDER_SIZE = 8;
const LADDER_TOTAL_PLAYERS = 48; // 3 divisions × 16

export async function generateLadderSeason(
  div2Mode: "division" | "sub_division",
  includeUserId?: string,
): Promise<void> {
  const fakeCount = LADDER_TOTAL_PLAYERS - (includeUserId ? 1 : 0);
  // Registrations only — we drive the placement ourselves so the persona lands
  // in the middle division.
  const { windowId, staffId } = await generateSeedData(fakeCount, {
    includeUserId,
  });

  await saveSeedingConfig(windowId, LADDER_SIZE, 3);
  const divisions = await listDivisions(windowId); // tiers 1, 2, 3
  const byTier = new Map(divisions.map((d) => [d.tier, d.id]));
  const players = (await listSeedingPlayers(windowId)).map((p) => p.userId);

  // Middle division gets the persona; fill the three divisions to 16 each.
  const rest = players.filter((id) => id !== includeUserId);
  const middle = includeUserId
    ? [includeUserId, ...rest.slice(0, 15)]
    : rest.slice(0, 16);
  const remaining = includeUserId ? rest.slice(15) : rest.slice(16);
  const top = remaining.slice(0, 16);
  const bottom = remaining.slice(16, 32);

  const topId = byTier.get(1);
  const middleId = byTier.get(2);
  const bottomId = byTier.get(3);
  if (topId && middleId && bottomId) {
    await assignPlayersToDivision(windowId, top, topId);
    await assignPlayersToDivision(windowId, middle, middleId);
    await assignPlayersToDivision(windowId, bottom, bottomId);
  }
  for (const division of divisions) {
    await generateSubDivisionsForDivision(windowId, division.id);
  }

  await applyLadderPostSeason(windowId, div2Mode);
  await saveReplayRequirement(windowId, 2);
  await finalizeSeeding(windowId);
  await generateDevSchedule(windowId);
  await seedDevResults(windowId, staffId);
}

// The ladder's balanced post-season config: top demotes into the middle, the
// middle fully exchanges both ways, the bottom promotes into the middle. Only the
// middle division's mode/counts change between the two variants.
async function applyLadderPostSeason(
  windowId: string,
  div2Mode: "division" | "sub_division",
): Promise<void> {
  const divs = (await divisionsWithGroupSizes(windowId)).sort(
    (a, b) => a.tier - b.tier,
  );
  if (divs.length !== 3) {
    return;
  }
  const [top, middle, bottom] = divs;

  const middleConfig =
    div2Mode === "division"
      ? {
          divisionId: middle.id,
          relevantTable: "division" as const,
          guaranteedPromotions: 2,
          guaranteedDemotions: 2,
          promotionPlayoffSlots: 2,
          demotionPlayoffSlots: 2,
          championshipPlayoffSlots: 0,
        }
      : {
          divisionId: middle.id,
          relevantTable: "sub_division" as const,
          guaranteedPromotions: 1,
          guaranteedDemotions: 1,
          promotionPlayoffSlots: 1,
          demotionPlayoffSlots: 1,
          championshipPlayoffSlots: 0,
        };

  const configs = [
    {
      divisionId: top.id,
      relevantTable: "sub_division" as const,
      guaranteedPromotions: 0,
      guaranteedDemotions: 1,
      promotionPlayoffSlots: 0,
      demotionPlayoffSlots: 1,
      championshipPlayoffSlots: 2, // Division 1 title playoff
    },
    middleConfig,
    {
      divisionId: bottom.id,
      relevantTable: "sub_division" as const,
      guaranteedPromotions: 1,
      guaranteedDemotions: 0,
      promotionPlayoffSlots: 1,
      demotionPlayoffSlots: 0,
      championshipPlayoffSlots: 0,
    },
  ];

  const valid =
    validatePostSeason(
      divs.map((d, i) => ({
        tier: d.tier,
        groupSizes: d.groupSizes,
        relevantTable: configs[i].relevantTable,
        guaranteedPromotions: configs[i].guaranteedPromotions,
        guaranteedDemotions: configs[i].guaranteedDemotions,
        promotionPlayoffSlots: configs[i].promotionPlayoffSlots,
        demotionPlayoffSlots: configs[i].demotionPlayoffSlots,
        championshipPlayoffSlots: configs[i].championshipPlayoffSlots,
      })),
    ).length === 0;
  await savePostSeasonConfig(windowId, configs, valid);
}
