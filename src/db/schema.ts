// Drizzle schema — the source of truth for the data model.
//
// Workflow: edit this file → `npm run db:generate` → review the generated SQL
// in supabase/migrations/ → `npm run db:migrate`.
//
// Tables are added per feature (see CLAUDE.md); the schema stays central
// because tables cross feature boundaries.

import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// App role, derived from the user's Discord guild roles (highest wins).
export const roleEnum = pgEnum("role", ["dev", "admin", "staff", "player"]);

// User settings, one row per auth user, created lazily on first save or
// first role sync. user_id references auth.users(id); the FK + RLS policies
// and the column-level grants for the server-managed role columns live in
// custom migrations because Drizzle does not express them.
export const profiles = pgTable("profiles", {
  userId: uuid("user_id").primaryKey(),
  twitterHandle: text("twitter_handle"),
  blueskyHandle: text("bluesky_handle"),
  origin: text("origin"),
  role: roleEnum("role").notNull().default("player"),
  roleSyncedAt: timestamp("role_synced_at", { withTimezone: true }),
  // Guild membership, server-managed, written only by the member sync and
  // the staff overview's roster sweep, and only when a lookup actually ran:
  // null = never confirmed either way, true/false = last confirmed state. A
  // confirmed false gates registration and player actions; unknown always
  // fails open.
  guildMember: boolean("guild_member"),
  // When guildMember was last actually confirmed (lookup succeeded or
  // returned 404). Unlike roleSyncedAt, never bumped when the check could
  // not run.
  guildMemberCheckedAt: timestamp("guild_member_checked_at", {
    withTimezone: true,
  }),
  // Discord guild identity, server-managed (synced from the guild member,
  // JWT fallback for non-members). Nullable; null avatar → initials fallback.
  displayName: text("display_name"),
  username: text("username"),
  avatarUrl: text("avatar_url"),
  // Live capability, editable by the owner (not a per-season snapshot — see
  // docs/decisions/registration-vs-profile-data.md).
  hasCaptureCard: boolean("has_capture_card").notNull().default(false),
  // The photo the player picked for the stream overlay: the object path in
  // the `stream-photos` bucket, or null. Deliberately separate from
  // avatarUrl, which stays the Discord avatar the hub itself shows: the two
  // are different pictures for different places
  // (docs/plans/stream-photos.md). A new object per upload, so the URL
  // changes and no cache keeps serving the old picture.
  streamPhotoPath: text("stream_photo_path"),
  streamPhotoUpdatedAt: timestamp("stream_photo_updated_at", {
    withTimezone: true,
  }),
  // Set when the owner saves their settings (any change). Drives the
  // registration profile-hint; distinct from updatedAt, which the identity
  // sync also bumps.
  settingsEditedAt: timestamp("settings_edited_at", { withTimezone: true }),
  // Set when the owner dismisses the registration profile-hint.
  registrationHintDismissedAt: timestamp("registration_hint_dismissed_at", {
    withTimezone: true,
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Season registration window. A row exists only once staff has opened a
// registration; the current state (not started / open / closed) is derived
// from the latest row and the current time — there is no status column and
// no scheduled job. opened_by references auth.users (FK + RLS in a custom
// migration, since Drizzle does not manage the auth schema).
export const registrationWindows = pgTable("registration_windows", {
  id: uuid("id").primaryKey().defaultRandom(),
  openedAt: timestamp("opened_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  closesAt: timestamp("closes_at", { withTimezone: true }).notNull(),
  openedBy: uuid("opened_by").notNull(),
  // The season this window belongs to. Chosen once for the first window on the
  // system; every later window is the previous number + 1. See
  // docs/plans/season-number.md.
  seasonNumber: integer("season_number").notNull().default(1),
  // When the generated schedule was made visible to players. Null = the
  // schedule (if one exists) is staff-internal; the derived phase is then
  // schedule_hidden instead of regular_season. Set once by the manual
  // "Pairings veröffentlichen" staff action — publication is terminal, there
  // is no unpublish. See docs/plans/schedule-publish.md.
  schedulePublishedAt: timestamp("schedule_published_at", {
    withTimezone: true,
  }),
});

export const platformEnum = pgEnum("platform", ["showdown", "cartridge"]);
export const playerStatusEnum = pgEnum("player_status", ["returning", "new"]);

// One player's registration for one window. Status is resolved at submit time
// (detected-returning / self-reported veteran / new); the branch-specific
// columns are nullable and set only for the relevant status. FK + RLS live in
// a custom migration.
export const registrations = pgTable(
  "registrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    windowId: uuid("window_id").notNull(),
    userId: uuid("user_id").notNull(),
    platform: platformEnum("platform").notNull(),
    status: playerStatusEnum("status").notNull(),
    // Self-report answer; null when detection settled the status.
    participatedBefore: boolean("participated_before"),
    // Veteran-history (self-reported veterans only).
    prevSeason: text("prev_season"),
    prevName: text("prev_name"),
    prevDivision: integer("prev_division"),
    prevPlacement: integer("prev_placement"),
    // New-player set.
    skillSelfRating: integer("skill_self_rating"),
    greatestAchievements: text("greatest_achievements"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [unique().on(table.windowId, table.userId)],
);

// Division seeding for a season (anchored to its registration window). One
// seeding per window; holds the season-wide sub-division size and the finalize
// state. Divisions/sub-divisions/placements hang off it. All FKs + RLS live in
// a custom migration (server-only, like the other staff tables).
export const seedings = pgTable("seedings", {
  windowId: uuid("window_id").primaryKey(),
  subDivisionSize: integer("sub_division_size").notNull(),
  // Proof (Showdown replays / cartridge video) is mandatory for divisions
  // with tier <= this value, optional below. Null = not yet decided — an
  // explicit per-season preseason decision (no default), required to
  // finalize. See docs/plans/replay-requirement.md.
  replayRequiredTiers: integer("replay_required_tiers"),
  // Set when staff save a valid post-season config (promotion/demotion rules).
  // Required for finalize; cleared when the seeding config changes so a stale
  // confirmation cannot slip through. See docs/plans/post-season-setup.md.
  postSeasonConfiguredAt: timestamp("post_season_configured_at", {
    withTimezone: true,
  }),
  finalizedAt: timestamp("finalized_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Which standings table decides a division's post-season movement: one table per
// sub-division (counts are per group), or the global division table (counts are
// per division; only selectable when every group is the same size).
export const relevantTableEnum = pgEnum("relevant_table", [
  "sub_division",
  "division",
]);

// A division = a skill tier within a season (1 = top). Name is derived:
// "Division {tier}". The post-season columns are the promotion/demotion rules
// (see docs/plans/post-season-setup.md): guaranteed movement + playoff slots,
// interpreted per group in sub_division mode, per division in division mode.
export const divisions = pgTable(
  "divisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    windowId: uuid("window_id").notNull(),
    tier: integer("tier").notNull(),
    relevantTable: relevantTableEnum("relevant_table")
      .notNull()
      .default("sub_division"),
    guaranteedPromotions: integer("guaranteed_promotions").notNull().default(0),
    guaranteedDemotions: integer("guaranteed_demotions").notNull().default(0),
    promotionPlayoffSlots: integer("promotion_playoff_slots")
      .notNull()
      .default(0),
    demotionPlayoffSlots: integer("demotion_playoff_slots")
      .notNull()
      .default(0),
    // Title-playoff slots — only the top tier: the top N qualify for the
    // tournament that decides the Bundesliga champion. See
    // docs/plans/championship-playoff.md.
    championshipPlayoffSlots: integer("championship_playoff_slots")
      .notNull()
      .default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [unique().on(table.windowId, table.tier)],
);

// A sub-division = a round-robin group within a division. Name is derived from
// the division tier and the 0-based position → letter: "Division {tier}{a,b,…}".
export const subDivisions = pgTable(
  "sub_divisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    divisionId: uuid("division_id").notNull(),
    position: integer("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [unique().on(table.divisionId, table.position)],
);

// Where a registered player sits in the seeding: first a division (sub-division
// null), then a sub-division. One row per player per season.
// A mid-season drop is a flag here, never a data change: stored results stay
// untouched and every consumer counts the player's matches as 2:0 free wins
// for the opponents at read time (`effectiveResult`), which makes un-dropping
// a plain reset. FK for dropped_by_id in a custom migration.
export const placements = pgTable(
  "placements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    windowId: uuid("window_id").notNull(),
    userId: uuid("user_id").notNull(),
    divisionId: uuid("division_id"),
    subDivisionId: uuid("sub_division_id"),
    droppedAt: timestamp("dropped_at", { withTimezone: true }),
    droppedById: uuid("dropped_by_id"),
    dropReason: text("drop_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [unique().on(table.windowId, table.userId)],
);

// Who is currently driving a season's seeding. Division seeding is a live staff
// meeting (one person shares their screen, the group discusses); this soft lock
// keeps everyone else in read-only until they explicitly take control. A stale
// `heartbeat_at` (older than the client TTL) means the holder's tab is gone and
// the lock is free to take. Separate from `seedings` because control can be
// taken before any config row exists. Server-only (RLS on, no policies).
export const seedingLocks = pgTable("seeding_locks", {
  windowId: uuid("window_id").primaryKey(),
  holderId: uuid("holder_id").notNull(),
  acquiredAt: timestamp("acquired_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  heartbeatAt: timestamp("heartbeat_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// The season-wide Spieltag calendar generated from a finalized seeding: one row
// per matchday (round), shared across all sub-divisions. Week 1 starts on
// generation; each week's `ends_on` is its deadline (staff-editable in the
// dialog), and starts follow from the previous deadline. The presence of these
// rows marks the season as running (no status column). FKs + RLS in a custom
// migration (server-only, like the other staff tables).
export const matchdays = pgTable(
  "matchdays",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    windowId: uuid("window_id").notNull(),
    round: integer("round").notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [unique().on(table.windowId, table.round)],
);

// One match in a sub-division's single round-robin: two players on one matchday
// (`round`), or a bye when `player_b_id` is null. Its date is the matchday for
// the same window + round. Result columns arrive with the reporting feature.
// FKs + RLS in a custom migration.
export const matches = pgTable("matches", {
  id: uuid("id").primaryKey().defaultRandom(),
  subDivisionId: uuid("sub_division_id").notNull(),
  round: integer("round").notNull(),
  playerAId: uuid("player_a_id").notNull(),
  playerBId: uuid("player_b_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// The kind of result recorded for a match. Drives which columns are meaningful
// and how standings count it. "normal" = a best-of-3 was played (winner from the
// games); "free_win" = a walkover (winner set, no games, pending staff
// confirmation); "double_loss" = both players lose, no winner. Only normal and
// free_win are player-reportable; double_loss (and corrections/confirmation) are
// staff-issued — modeled now, their UI arrives with the staff dashboard.
export const matchOutcomeEnum = pgEnum("match_outcome", [
  "normal",
  "free_win",
  "double_loss",
]);

// A reported result for a match (1:1, `match_id` PK — a result is a distinct
// lifecycle object from the pairing, may not exist yet, and can later be
// corrected in place). Per-game rows live in `match_games`. FKs + RLS in a
// custom migration (server-only, no policies, like the other tables).
export const matchResults = pgTable("match_results", {
  matchId: uuid("match_id").primaryKey(),
  outcome: matchOutcomeEnum("outcome").notNull(),
  // Absolute winner. Set for normal + free_win; null for double_loss.
  winnerId: uuid("winner_id"),
  // Platform the match was played on. Set for normal; null otherwise.
  platform: platformEnum("platform"),
  // Team sheets are not columns here: they live in `team_sheets`, keyed by
  // (match_id, player_id). A normal result requires one per participant.
  // Cartridge only: one optional match video (per-game replays live on
  // match_games for Showdown).
  videoUrl: text("video_url"),
  // Free-win only: the reason and the staff/admin member discussed with.
  freeWinReason: text("free_win_reason"),
  discussedWithId: uuid("discussed_with_id"),
  // Provenance: who submitted the result.
  reportedById: uuid("reported_by_id").notNull(),
  reportedAt: timestamp("reported_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  // Free-win confirmation lifecycle. Stays null (pending) until a staff member
  // confirms — that UI ships with the staff dashboard.
  confirmedById: uuid("confirmed_by_id"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  // Correction provenance (staff feature; null now). Set when this row replaced
  // a prior result.
  correctedById: uuid("corrected_by_id"),
  correctedAt: timestamp("corrected_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// One game of a normal (best-of-3) result: 1–3 rows per match_results. Showdown
// carries a required replay link per game; Cartridge carries none (its optional
// video lives on match_results). FKs + RLS in a custom migration.
export const matchGames = pgTable(
  "match_games",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matchId: uuid("match_id").notNull(),
    // 1-based game number within the best-of-3 (1, 2, optionally 3).
    gameNumber: integer("game_number").notNull(),
    winnerId: uuid("winner_id").notNull(),
    replayUrl: text("replay_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [unique().on(table.matchId, table.gameNumber)],
);

// How a team sheet reached us. Kept for diagnosis — VRPaste is an undocumented
// internal API, so "which route was this" is the first question when a report
// fails. The submitted URL itself is deliberately not stored: it points at a
// paste that still carries the EVs this table exists to strip.
export const teamsheetSourceEnum = pgEnum("teamsheet_source", [
  "pokepaste",
  "vrpaste",
  "import",
]);

// One player's open team sheet for one match, and the public paste behind
// `/pastes/<id>`. `ots` is the canonical Showdown export rebuilt from exactly
// five fields per Pokémon (species, item, ability, nature, moves) — stats are
// not stripped from the stored text, they are never written into it.
//
// The id is the public slug, and a correction updates this row in place rather
// than minting a new one: a paste is the identity of a match slot ("Team von
// Kuro · Saison 1 · Woche 3"), so a stale URL under that title would be a lie.
// FKs + RLS in a custom migration.
export const teamSheets = pgTable(
  "team_sheets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matchId: uuid("match_id").notNull(),
    playerId: uuid("player_id").notNull(),
    source: teamsheetSourceEnum("source").notNull(),
    ots: text("ots").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [unique().on(table.matchId, table.playerId)],
);

// The Match of the Week (never translated): one featured match per Spieltag
// (window + round), picked by staff at the start of the week. Its result is
// spoiler-protected in every public view; the optional YouTube URL is attached
// once the VOD is uploaded (possibly after the Spieltag). Replacing the pick
// clears the URL — it belongs to the previous match. FKs + RLS in a custom
// migration.
export const motwSelections = pgTable(
  "motw_selections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    windowId: uuid("window_id").notNull(),
    round: integer("round").notNull(),
    matchId: uuid("match_id").notNull().unique(),
    youtubeUrl: text("youtube_url"),
    selectedById: uuid("selected_by_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [unique().on(table.windowId, table.round)],
);

// A match staff record from the spectator perspective for the Gemeinde stream
// (docs/plans/recording-holds.md). While the row exists, the match's result
// is withheld from the public and from Discord, exactly like the Match of
// the Week before its VOD; releasing the hold deletes the row. `window_id`
// and `round` are denormalised so the season's holds and the stale ones
// (Spieltag over) are one query. FKs + RLS in a custom migration.
export const recordingHolds = pgTable("recording_holds", {
  matchId: uuid("match_id").primaryKey(),
  windowId: uuid("window_id").notNull(),
  round: integer("round").notNull(),
  heldById: uuid("held_by_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// What a Discord post in the results channel announces: a match result, or
// the Match-of-the-Week VOD.
export const discordPostKindEnum = pgEnum("discord_post_kind", [
  "result",
  "motw_vod",
]);

// One Discord message per match and kind, mirroring the hub's public state:
// posted when a result becomes public (or a MotW VOD link lands), edited on
// changes, deleted when the state disappears (reopen, pick removed). The
// channel id is stored per post so messages stay editable if the configured
// results channel later changes. FK + RLS in a custom migration.
export const discordPosts = pgTable(
  "discord_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: discordPostKindEnum("kind").notNull(),
    matchId: uuid("match_id").notNull(),
    channelId: text("channel_id").notNull(),
    messageId: text("message_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [unique().on(table.kind, table.matchId)],
);

// What the hub created on Discord for a sub-division of a season: its group
// role or its private group channel (docs/plans/discord-season-setup.md).
export const discordSeasonResourceKindEnum = pgEnum(
  "discord_season_resource_kind",
  ["group_role", "group_channel"],
);

// Roles and channels the season setup created on Discord, tracked by id so
// the post-season cleanup can delete them regardless of renames. One row per
// sub-division and kind; a row is replaced when the sync recreates a resource
// whose Discord object disappeared. FKs + RLS in a custom migration.
export const discordSeasonResources = pgTable(
  "discord_season_resources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    windowId: uuid("window_id").notNull(),
    subDivisionId: uuid("sub_division_id").notNull(),
    kind: discordSeasonResourceKindEnum("kind").notNull(),
    discordId: text("discord_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [unique().on(table.subDivisionId, table.kind)],
);

// The last Discord season sync per window: when it ran and what it found
// (the SeasonDiscordReport, validated with zod on read). Overwritten by every
// run; the staff dashboard reads this row instead of talking to Discord.
export const discordSeasonSyncState = pgTable("discord_season_sync_state", {
  windowId: uuid("window_id").primaryKey(),
  ranAt: timestamp("ran_at", { withTimezone: true }).notNull(),
  report: jsonb("report").$type<unknown>().notNull(),
});

export const disputeStatusEnum = pgEnum("dispute_status", ["open", "resolved"]);
export const disputeResolutionEnum = pgEnum("dispute_resolution", [
  "upheld", // the reported result stands
  "corrected", // staff edited the result
]);

// A participant contesting a match's recorded result; staff adjudicate. A log
// per match (multiple over time) with at most one `open` at a time — the
// partial unique index enforcing that lives in the custom migration, alongside
// FKs + RLS (server-only, no policies).
export const disputes = pgTable("disputes", {
  id: uuid("id").primaryKey().defaultRandom(),
  matchId: uuid("match_id").notNull(),
  openedById: uuid("opened_by_id").notNull(),
  reason: text("reason").notNull(),
  status: disputeStatusEnum("status").notNull().default("open"),
  resolution: disputeResolutionEnum("resolution"),
  resolvedById: uuid("resolved_by_id"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  note: text("note"),
  openedAt: timestamp("opened_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// One player's acceptance of one season's Regelwerk. A row, not a boolean on
// the profile, because acceptance is per season: Saison 10 needs a fresh one,
// and last season's must not unlock this one. Anchored to the registration
// window like every other per-season table. The unique constraint makes
// accepting idempotent — a second confirmation is a no-op and leaves the
// original timestamp alone. FK + RLS in a custom migration.
export const regelwerkAcceptances = pgTable(
  "regelwerk_acceptances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    windowId: uuid("window_id").notNull(),
    userId: uuid("user_id").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [unique().on(table.windowId, table.userId)],
);

// What a feedback report is about: a broken thing, or a wish.
export const feedbackKindEnum = pgEnum("feedback_kind", ["bug", "idea"]);

// In-app intake for bug reports and (staff+) feature ideas. Tracking happens
// in a Discord forum, not here: the row is written first so a Discord outage
// never loses a report, and the thread it produced is recorded afterwards.
// `thread_guild_id` is stored per row rather than configured because the forum
// may move servers — reports written before a move must still resolve to a
// working link. `path`/`user_agent` are client-supplied and length-capped by
// the Zod schema. FK + RLS in a custom migration.
export const feedbackReports = pgTable(
  "feedback_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: feedbackKindEnum("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    path: text("path").notNull(),
    userAgent: text("user_agent").notNull(),
    buildSha: text("build_sha"),
    windowId: uuid("window_id"),
    round: integer("round"),
    reporterId: uuid("reporter_id").notNull(),
    // The reporter's role at submit time — roles change, reports don't.
    reporterRole: roleEnum("reporter_role").notNull(),
    threadId: text("thread_id"),
    threadGuildId: text("thread_guild_id"),
    // How many screenshots rode along. The images themselves live only in the
    // Discord thread, so if the post failed this is the only trace that the
    // report had them — staff can ask the reporter to resend.
    attachmentCount: integer("attachment_count").notNull().default(0),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  // The rate-limit read: this reporter's rows since a cutoff.
  (table) => [
    index("feedback_reports_reporter_idx").on(
      table.reporterId,
      table.createdAt,
    ),
  ],
);

// --- Usage statistics (docs/plans/usage-stats.md) ---------------------------
//
// Aggregates only: how many page loads and roughly how many people per period.
// There is no row per request and nothing that could be joined back to a
// person. `sketch` is a 4096-byte HyperLogLog (src/features/usage/hll.ts);
// a visitor's per-period hash bumps one register and is discarded. All three
// tables are server-only (RLS on, no policies) via the custom migration.

export const usagePeriodKindEnum = pgEnum("usage_period_kind", [
  "day",
  "week",
  "month",
]);

// Drizzle has no bytea column; postgres-js reads and writes it as a Buffer.
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

// One row per Berlin calendar day (`2026-08-31`), ISO week (`2026-W36`) or
// month (`2026-08`). `hours` is filled on day rows only: page loads per
// Berlin hour, keyed "00".."23".
export const usagePeriods = pgTable(
  "usage_periods",
  {
    kind: usagePeriodKindEnum("kind").notNull(),
    periodId: text("period_id").notNull(),
    visits: integer("visits").notNull().default(0),
    hours: jsonb("hours").$type<Record<string, number>>().notNull().default({}),
    sketch: bytea("sketch").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.kind, table.periodId] })],
);

// The per-period salt that makes visitor hashes unlinkable across periods.
// Created on first use, deleted 70 days after creation; period ids never
// collide across kinds, so the id alone is the key.
export const usageSalts = pgTable("usage_salts", {
  periodId: text("period_id").primaryKey(),
  salt: bytea("salt").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Single row: when counting began (only ever moves earlier) and whether the
// one-shot log backfill has run. `started_at` is what tells "nobody came"
// apart from "we weren't counting yet".
export const usageCollection = pgTable(
  "usage_collection",
  {
    id: boolean("id").primaryKey().default(true),
    startedAt: timestamp("started_at", { withTimezone: true }),
    backfilledAt: timestamp("backfilled_at", { withTimezone: true }),
    backfillThrough: timestamp("backfill_through", { withTimezone: true }),
    backfillVisits: integer("backfill_visits"),
  },
  (table) => [check("usage_collection_single_row", sql`${table.id}`)],
);
