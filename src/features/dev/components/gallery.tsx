"use client";

import { useState } from "react";
import { DateTimePicker } from "@/components/date-picker";
import { EmptyStateCard } from "@/components/empty-state-card";
import { FieldError } from "@/components/field-error";
import { ActionLink, InlineLink } from "@/components/links";
import { PlayerGrid, type RegisteredPlayer } from "@/components/player-grid";
import { SectionHeader } from "@/components/section-header";
import { Tick } from "@/components/tick";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SignInButton } from "@/features/auth/components/sign-in-button";
import { UserMenu } from "@/features/auth/components/user-menu";
import {
  SIGN_IN_ERROR_COPY,
  SIGN_IN_ERROR_KINDS,
} from "@/features/auth/sign-in-error";
import { ImpersonationPicker } from "@/features/dev/components/impersonation-picker";
import type { ImpersonatableUser } from "@/features/dev/impersonation/users";
import {
  GALLERY_CARDS,
  GALLERY_ICONS_A,
  GALLERY_ICONS_B,
  SEED_SHEET_A,
  SEED_SHEET_B,
} from "@/features/dev/teamsheets";
import { DiscordSeasonCard } from "@/features/discord-season/components/discord-season-card";
import { DropBanner } from "@/features/drops/components/drop-banner";
import { DropsSection } from "@/features/drops/components/drops-section";
import { ProfileStaffPanel } from "@/features/drops/components/profile-staff-panel";
import {
  FeedbackActions,
  FeedbackPanel,
} from "@/features/feedback/components/feedback-panel";
import { canSend, type FeedbackKind } from "@/features/feedback/feedback";
import { MembershipBlockedCard } from "@/features/membership/components/blocked-card";
import { MembershipGateBody } from "@/features/membership/components/gate-dialog";
import { MembershipList } from "@/features/membership/components/membership-list";
import { MembershipWarningCard } from "@/features/membership/components/warning-card";
import type { RosterMembership } from "@/features/membership/membership";
import { MotwBlock } from "@/features/motw/components/motw-block";
import { MotwManager } from "@/features/motw/components/motw-manager";
import { MotwMatchBanner } from "@/features/motw/components/motw-match-banner";
import { MotwTodoCard } from "@/features/motw/components/motw-todo-card";
import type {
  MotwBlockData,
  MotwCandidate,
  MotwPlayer,
  MotwWeek,
} from "@/features/motw/motw";
import { ProfileSpielplan } from "@/features/player-profile/components/profile-schedule";
import type { ProfileScheduleRow } from "@/features/player-profile/profile";
import { ProfileHeader } from "@/features/profile/components/profile-header";
import { SaveIndicator } from "@/features/profile/components/settings-form";
import { FullSchedule } from "@/features/public-league/components/full-schedule";
import { PublicLeague } from "@/features/public-league/components/public-league";
import type {
  PublicMatch,
  PublicOverview,
} from "@/features/public-league/queries";
import { AcceptanceStatus } from "@/features/regelwerk/components/acceptance-status";
import { Callout } from "@/features/regelwerk/components/callout";
import {
  ChapterDisclosure,
  ChapterSidebar,
} from "@/features/regelwerk/components/chapter-list";
import { RegelwerkCard } from "@/features/regelwerk/components/dashboard-card";
import { FactsGrid } from "@/features/regelwerk/components/facts";
import { PenaltyCard } from "@/features/regelwerk/components/penalty-card";
import {
  GateBody,
  ReminderBody,
} from "@/features/regelwerk/components/prompt-dialogs";
import {
  Bullet,
  Bullets,
  Key,
  SubBullets,
} from "@/features/regelwerk/components/prose";
import {
  NichtantretenPullOut,
  PunktePullOut,
  SpielwochePullOut,
  TiebreakerPullOut,
} from "@/features/regelwerk/components/pull-outs";
import { SAISON_9 } from "@/features/regelwerk/content/saison-9";
import { CancelRegistrationDialog } from "@/features/registration/components/cancel-registration-dialog";
import { ProfileCancelPanel } from "@/features/registration/components/profile-cancel-panel";
import { ProfileHint } from "@/features/registration/components/profile-hint";
import { RegistrationConfirmation } from "@/features/registration/components/registration-confirmation";
import { RegistrationForm } from "@/features/registration/components/registration-form";
import { DisputeDialog } from "@/features/reporting/components/dispute-dialog";
import { DisputeResolveDialog } from "@/features/reporting/components/dispute-resolve-dialog";
import { PublicMatchView } from "@/features/reporting/components/public-match-view";
import { ReportForm } from "@/features/reporting/components/report-form";
import { ReportSummary } from "@/features/reporting/components/report-summary";
import { SaisonDashboard } from "@/features/reporting/components/saison-dashboard";
import { StaffResultEditor } from "@/features/reporting/components/staff-result-editor";
import type {
  DisputeRow,
  MatchResultLite,
  StaffMatchRow,
  StoredResult,
} from "@/features/reporting/queries";
import type { StandingsRow } from "@/features/reporting/standings";
import { CreateScheduleDialog } from "@/features/schedule/components/create-schedule-dialog";
import { PublishScheduleCard } from "@/features/schedule/components/publish-schedule-card";
import { defaultDeadlines } from "@/features/schedule/spieltage";
import { ParticipantList } from "@/features/season/components/participant-list";
import {
  ComingSoonPanel,
  RegisterCtaPanel,
  SeasonMessagePanel,
} from "@/features/season/components/pre-season";
import { InSeasonDashboard } from "@/features/season/components/season-dashboard";
import type { PlayerMatch } from "@/features/season/dashboard";
import { ControlPill } from "@/features/seeding/components/control-bar";
import { FinalizeDialog } from "@/features/seeding/components/finalize-dialog";
import { PostSeasonPanel } from "@/features/seeding/components/post-season-panel";
import { SeedingSheet } from "@/features/seeding/components/seeding-sheet";
import { SeedingInitLoader } from "@/features/seeding/components/seeding-workspace";
import { StepBar } from "@/features/seeding/components/step-bar";
import type { SeedingPlayer } from "@/features/seeding/placement";
import { assignZones } from "@/features/seeding/post-season";
import type { DivisionWithGroupSizes } from "@/features/seeding/queries";
import { assembleSheetRows, UNPLACED_SECTION } from "@/features/seeding/sheet";
import { seedingSteps } from "@/features/seeding/steps";
import { SpoilerScore } from "@/features/spoilers/components/spoiler-score";
import { SpoilerSwitch } from "@/features/spoilers/components/spoiler-switch";
import { CopyLinkButton } from "@/features/staff/components/copy-link-button";
import { PreseasonTodoCard } from "@/features/staff/components/preseason-todo-card";
import { SeasonCard } from "@/features/staff/components/registration-status";
import type { RegistrationState } from "@/features/staff/registration-window";
import { TeamSheetCards } from "@/features/teamsheets/components/team-sheet-cards";
import { TeamsheetField } from "@/features/teamsheets/components/teamsheet-field";
import {
  emptyTeamsheet,
  storedTeamsheet,
} from "@/features/teamsheets/field-state";
import {
  UsageBarChart,
  UsageLegend,
} from "@/features/usage/components/usage-bar-chart";
import { UsageCards } from "@/features/usage/components/usage-cards";
import { UsageTable } from "@/features/usage/components/usage-table";

const AVATAR_URL = "https://cdn.discordapp.com/embed/avatars/1.png";

// Shared roster mock for the player-grid specimens.
const ROSTER: RegisteredPlayer[] = [
  { id: "1", name: "Testerino", avatarUrl: AVATAR_URL },
  { id: "2", name: "annegret" },
  { id: "3", name: "Blaubeerkuchen" },
  { id: "4", name: "Yannick mit sehr langem Namen" },
];

// Mock data for the Spieler-Dashboard specimen.
const DASH_TODAY = "2026-07-10";
const DASH_MATCHES: PlayerMatch[] = [
  {
    matchId: "m1",
    round: 1,
    startsOn: "2026-07-01",
    endsOn: "2026-07-07",
    opponent: { userId: "a", name: "Falinks", avatarUrl: null },
  },
  {
    matchId: "m2",
    round: 2,
    startsOn: "2026-07-08",
    endsOn: "2026-07-14",
    opponent: { userId: "b", name: "Wooloo", avatarUrl: AVATAR_URL },
  },
  {
    matchId: "m3",
    round: 3,
    startsOn: "2026-07-15",
    endsOn: "2026-07-21",
    opponent: { userId: "c", name: "Pawmi", avatarUrl: null },
  },
  {
    matchId: "m4",
    round: 4,
    startsOn: "2026-07-22",
    endsOn: "2026-07-28",
    opponent: null,
  },
];
const DASH_RESULTS = new Map<string, MatchResultLite>([
  [
    "m1",
    {
      matchId: "m1",
      outcome: "normal",
      winnerId: "me",
      confirmedAt: null,
      disputed: false,
      games: [{ winnerId: "me" }, { winnerId: "a" }, { winnerId: "me" }],
    },
  ],
]);
const SUMMARY_A = { userId: "me", name: "Testerino", avatarUrl: AVATAR_URL };
const SUMMARY_B = { userId: "opp", name: "Falinks", avatarUrl: null };
const SUMMARY_RESULT: StoredResult = {
  outcome: "normal",
  winnerId: "me",
  platform: "showdown",
  sheets: [
    {
      playerId: "me",
      id: "sheet-a",
      source: "import" as const,
      ots: SEED_SHEET_A,
    },
    {
      playerId: "opp",
      id: "sheet-b",
      source: "pokepaste" as const,
      ots: SEED_SHEET_B,
    },
  ],
  videoUrl: null,
  freeWinReason: null,
  discussedWithId: null,
  discussedWithName: null,
  reportedById: "me",
  reportedAt: new Date("2026-07-06T18:00:00Z"),
  confirmedAt: null,
  correctedAt: null,
  games: [
    {
      gameNumber: 1,
      winnerId: "me",
      replayUrl: "https://replay.pokemonshowdown.com/x",
    },
    {
      gameNumber: 2,
      winnerId: "opp",
      replayUrl: "https://replay.pokemonshowdown.com/y",
    },
    {
      gameNumber: 3,
      winnerId: "me",
      replayUrl: "https://replay.pokemonshowdown.com/z",
    },
  ],
};
// A 2:0 sweep (two games): under an active spoiler mode the page renders a
// phantom third row that turns into the "Nicht gespielt" ghost on reveal.
const SWEEP_RESULT: StoredResult = {
  outcome: "normal",
  winnerId: "me",
  platform: "showdown",
  sheets: [
    {
      playerId: "me",
      id: "sheet-a",
      source: "import" as const,
      ots: SEED_SHEET_A,
    },
    {
      playerId: "opp",
      id: "sheet-b",
      source: "pokepaste" as const,
      ots: SEED_SHEET_B,
    },
  ],
  videoUrl: null,
  freeWinReason: null,
  discussedWithId: null,
  discussedWithName: null,
  reportedById: "me",
  reportedAt: new Date("2026-07-06T18:00:00Z"),
  confirmedAt: null,
  correctedAt: null,
  games: [
    {
      gameNumber: 1,
      winnerId: "me",
      replayUrl: "https://replay.pokemonshowdown.com/x",
    },
    {
      gameNumber: 2,
      winnerId: "me",
      replayUrl: "https://replay.pokemonshowdown.com/y",
    },
  ],
};
// Cartridge: no replays anywhere; the match video is the spoiler-free content.
const CARTRIDGE_RESULT: StoredResult = {
  ...SWEEP_RESULT,
  platform: "cartridge",
  videoUrl: "https://youtu.be/QbxY2WuzCrU",
  games: [
    { gameNumber: 1, winnerId: "me", replayUrl: null },
    { gameNumber: 2, winnerId: "opp", replayUrl: null },
    { gameNumber: 3, winnerId: "me", replayUrl: null },
  ],
};
const FREEWIN_RESULT: StoredResult = {
  outcome: "free_win",
  winnerId: "me",
  platform: null,
  sheets: [],
  videoUrl: null,
  freeWinReason: "Gegner war trotz mehrerer Terminvorschläge nicht erreichbar.",
  discussedWithId: "staff",
  discussedWithName: "Orga Team",
  reportedById: "me",
  reportedAt: new Date("2026-07-06T18:00:00Z"),
  confirmedAt: null,
  correctedAt: null,
  games: [],
};
const staffRow = (
  matchId: string,
  round: number,
  groupName: string,
  a: string,
  b: string,
  extra: Partial<StaffMatchRow> = {},
): StaffMatchRow => ({
  matchId,
  round,
  tier: Number(groupName.replace("Division ", "").charAt(0)) || 1,
  groupName,
  endsOn: "2026-07-07",
  playerA: { userId: `${matchId}a`, name: a, avatarUrl: null },
  playerB: { userId: `${matchId}b`, name: b, avatarUrl: null },
  outcome: null,
  winnerId: null,
  confirmedAt: null,
  decidedByDrop: false,
  freeWinReason: null,
  reporterName: null,
  reportedAt: null,
  dispute: null,
  ...extra,
});
const STAFF_OVERDUE = [staffRow("o1", 1, "Division 1a", "Falinks", "Wooloo")];
const STAFF_WEEK = [
  staffRow("w1", 2, "Division 1a", "Pawmi", "Mika"),
  staffRow("w2", 2, "Division 1b", "Nico", "Luca", {
    outcome: "normal",
    winnerId: "w2a",
  }),
];
const STAFF_PENDING = [
  staffRow("p1", 1, "Division 2a", "Finn", "Jonas", {
    outcome: "free_win",
    winnerId: "p1a",
    freeWinReason: "Gegner war trotz mehrerer Anfragen nicht erreichbar.",
    reporterName: "Finn",
    reportedAt: new Date("2026-07-06T18:00:00Z"),
  }),
];
const STAFF_DISPUTED = [
  staffRow("d1", 2, "Division 1b", "Sora", "Kai", {
    outcome: "normal",
    winnerId: "d1a",
    dispute: {
      reason: "Spiel 2 ging an mich, nicht an Sora.",
      openedByName: "Kai",
      openedAt: new Date("2026-07-08T20:00:00Z"),
    },
  }),
];
const STAFF_RESOLVED: DisputeRow[] = [
  {
    matchId: "r1",
    round: 1,
    groupName: "Division 2b",
    playerA: { userId: "r1a", name: "Emil", avatarUrl: null },
    playerB: { userId: "r1b", name: "Ben", avatarUrl: null },
    reason: "Falscher Sieger gemeldet.",
    openedByName: "Ben",
    openedAt: new Date("2026-07-02T18:00:00Z"),
    resolution: "corrected",
    resolvedAt: new Date("2026-07-03T09:00:00Z"),
    note: "Replay von Spiel 3 zeigt Ben als Sieger. Ergebnis korrigiert.",
  },
  {
    matchId: "r2",
    round: 1,
    groupName: "Division 1a",
    playerA: { userId: "r2a", name: "Lea", avatarUrl: null },
    playerB: { userId: "r2b", name: "Tom", avatarUrl: null },
    reason: "Replay-Link stimmt nicht.",
    openedByName: "Lea",
    openedAt: new Date("2026-07-01T18:00:00Z"),
    resolution: "upheld",
    resolvedAt: new Date("2026-07-02T11:00:00Z"),
    note: "Der Link führt auf das richtige Replay. Ergebnis bleibt.",
  },
];
const EDITOR_INITIAL = {
  platform: "showdown" as const,
  games: [
    { winnerId: "ea", replayUrl: "https://replay.pokemonshowdown.com/gen9-1" },
    { winnerId: "eb", replayUrl: "https://replay.pokemonshowdown.com/gen9-2" },
    { winnerId: "ea", replayUrl: "https://replay.pokemonshowdown.com/gen9-3" },
  ],
  playerASheet: {
    source: "import" as const,
    ots: SEED_SHEET_A,
    icons: GALLERY_ICONS_A,
  },
  playerBSheet: {
    source: "pokepaste" as const,
    ots: SEED_SHEET_B,
    icons: GALLERY_ICONS_B,
  },
  videoUrl: null,
};
const GALLERY_SHEET_EMPTY = emptyTeamsheet();
const GALLERY_SHEET_LINKED = {
  ...emptyTeamsheet(),
  link: "https://pokepast.es/b89ff7cbd139fbcb",
  accepted: {
    source: "pokepaste" as const,
    ots: SEED_SHEET_A,
    icons: GALLERY_ICONS_A,
  },
};
const GALLERY_SHEET_IMPORTED = storedTeamsheet(
  "import",
  SEED_SHEET_B,
  GALLERY_ICONS_B,
);
const GALLERY_SHEET_ERROR = {
  ...emptyTeamsheet(),
  link: "https://pokepast.es/kaputt",
  error: "Das Teamsheet ist nicht vollständig.",
  details: [
    "Das Team braucht genau 6 Pokémon. Gefunden: 5.",
    "Delphox: Wesen fehlt.",
  ],
};
const GALLERY_SHEET_VRPASTE_DOWN = {
  ...emptyTeamsheet(),
  link: "https://www.vrpastes.com/uQ8gaGGC",
  error:
    "VRPaste ist gerade nicht erreichbar. Bitte einen Pokepaste-Link angeben oder das Team direkt aus Showdown importieren.",
};
const EDITOR_A = { userId: "ea", name: "Sora", avatarUrl: null };
const EDITOR_B = { userId: "eb", name: "Kai", avatarUrl: null };
// Builds a userId → zone map for a standings fixture, so the specimens show the
// post-season tints without a real config.
const zoneMap = (
  rows: StandingsRow[],
  counts: {
    champion?: number;
    promotions: number;
    promotionPlayoff: number;
    demotionPlayoff: number;
    demotions: number;
  },
) =>
  new Map(
    assignZones({ rowCount: rows.length, ...counts }).map((zone, i) => [
      rows[i].userId,
      zone,
    ]),
  );

// A balanced three-tier config (equal groups) for the post-season dialog.
const POST_SEASON_DIVISIONS: DivisionWithGroupSizes[] = [
  {
    id: "d1",
    tier: 1,
    relevantTable: "sub_division",
    guaranteedPromotions: 0,
    guaranteedDemotions: 1,
    promotionPlayoffSlots: 0,
    demotionPlayoffSlots: 1,
    championshipPlayoffSlots: 2,
    groupSizes: [8, 8],
  },
  {
    id: "d2",
    tier: 2,
    relevantTable: "division", // Gesamttabelle — per-division counts, 16 places
    guaranteedPromotions: 2,
    guaranteedDemotions: 2,
    promotionPlayoffSlots: 2,
    demotionPlayoffSlots: 2,
    championshipPlayoffSlots: 0,
    groupSizes: [8, 8],
  },
  {
    id: "d3",
    tier: 3,
    relevantTable: "sub_division",
    guaranteedPromotions: 1,
    guaranteedDemotions: 0,
    promotionPlayoffSlots: 1,
    demotionPlayoffSlots: 0,
    championshipPlayoffSlots: 0,
    groupSizes: [8, 8],
  },
];

// Unequal small groups with too many spots — exercises the overbooked stripe and
// an unbalanced seam.
const POST_SEASON_OVERBOOKED: DivisionWithGroupSizes[] = [
  {
    id: "o1",
    tier: 1,
    relevantTable: "sub_division",
    guaranteedPromotions: 0,
    guaranteedDemotions: 3,
    promotionPlayoffSlots: 0,
    demotionPlayoffSlots: 2, // 5 demote spots in a group of 4 → overbooked
    championshipPlayoffSlots: 0,
    groupSizes: [4, 4],
  },
  {
    id: "o2",
    tier: 2,
    relevantTable: "sub_division",
    guaranteedPromotions: 1,
    guaranteedDemotions: 0,
    promotionPlayoffSlots: 1,
    demotionPlayoffSlots: 0, // promotes 2, but o1 demotes 6 → unbalanced
    championshipPlayoffSlots: 0,
    groupSizes: [4, 4],
  },
];

const DASH_STANDINGS: StandingsRow[] = [
  {
    userId: "me",
    name: "Testerino",
    avatarUrl: AVATAR_URL,
    wins: 1,
    losses: 0,
    points: 3,
    gamesWon: 2,
    gamesLost: 0,
    rank: 1,
  },
  {
    userId: "a",
    name: "Falinks",
    avatarUrl: null,
    wins: 0,
    losses: 1,
    points: 0,
    gamesWon: 0,
    gamesLost: 2,
    rank: 2,
  },
  // b and c are genuinely tied (no games played) → shared rank 3, no rank 4.
  {
    userId: "b",
    name: "Wooloo",
    avatarUrl: AVATAR_URL,
    wins: 0,
    losses: 0,
    points: 0,
    gamesWon: 0,
    gamesLost: 0,
    rank: 3,
  },
  {
    userId: "c",
    name: "Pawmi",
    avatarUrl: null,
    wins: 0,
    losses: 0,
    points: 0,
    gamesWon: 0,
    gamesLost: 0,
    rank: 3,
    // Shows the "Drop" tag in every standings specimen.
    dropped: true,
  },
];
// The whole division (groups 1a + 1b, equal size) merged into one table — the
// division view of the switcher. "me" ranks mid-table among the other group.
const DASH_DIVISION_STANDINGS: StandingsRow[] = [
  {
    userId: "d",
    name: "Grafaiai",
    avatarUrl: null,
    wins: 1,
    losses: 0,
    points: 3,
    gamesWon: 2,
    gamesLost: 1,
    rank: 1,
  },
  {
    userId: "me",
    name: "Testerino",
    avatarUrl: AVATAR_URL,
    wins: 1,
    losses: 0,
    points: 3,
    gamesWon: 2,
    gamesLost: 0,
    rank: 1,
  },
  {
    userId: "e",
    name: "Kilowattrel",
    avatarUrl: null,
    wins: 1,
    losses: 0,
    points: 3,
    gamesWon: 2,
    gamesLost: 0,
    rank: 1,
  },
  {
    userId: "a",
    name: "Falinks",
    avatarUrl: null,
    wins: 0,
    losses: 1,
    points: 0,
    gamesWon: 0,
    gamesLost: 2,
    rank: 4,
  },
  {
    userId: "f",
    name: "Maushold",
    avatarUrl: null,
    wins: 0,
    losses: 1,
    points: 0,
    gamesWon: 0,
    gamesLost: 2,
    rank: 4,
  },
  {
    userId: "b",
    name: "Wooloo",
    avatarUrl: AVATAR_URL,
    wins: 0,
    losses: 0,
    points: 0,
    gamesWon: 0,
    gamesLost: 0,
    rank: 6,
  },
  {
    userId: "c",
    name: "Pawmi",
    avatarUrl: null,
    wins: 0,
    losses: 0,
    points: 0,
    gamesWon: 0,
    gamesLost: 0,
    rank: 6,
  },
  {
    userId: "g",
    name: "Tinkatink",
    avatarUrl: null,
    wins: 0,
    losses: 0,
    points: 0,
    gamesWon: 0,
    gamesLost: 0,
    rank: 6,
  },
];

// Public league overview: Division 1 in Gesamttabelle mode (with zones) plus a
// current-matchday match list.
const asIdentity = (row: StandingsRow) => ({
  userId: row.userId,
  name: row.name,
  avatarUrl: row.avatarUrl,
});

// Profile page Spielplan: every row state at once.
const profileRow = (
  matchId: string,
  round: number,
  extra: Partial<ProfileScheduleRow>,
): ProfileScheduleRow => ({
  matchId,
  round,
  startsOn: `2026-01-0${round}`,
  endsOn: `2026-01-1${round}`,
  opponent: { userId: `o${round}`, name: `Gegner ${round}`, avatarUrl: null },
  reported: false,
  scoreSelf: null,
  scoreOpponent: null,
  isMine: false,
  isMotw: false,
  motwEmbargo: null,
  ...extra,
});
const PROFILE_ROWS: ProfileScheduleRow[] = [
  profileRow("pr1", 1, { reported: true, scoreSelf: 2, scoreOpponent: 1 }),
  profileRow("pr2", 2, {}),
  profileRow("pr3", 3, {
    reported: true,
    scoreSelf: 0,
    scoreOpponent: 2,
    isMotw: true,
    motwEmbargo: null,
  }),
  profileRow("pr4", 4, {
    reported: true,
    scoreSelf: 2,
    scoreOpponent: 0,
    isMine: true,
  }),
  profileRow("pr5", 5, { opponent: null }),
  // MotW before its VOD: withheld (no score in the row, inert pill) and the
  // staff/participant preview (revealable, "not public" tooltip).
  profileRow("pr6", 6, {
    reported: true,
    isMotw: true,
    motwEmbargo: "withheld",
  }),
  profileRow("pr7", 7, {
    reported: true,
    scoreSelf: 2,
    scoreOpponent: 1,
    isMine: true,
    isMotw: true,
    motwEmbargo: "preview",
  }),
];

// Match of the Week: the featured pairing in every block state. The reported
// match (VOD live, result behind the reveal) doubles as the overview's
// featured row (badge instead of score); before the VOD the result is
// withheld from the public and previewed for staff/participants.
const MOTW_MATCH: PublicMatch = {
  matchId: "pm1",
  round: 2,
  playerA: asIdentity(DASH_STANDINGS[0]),
  playerB: asIdentity(DASH_STANDINGS[1]),
  reported: true,
  pending: false,
  scoreA: 2,
  scoreB: 0,
  winnerId: DASH_STANDINGS[0].userId,
  isMotw: true,
  motwEmbargo: null,
};
const MOTW_WITH_VOD: MotwBlockData = {
  match: MOTW_MATCH,
  groupName: "Division 1a",
  youtubeUrl: "https://www.youtube.com/watch?v=vgc-bundesliga",
  rankA: 1,
  rankB: 4,
};
const MOTW_WITHHELD: MotwBlockData = {
  ...MOTW_WITH_VOD,
  match: {
    ...MOTW_MATCH,
    scoreA: null,
    scoreB: null,
    winnerId: null,
    motwEmbargo: "withheld",
  },
  youtubeUrl: null,
};
const MOTW_PREVIEW: MotwBlockData = {
  ...MOTW_WITH_VOD,
  match: { ...MOTW_MATCH, motwEmbargo: "preview" },
  youtubeUrl: null,
};
const MOTW_OPEN: MotwBlockData = {
  match: {
    ...MOTW_MATCH,
    reported: false,
    scoreA: null,
    scoreB: null,
    winnerId: null,
  },
  groupName: "Division 1a",
  youtubeUrl: null,
  rankA: 1,
  rankB: 4,
};

// Staff workspace fixtures. The player rows carry every variation the picker
// has to survive: missing placement, dropped player, both capture-card states,
// and a pairing nobody can record.
function motwPlayer(
  name: string,
  rank: number | null,
  wins: number,
  losses: number,
  hasCaptureCard: boolean,
  dropped = false,
  profileEdited = true,
): MotwPlayer {
  return {
    userId: `motw-${name}`,
    name,
    avatarUrl: null,
    rank,
    wins,
    losses,
    hasCaptureCard,
    profileEdited,
    dropped,
  };
}

function motwCandidate(
  round: number,
  index: number,
  groupName: string,
  playerA: MotwPlayer,
  playerB: MotwPlayer,
  reported = false,
): MotwCandidate {
  return {
    matchId: `wm${round}-${index}`,
    round,
    tier: Number(groupName.replace("Division ", "").charAt(0)),
    groupName,
    playerA,
    playerB,
    reported,
  };
}

function motwCandidates(round: number): MotwCandidate[] {
  return [
    motwCandidate(
      round,
      0,
      "Division 1a",
      motwPlayer("Wooloo", 1, 4, 0, true),
      motwPlayer("Falinks", 2, 3, 1, true),
      true,
    ),
    motwCandidate(
      round,
      1,
      "Division 1a",
      motwPlayer("Pawmi", 3, 2, 2, true),
      motwPlayer("Tinkatink", 8, 0, 4, false),
    ),
    motwCandidate(
      round,
      2,
      "Division 1b",
      // Neither has a card on record and Nico never saved a profile, so this
      // pairing is "Capture Card unklar" rather than "nicht aufnehmbar".
      motwPlayer("Blaubeerkuchenbäckermeisterin Annegret", 4, 2, 2, false),
      motwPlayer("Nico", 5, 2, 2, false, false, false),
    ),
    motwCandidate(
      round,
      3,
      "Division 2a",
      motwPlayer("Luca", null, 0, 0, true),
      motwPlayer("Finn", 6, 1, 3, true, true),
    ),
    // Division 3 sits outside the default filter (top two divisions), so the
    // gallery shows the "Alle"-toggle actually having something to add.
    motwCandidate(
      round,
      4,
      "Division 3a",
      motwPlayer("Maushold", 1, 3, 1, true),
      motwPlayer("Kilowattrel", 2, 3, 1, true),
    ),
  ];
}

// Every week state the workspace has: a past one that was missed (still
// backfillable), a past one that is settled, the running week, and two open
// future weeks.
const MOTW_WEEKS: MotwWeek[] = [
  {
    round: 1,
    state: "past",
    startsOn: "2026-01-05",
    endsOn: "2026-01-11",
    candidates: motwCandidates(1),
    selection: null,
    selectedMatch: null,
    editable: true,
  },
  {
    round: 2,
    state: "past",
    startsOn: "2026-01-12",
    endsOn: "2026-01-18",
    candidates: motwCandidates(2),
    selection: { matchId: "wm2-1", youtubeUrl: "https://youtu.be/xK92dQvgc" },
    selectedMatch: motwCandidates(2)[1],
    editable: false,
  },
  {
    round: 3,
    state: "current",
    startsOn: "2026-01-19",
    endsOn: "2026-01-25",
    candidates: motwCandidates(3),
    selection: { matchId: "wm3-0", youtubeUrl: null },
    selectedMatch: motwCandidates(3)[0],
    editable: true,
  },
  {
    round: 4,
    state: "future",
    startsOn: "2026-01-26",
    endsOn: "2026-02-01",
    candidates: motwCandidates(4),
    selection: null,
    selectedMatch: null,
    editable: true,
  },
  {
    round: 5,
    state: "future",
    startsOn: "2026-02-02",
    endsOn: "2026-02-08",
    candidates: motwCandidates(5),
    selection: null,
    selectedMatch: null,
    editable: true,
  },
];

const PUBLIC_OVERVIEW: PublicOverview = {
  seasonName: "Saison 1",
  currentRound: 2,
  totalRounds: 4,
  matchdays: [
    { round: 1, startsOn: "2026-01-05", endsOn: "2026-01-11" },
    { round: 2, startsOn: "2026-01-12", endsOn: "2026-01-18" },
    { round: 3, startsOn: "2026-01-19", endsOn: "2026-01-25" },
    { round: 4, startsOn: "2026-01-26", endsOn: "2026-02-01" },
  ],
  divisions: [
    {
      tier: 1,
      name: "Division 1",
      mode: "division",
      divisionStandings: DASH_DIVISION_STANDINGS,
      divisionZones: zoneMap(DASH_DIVISION_STANDINGS, {
        champion: 1,
        promotions: 1,
        promotionPlayoff: 1,
        demotionPlayoff: 1,
        demotions: 1,
      }),
      divisionGroupLabels: new Map(
        DASH_DIVISION_STANDINGS.map((r, i) => [
          r.userId,
          i % 2 === 0 ? "1a" : "1b",
        ]),
      ),
      groups: [
        {
          subDivisionId: "1a",
          name: "Division 1a",
          shortName: "1a",
          standings: DASH_STANDINGS,
          zones: null,
          matches: [
            MOTW_MATCH,
            {
              matchId: "pm2",
              round: 2,
              playerA: asIdentity(DASH_STANDINGS[2]),
              playerB: asIdentity(DASH_STANDINGS[3]),
              reported: false,
              pending: false,
              scoreA: null,
              scoreB: null,
              winnerId: null,
              isMotw: false,
              motwEmbargo: null,
            },
            // A foreign reported match — covered pill in the overview specimen.
            {
              matchId: "pm4",
              round: 2,
              playerA: asIdentity(DASH_STANDINGS[1]),
              playerB: asIdentity(DASH_STANDINGS[3]),
              reported: true,
              pending: false,
              scoreA: 2,
              scoreB: 1,
              winnerId: DASH_STANDINGS[1].userId,
              isMotw: false,
              motwEmbargo: null,
            },
            {
              matchId: "pm3",
              round: 2,
              playerA: asIdentity(DASH_STANDINGS[0]),
              playerB: null,
              reported: false,
              pending: false,
              scoreA: null,
              scoreB: null,
              winnerId: null,
              isMotw: false,
              motwEmbargo: null,
            },
          ],
        },
      ],
    },
    {
      tier: 2,
      name: "Division 2",
      mode: "sub_division",
      divisionStandings: null,
      divisionZones: null,
      divisionGroupLabels: null,
      groups: [
        {
          subDivisionId: "2a",
          name: "Division 2a",
          shortName: "2a",
          standings: DASH_STANDINGS,
          zones: zoneMap(DASH_STANDINGS, {
            champion: 0,
            promotions: 1,
            promotionPlayoff: 0,
            demotionPlayoff: 0,
            demotions: 1,
          }),
          matches: [],
        },
      ],
    },
  ],
  motw: MOTW_WITH_VOD,
};

// Identity variants exercise the name/username/avatar fallbacks and, via
// roleLabel, all four role badges.
const IDENTITIES: {
  label: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  roleLabel: string;
}[] = [
  {
    label: "Avatar + Name",
    displayName: "Testerino",
    username: "testerino",
    avatarUrl: AVATAR_URL,
    roleLabel: "Admin",
  },
  {
    label: "Ohne Avatar",
    displayName: "Ohne Avatar",
    username: "ohne_avatar",
    avatarUrl: null,
    roleLabel: "Staff",
  },
  {
    label: "Langer Name",
    displayName: "Blaubeerkuchenbäckermeisterin Annegret III.",
    username: "annegret",
    avatarUrl: AVATAR_URL,
    roleLabel: "Dev",
  },
  {
    label: "Leere Metadaten",
    displayName: null,
    username: null,
    avatarUrl: null,
    roleLabel: "Spieler",
  },
];

const SAVE_STATES = ["idle", "saving", "saved", "error"] as const;

// Stateful wrapper for the date+time picker pair (matching button anatomy,
// browser-locale-independent 24h time).
function DateTimePickerDemo() {
  const [value, setValue] = useState("2026-07-20T18:00");
  return <DateTimePicker value={value} onChange={setValue} />;
}

// Stateful wrappers for the controlled spoiler components.
function SpoilerSwitchDemo() {
  const [off, setOff] = useState(false);
  return <SpoilerSwitch spoilersOff={off} onChange={setOff} />;
}

function SpoilerScoreDemo() {
  const [revealed, setRevealed] = useState(false);
  const [motwRevealed, setMotwRevealed] = useState(false);
  const [motwPreviewRevealed, setMotwPreviewRevealed] = useState(false);
  return (
    <div className="flex items-center gap-5 font-semibold text-muted-foreground text-xs tabular-nums">
      <SpoilerScore
        scoreA={2}
        scoreB={1}
        covered={!revealed}
        onReveal={() => setRevealed(true)}
      />
      <SpoilerScore
        scoreA={2}
        scoreB={0}
        covered={!motwRevealed}
        motw
        onReveal={() => setMotwRevealed(true)}
      />
      {/* MotW before its VOD: inert pill (withheld) and the preview pill. */}
      <SpoilerScore
        scoreA={null}
        scoreB={null}
        covered
        motw
        embargo="withheld"
        onReveal={() => {}}
      />
      <SpoilerScore
        scoreA={2}
        scoreB={0}
        covered={!motwPreviewRevealed}
        motw
        embargo="preview"
        onReveal={() => setMotwPreviewRevealed(true)}
      />
      <SpoilerScore scoreA={2} scoreB={0} covered={false} onReveal={() => {}} />
    </div>
  );
}

// The dialog is 640px wide with 16px padding, so the panel really renders at
// 608px — the gallery would otherwise stretch it across the full container and
// show a layout that never occurs.
function DialogWidth({ children }: { children: React.ReactNode }) {
  return <div className="max-w-[608px]">{children}</div>;
}

// A 1×1 transparent GIF, so the thumbnail specimens need no network request.
const PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

// The live form, wired to local state only — the gallery must not file real
// reports, so no server action is attached. Attachments are live too: paste or
// drop an image here and the thumbnail row behaves as it does in the dialog.
function FeedbackSpecimen({
  canSubmitIdea,
  error = null,
  attachments = [],
}: {
  canSubmitIdea: boolean;
  error?: string | null;
  attachments?: { id: string; name: string; previewUrl: string }[];
}) {
  const [kind, setKind] = useState<FeedbackKind>("bug");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [held, setHeld] = useState(attachments);
  return (
    <DialogWidth>
      <FeedbackPanel
        canSubmitIdea={canSubmitIdea}
        kind={kind}
        onKindChange={setKind}
        title={title}
        onTitleChange={setTitle}
        body={body}
        onBodyChange={setBody}
        attachments={held}
        onAddFiles={(files) =>
          setHeld((current) => [
            ...current,
            ...files.map((file, index) => ({
              id: `demo-${current.length + index}`,
              name: file.name,
              previewUrl: URL.createObjectURL(file),
            })),
          ])
        }
        onRemoveAttachment={(id) =>
          setHeld((current) => current.filter((item) => item.id !== id))
        }
        capturedPath="/match/8f2c"
        error={error}
      />
      <FeedbackActions
        disabled={!canSend({ title, body })}
        onSubmit={() => {}}
        onClose={() => {}}
      />
    </DialogWidth>
  );
}

function Specimen({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-4">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export function Gallery() {
  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">Design-Grundbausteine</h2>
        <Specimen label="Tick — Größen S / M / L (orange · neutral · navy)">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-4">
              <Tick size="s" />
              <Tick size="m" />
              <Tick size="l" />
            </div>
            <div className="flex items-center gap-4">
              <Tick size="m" color="neutral" />
              <Tick size="m" color="navy" />
            </div>
          </div>
        </Specimen>
        <Specimen label="SectionHeader (mit Meta, Count, navy Tick)">
          <div className="flex flex-col gap-4">
            <SectionHeader meta="Division 1a">Tabelle</SectionHeader>
            <SectionHeader count={3}>Überfällig</SectionHeader>
            <SectionHeader tickColor="navy" meta="Nur für Staff sichtbar">
              Staff
            </SectionHeader>
          </div>
        </Specimen>
        <Specimen label="DateTimePicker (deutscher Kalender + 24h-Uhrzeit, unabhängig von der Browser-Locale)">
          <DateTimePickerDemo />
        </Specimen>
        <Specimen label="EmptyStateCard (Aktion · informativ)">
          <div className="flex flex-col gap-4">
            <EmptyStateCard
              title="Noch nicht geöffnet"
              action={<Button>Mit Discord anmelden</Button>}
            >
              Die Anmeldung startet in Kürze. Sie wird im Discord angekündigt.
            </EmptyStateCard>
            <EmptyStateCard title="Noch kein Ergebnis" informational>
              Sobald das Ergebnis gemeldet ist, erscheinen hier Spiele, Replays
              und Teamsheets.
            </EmptyStateCard>
          </div>
        </Specimen>
        <Specimen label="Links — Action (→) · Inline (Prosa)">
          <div className="flex flex-col gap-2">
            <ActionLink href="#">Zum Spieler-Dashboard</ActionLink>
            <p className="text-sm text-muted-foreground">
              Mehr dazu in der{" "}
              <InlineLink href="#">Datenschutzerklärung</InlineLink>.
            </p>
          </div>
        </Specimen>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">ProfileHeader</h2>
        {IDENTITIES.map(
          ({ label, displayName, username, avatarUrl, roleLabel }) => (
            <Specimen key={label} label={label}>
              {/* max-w mirrors the /profil column so truncation is visible */}
              <div className="max-w-xl">
                <ProfileHeader
                  displayName={displayName}
                  username={username}
                  avatarUrl={avatarUrl}
                  roleLabel={roleLabel}
                />
              </div>
            </Specimen>
          ),
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">UserMenu</h2>
        <div className="grid grid-cols-2 gap-3">
          {IDENTITIES.slice(0, 2).map(({ label, displayName, avatarUrl }) => (
            <Specimen key={label} label={label}>
              <div className="flex justify-start">
                <UserMenu displayName={displayName} avatarUrl={avatarUrl} />
              </div>
            </Specimen>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">SignInButton</h2>
        <div className="grid grid-cols-3 gap-3">
          <Specimen label="default">
            <SignInButton />
          </Specimen>
          <Specimen label="outline (Header)">
            <SignInButton variant="outline" />
          </Specimen>
          <Specimen label="lg (Hero)">
            <SignInButton size="lg" />
          </Specimen>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">SaveIndicator</h2>
        <div className="grid grid-cols-4 gap-3">
          {SAVE_STATES.map((state) => (
            <Specimen key={state} label={state}>
              <div className="min-h-5">
                <SaveIndicator status={state} />
              </div>
            </Specimen>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">Fehlermeldungen</h2>
        {SIGN_IN_ERROR_KINDS.map((kind) => (
          <Specimen key={kind} label={`Anmeldefehler (?auth_error=${kind})`}>
            <p className="max-w-[440px] text-destructive text-sm">
              {SIGN_IN_ERROR_COPY[kind]}
            </p>
          </Specimen>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">Staff: Saison-Karte</h2>
        {(
          [
            ["not_started", null],
            ["open", new Date("2100-01-01T18:00:00Z")],
            ["closed", new Date("2000-01-01T18:00:00Z")],
          ] as [RegistrationState, Date | null][]
        ).map(([state, closesAt]) => (
          <Specimen key={state} label={state}>
            <SeasonCard
              state={state}
              season={state === "not_started" ? null : "Saison 9"}
              registrationUrl="http://localhost:3000/anmeldung"
              closesAt={closesAt}
            />
          </Specimen>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">Staff: Nächster Schritt</h2>
        <Specimen label="Anmeldung geschlossen — Einteilung steht aus">
          <PreseasonTodoCard phase="registration_closed" scheduleSetup={null} />
        </Specimen>
        <Specimen label="Einteilung finalisiert — Spielplan erstellen (Dialog ohne Staff-Login wirkungslos)">
          <PreseasonTodoCard
            phase="seeded"
            scheduleSetup={{
              seasonStart: "2026-08-24",
              deadlines: [
                "2026-08-30",
                "2026-09-06",
                "2026-09-13",
                "2026-09-20",
                "2026-09-27",
                "2026-10-04",
                "2026-10-11",
                "2026-10-18",
                "2026-10-25",
              ],
              groups: 8,
              matches: 144,
              largest: 10,
            }}
          />
        </Specimen>
        <Specimen label="Einteilung finalisiert — kein Spielplan berechenbar">
          <PreseasonTodoCard phase="seeded" scheduleSetup={null} />
        </Specimen>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">Anmeldungs-Grid</h2>
        <Specimen label="leer (Staff-Text)">
          <PlayerGrid
            players={[]}
            empty={
              <EmptyStateCard title="Noch keine Anmeldungen" informational>
                Sobald sich die ersten Spieler über den Anmeldelink
                registrieren, erscheinen sie hier.
              </EmptyStateCard>
            }
          />
        </Specimen>
        <Specimen label="mit Spielern">
          <PlayerGrid
            players={ROSTER}
            empty={<EmptyStateCard title="leer" informational />}
          />
        </Specimen>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">Dashboard: Teilnehmerfeld</h2>
        <Specimen label="mit Spielern">
          <ParticipantList players={ROSTER} seasonName="Saison 9" />
        </Specimen>
        <Specimen label="noch niemand angemeldet">
          <ParticipantList players={[]} seasonName="Saison 9" />
        </Specimen>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">CopyLinkButton</h2>
        <Specimen label="Anmeldelink">
          <CopyLinkButton url="http://localhost:3000/anmeldung" />
        </Specimen>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">Profil-Hinweis (Anmeldung + Dashboard)</h2>
        <Specimen label="Hinweis">
          <ProfileHint />
        </Specimen>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">Formularfehler</h2>
        <Specimen label="FieldError (Pflichtfeld · Format · Bereich)">
          <div className="flex max-w-sm flex-col gap-4">
            <div className="grid gap-2">
              <Label htmlFor="gallery-division">Division</Label>
              <Input
                id="gallery-division"
                defaultValue="3b"
                aria-invalid
                aria-describedby="gallery-division-error"
              />
              <FieldError
                id="gallery-division-error"
                message="Bitte nur Ziffern eingeben, zum Beispiel 3"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="gallery-season">Letzte Saison</Label>
              <Input
                id="gallery-season"
                defaultValue=""
                aria-invalid
                aria-describedby="gallery-season-error"
              />
              <FieldError id="gallery-season-error" message="Pflichtfeld" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="gallery-placement">Platzierung</Label>
              <Input
                id="gallery-placement"
                defaultValue="0"
                aria-invalid
                aria-describedby="gallery-placement-error"
              />
              <FieldError id="gallery-placement-error" message="Mindestens 1" />
            </div>
          </div>
        </Specimen>
        <Specimen label="Anmeldeformular: leer absenden zeigt alle Fehlerzustände">
          <div className="max-w-xl">
            <RegistrationForm
              displayName="TestSpieler"
              username="testspieler"
              detectedReturning={false}
            />
          </div>
        </Specimen>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">Registrierung: Bestätigung</h2>
        <Specimen label="Neuer Spieler (mit Abmelden)">
          <RegistrationConfirmation
            canWithdraw
            seasonName="Saison 9"
            closesAt={new Date("2100-01-01T18:00:00Z")}
            data={{
              platform: "showdown",
              prevSeason: null,
              prevName: null,
              prevDivision: null,
              prevPlacement: null,
              skillSelfRating: 4,
              greatestAchievements: "Top 16 Regional",
            }}
          />
        </Specimen>
        <Specimen label="Veteran (geschlossen, kein Abmelden)">
          <RegistrationConfirmation
            canWithdraw={false}
            seasonName="Saison 9"
            closesAt={null}
            data={{
              platform: "cartridge",
              prevSeason: "Saison 4",
              prevName: "AltHase",
              prevDivision: 2,
              prevPlacement: 3,
              skillSelfRating: null,
              greatestAchievements: null,
            }}
          />
        </Specimen>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">Seeding: Sheet</h2>
        <Specimen label="Zeilen (Separatoren, Spieler, Gruppen)">
          <div className="flex h-[440px] flex-col overflow-hidden rounded-lg border">
            <SeedingSheet
              rows={assembleSheetRows({
                players: SEEDING_PLAYERS,
                divisions: SEEDING_DIVISIONS,
                subDivisions: SEEDING_SUBS,
                size: 8,
                filter: { query: "", status: "all" },
              })}
              divisions={SEEDING_DIVISIONS}
              subDivisions={SEEDING_SUBS}
              selection={new Set()}
              readOnly={false}
              finalized={false}
              generatingDivisionId={null}
              onGenerate={() => {}}
              onToggleSelect={() => {}}
              onToggleCollapse={() => {}}
              onAssignDivision={() => {}}
              onMoveGroup={() => {}}
              onPlace={() => {}}
            />
          </div>
        </Specimen>
        <Specimen label="Beobachter — Selects deaktiviert, keine Checkboxen/Generieren">
          <div className="flex h-[300px] flex-col overflow-hidden rounded-lg border">
            <SeedingSheet
              rows={assembleSheetRows({
                players: SEEDING_PLAYERS,
                divisions: SEEDING_DIVISIONS,
                subDivisions: SEEDING_SUBS,
                size: 8,
                filter: { query: "", status: "all" },
              })}
              divisions={SEEDING_DIVISIONS}
              subDivisions={SEEDING_SUBS}
              selection={new Set()}
              readOnly
              finalized={false}
              generatingDivisionId={null}
              onGenerate={() => {}}
              onToggleSelect={() => {}}
              onToggleCollapse={() => {}}
              onAssignDivision={() => {}}
              onMoveGroup={() => {}}
              onPlace={() => {}}
            />
          </div>
        </Specimen>
        <Specimen label="Finalisiert — statische Zeilen (Division/Gruppe als Text)">
          <div className="flex h-[300px] flex-col overflow-hidden rounded-lg border">
            <SeedingSheet
              rows={assembleSheetRows({
                players: SEEDING_PLAYERS,
                divisions: SEEDING_DIVISIONS,
                subDivisions: SEEDING_SUBS,
                size: 8,
                filter: { query: "", status: "all" },
              })}
              divisions={SEEDING_DIVISIONS}
              subDivisions={SEEDING_SUBS}
              selection={new Set()}
              readOnly
              finalized
              generatingDivisionId={null}
              onGenerate={() => {}}
              onToggleSelect={() => {}}
              onToggleCollapse={() => {}}
              onAssignDivision={() => {}}
              onMoveGroup={() => {}}
              onPlace={() => {}}
            />
          </div>
        </Specimen>
        <Specimen label="Eingeklappt (Nicht platziert zu, Gruppe 1a zu, Division 2 zu)">
          <div className="flex h-[300px] flex-col overflow-hidden rounded-lg border">
            <SeedingSheet
              rows={assembleSheetRows({
                players: SEEDING_PLAYERS,
                divisions: SEEDING_DIVISIONS,
                subDivisions: SEEDING_SUBS,
                size: 8,
                filter: { query: "", status: "all" },
                collapsedIds: new Set([UNPLACED_SECTION, "s1", "d2"]),
              })}
              divisions={SEEDING_DIVISIONS}
              subDivisions={SEEDING_SUBS}
              selection={new Set()}
              readOnly={false}
              finalized={false}
              generatingDivisionId={null}
              onGenerate={() => {}}
              onToggleSelect={() => {}}
              onToggleCollapse={() => {}}
              onAssignDivision={() => {}}
              onMoveGroup={() => {}}
              onPlace={() => {}}
            />
          </div>
        </Specimen>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">Seeding: Auto-Einteilung (Ladezustand)</h2>
        <Specimen label="Während die Rückkehrer eingeteilt werden">
          <div className="flex h-40 flex-col rounded-lg border">
            <SeedingInitLoader />
          </div>
        </Specimen>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">Seeding: Steuerungs-Pill</h2>
        <Specimen label="Beobachter — niemand steuert">
          <ControlPill
            state="free"
            holderName={null}
            pending={false}
            onAcquire={() => {}}
            onRelease={() => {}}
          />
        </Specimen>
        <Specimen label="Beobachter — jemand steuert">
          <ControlPill
            state="held-by-other"
            holderName="Testerino"
            pending={false}
            onAcquire={() => {}}
            onRelease={() => {}}
          />
        </Specimen>
        <Specimen label="Du steuerst">
          <ControlPill
            state="self"
            holderName="Testerino"
            pending={false}
            onAcquire={() => {}}
            onRelease={() => {}}
          />
        </Specimen>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">Einteilung: Schrittleiste</h2>
        <Specimen label="Anfang — Schritt 1 aktiv, Finalisieren nennt den Blocker">
          <StepBar
            steps={seedingSteps({
              total: 42,
              placed: 12,
              grouped: 0,
              postSeasonConfigured: false,
              replayConfigured: true,
              finalized: false,
            })}
            view="sheet"
            onViewChange={() => {}}
            rulesStatus={{
              replayConfigured: false,
              configured: false,
              dirty: false,
              noGroups: true,
              issueCount: 0,
            }}
            finalize={{
              finalized: false,
              ready: false,
              readOnly: false,
              gateShort: "Noch 30 platzieren",
              gateHint:
                "Erst möglich, wenn alle Spieler platziert (12/42) und in Gruppen (0/42) sind.",
              onOpen: () => {},
            }}
          />
        </Specimen>
        <Specimen label="Alles eingeteilt — Regel-Ansicht aktiv, Punkte zu klären">
          <StepBar
            steps={seedingSteps({
              total: 42,
              placed: 42,
              grouped: 42,
              postSeasonConfigured: false,
              replayConfigured: true,
              finalized: false,
            })}
            view="rules"
            onViewChange={() => {}}
            rulesStatus={{
              replayConfigured: false,
              configured: false,
              dirty: true,
              noGroups: false,
              issueCount: 2,
            }}
            finalize={{
              finalized: false,
              ready: false,
              readOnly: false,
              gateShort: "Regeln noch speichern",
              gateHint:
                "Erst die Auf- und Abstiegsregeln festlegen und speichern.",
              onOpen: () => {},
            }}
          />
        </Specimen>
        <Specimen label="Bereit zum Finalisieren — Schritt 4 wird zur Aktion">
          <StepBar
            steps={seedingSteps({
              total: 42,
              placed: 42,
              grouped: 42,
              postSeasonConfigured: true,
              replayConfigured: true,
              finalized: false,
            })}
            view="sheet"
            onViewChange={() => {}}
            rulesStatus={{
              replayConfigured: true,
              configured: true,
              dirty: false,
              noGroups: false,
              issueCount: 0,
            }}
            finalize={{
              finalized: false,
              ready: true,
              readOnly: false,
              gateShort: null,
              gateHint: "Endgültig, kann nicht rückgängig gemacht werden.",
              onOpen: () => {},
            }}
          />
        </Specimen>
        <Specimen label="Bereit, aber Beobachter — Steuerung übernehmen">
          <StepBar
            steps={seedingSteps({
              total: 42,
              placed: 42,
              grouped: 42,
              postSeasonConfigured: true,
              replayConfigured: true,
              finalized: false,
            })}
            view="sheet"
            onViewChange={() => {}}
            rulesStatus={{
              replayConfigured: true,
              configured: true,
              dirty: false,
              noGroups: false,
              issueCount: 0,
            }}
            finalize={{
              finalized: false,
              ready: true,
              readOnly: true,
              gateShort: null,
              gateHint: "Endgültig, kann nicht rückgängig gemacht werden.",
              onOpen: () => {},
            }}
          />
        </Specimen>
        <Specimen label="Finalisiert — Chip statt Aktion, Flow-Hint entfällt">
          <StepBar
            steps={seedingSteps({
              total: 42,
              placed: 42,
              grouped: 42,
              postSeasonConfigured: true,
              replayConfigured: true,
              finalized: true,
            })}
            view="sheet"
            onViewChange={() => {}}
            rulesStatus={{
              replayConfigured: true,
              configured: true,
              dirty: false,
              noGroups: false,
              issueCount: 0,
            }}
            finalize={{
              finalized: true,
              ready: false,
              readOnly: true,
              gateShort: null,
              gateHint: "",
              onOpen: () => {},
            }}
          />
        </Specimen>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">Einteilung: Finalisieren</h2>
        <Specimen label="Type-to-confirm-Dialog">
          <FinalizeSpecimen />
        </Specimen>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">Öffentliche Liga-Übersicht</h2>
        <Specimen label="Laufende Saison (MotW-Block · Divisions-Umschalter · Tabellen · Spieltag · Spoiler-Schutz)">
          <PublicLeague
            overview={PUBLIC_OVERVIEW}
            meId="me"
            initialSpoilersOff={false}
          />
        </Specimen>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">Spoiler-Schutz</h2>
        <Specimen label="Globaler Schalter (schreibt das Cookie)">
          <SpoilerSwitchDemo />
        </Specimen>
        <Specimen label="Verdeckter Score — antippen deckt auf (Standard · MotW · MotW zurückgehalten, inert · MotW-Vorschau · offen)">
          <SpoilerScoreDemo />
        </Specimen>
        <Specimen label="Match-Seite verdeckt — Showdown 2:1 (Maske, Notiz-Zeile, Spiele-Pills)">
          <ReportSummary
            result={SUMMARY_RESULT}
            playerA={SUMMARY_A}
            playerB={SUMMARY_B}
            viewerId={null}
            privileged={false}
            round={2}
            groupName="Division 1a"
            spoilerMode="default"
          />
        </Specimen>
        <Specimen label="Match-Seite verdeckt — Showdown 2:0 (Phantom-Spiel 3 → Ghost nach Aufdecken)">
          <ReportSummary
            result={SWEEP_RESULT}
            playerA={SUMMARY_A}
            playerB={SUMMARY_B}
            viewerId={null}
            privileged={false}
            round={2}
            groupName="Division 1a"
            spoilerMode="default"
          />
        </Specimen>
        <Specimen label="Match-Seite verdeckt — Cartridge (keine Replays, Video frei)">
          <ReportSummary
            result={CARTRIDGE_RESULT}
            playerA={SUMMARY_A}
            playerB={SUMMARY_B}
            viewerId={null}
            privileged={false}
            round={2}
            groupName="Division 1a"
            spoilerMode="default"
          />
        </Specimen>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">Spieler-Profil</h2>
        <Specimen label="Spielplan (verdeckt · offen · MotW · eigenes Match · spielfrei · MotW zurückgehalten · MotW-Vorschau) + Schalter">
          <ProfileSpielplan rows={PROFILE_ROWS} initialSpoilersOff={false} />
        </Specimen>
        <Specimen label="Staff-Panel — aktiver Spieler / gedroppter Spieler (Aktionen ohne Staff-Login wirkungslos)">
          <div className="flex flex-col gap-4">
            <ProfileStaffPanel
              player={{
                userId: "a",
                name: "Falinks",
                groupName: "Division 1a",
              }}
              dropped={false}
              dropReason={null}
            />
            <ProfileStaffPanel
              player={{ userId: "c", name: "Pawmi", groupName: "Division 1a" }}
              dropped
              dropReason="Inaktivität, mehrfach nicht erreichbar."
            />
          </div>
        </Specimen>
        <Specimen label="Staff-Panel — Anmeldung stornieren (nur zwischen Anmeldeschluss und Einteilung)">
          <ProfileCancelPanel
            player={{ userId: "b", name: "Falinks" }}
            seasonName="Saison 9"
          />
        </Specimen>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">Drops</h2>
        <Specimen label="Match-Seite: Drop-Banner (einfach / beidseitig)">
          <div className="flex flex-col">
            <DropBanner
              playerAName="Falinks"
              playerBName="Wooloo"
              aDropped
              bDropped={false}
            />
            <DropBanner
              playerAName="Falinks"
              playerBName="Wooloo"
              aDropped
              bDropped
            />
          </div>
        </Specimen>
        <Specimen label="Staff: Drops-Sektion (Liste + Dialog; Aktionen ohne Staff-Login wirkungslos)">
          <DropsSection
            drops={[
              {
                identity: { userId: "c", name: "Pawmi", avatarUrl: null },
                groupName: "Division 1a",
                reason: "Inaktivität, mehrfach nicht erreichbar.",
                droppedAt: new Date("2026-07-06T10:00:00Z"),
              },
            ]}
            candidates={[
              { userId: "a", name: "Falinks", groupName: "Division 1a" },
              { userId: "b", name: "Wooloo", groupName: "Division 1a" },
            ]}
          />
        </Specimen>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">Match of the Week</h2>
        <Specimen label="Billboard — noch offen (VOD-folgt-Platzhalter)">
          <MotwBlock motw={MOTW_OPEN} />
        </Specimen>
        <Specimen label="Billboard — gemeldet, ohne VOD: Ergebnis zurückgehalten (Gast, nichts aufzudecken)">
          <MotwBlock motw={MOTW_WITHHELD} />
        </Specimen>
        <Specimen label="Billboard — gemeldet, ohne VOD: Vorschau für Staff/Beteiligte (Klick deckt auf, Marker 'noch nicht öffentlich')">
          <MotwBlock motw={MOTW_PREVIEW} />
        </Specimen>
        <Specimen label="Billboard — gemeldet, mit VOD: verdeckt (Klick deckt auf), VOD-Button">
          <MotwBlock motw={MOTW_WITH_VOD} />
        </Specimen>
        <Specimen label="Staff-Workspace — aktuelle Woche gewählt, VOD fehlt (Aktionen ohne Staff-Login wirkungslos)">
          <MotwManager weeks={MOTW_WEEKS} currentRound={3} initialRound={3} />
        </Specimen>
        <Specimen label="Staff-Workspace — kommende Woche ohne Wahl (Picker offen: Divisionsfilter, Sortierung, Capture-Card-Filter, nicht aufnehmbare Paarung)">
          <MotwManager weeks={MOTW_WEEKS} currentRound={3} initialRound={4} />
        </Specimen>
        <Specimen label="Staff-Workspace — vergangener Spieltag mit Wahl (nur VOD-Link änderbar)">
          <MotwManager weeks={MOTW_WEEKS} currentRound={3} initialRound={2} />
        </Specimen>
        <Specimen label="Staff-Workspace — vergangener Spieltag ohne Wahl (nachträglich wählbar)">
          <MotwManager weeks={MOTW_WEEKS} currentRound={3} initialRound={1} />
        </Specimen>
        <Specimen label="Match-Seite: Banner (ohne VOD · ohne VOD, Ergebnis noch nicht öffentlich · mit VOD)">
          <div className="flex flex-col">
            <MotwMatchBanner round={2} youtubeUrl={null} />
            <MotwMatchBanner round={2} youtubeUrl={null} notPublic />
            <MotwMatchBanner
              round={2}
              youtubeUrl="https://www.youtube.com/watch?v=vgc-bundesliga"
            />
          </div>
        </Specimen>
        <Specimen label="Match-Seite verdeckt — MotW-Variante (eigene Notiz, ignoriert den Schalter)">
          <ReportSummary
            result={SUMMARY_RESULT}
            playerA={SUMMARY_A}
            playerB={SUMMARY_B}
            viewerId={null}
            privileged={false}
            round={2}
            groupName="Division 1a"
            spoilerMode="motw"
          />
        </Specimen>
        <Specimen label="Staff-Todo — nächste Woche (Hinweis)">
          <MotwTodoCard todo={{ round: 3, urgency: "warning" }} />
        </Specimen>
        <Specimen label="Staff-Todo — aktuelle Woche (dringend)">
          <MotwTodoCard todo={{ round: 2, urgency: "urgent" }} />
        </Specimen>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">Einteilung: Auf- & Abstieg (Ansicht)</h2>
        <Specimen label="Gültig (Gruppen- & Gesamttabelle, Seams ausgeglichen)">
          <div className="flex h-[520px] flex-col overflow-hidden rounded-lg border">
            <PostSeasonPanel
              divisions={POST_SEASON_DIVISIONS}
              readOnly={false}
              finalized={false}
              configured
              replayTiers="2"
              replayError={null}
              onReplayChange={() => {}}
              onSave={async () => ({ ok: true, issues: [] })}
            />
          </div>
        </Specimen>
        <Specimen label="Überbelegt & unausgeglichen (Fehlerzustände)">
          <div className="flex h-[520px] flex-col overflow-hidden rounded-lg border">
            <PostSeasonPanel
              divisions={POST_SEASON_OVERBOOKED}
              readOnly={false}
              finalized={false}
              configured
              replayTiers="2"
              replayError={null}
              onReplayChange={() => {}}
              onSave={async () => ({ ok: true, issues: [] })}
            />
          </div>
        </Specimen>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">Spielplan: Erstellen</h2>
        <Specimen label="Dialog (Spielwochen-Deadlines)">
          <CreateScheduleDialog
            seasonStart="2026-07-01"
            defaultDeadlines={defaultDeadlines("2026-07-01", 7)}
            largest={8}
          />
        </Specimen>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">Spielplan: Veröffentlichen</h2>
        <Specimen label="Todo-Karte + Publish-Gate (Aktion ohne Staff-Login wirkungslos)">
          <PublishScheduleCard
            facts={{
              rounds: 7,
              matches: 68,
              groups: 16,
              firstDeadline: "2026-09-13",
              lastDeadline: "2026-10-25",
            }}
          />
        </Specimen>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">Kompletter Spielplan (/spielplan)</h2>
        <Specimen label="Alle Spieltage einer Division (gemeldet · offen · MotW · spielfrei) + Intern-Chip">
          <FullSchedule
            hiddenPreview
            meId=""
            initialSpoilersOff={false}
            overview={{
              seasonName: "Saison 9",
              currentRound: 1,
              totalRounds: 2,
              motw: null,
              matchdays: [
                { round: 1, startsOn: "2026-09-01", endsOn: "2026-09-13" },
                { round: 2, startsOn: "2026-09-14", endsOn: "2026-09-20" },
              ],
              divisions: [
                {
                  tier: 1,
                  name: "Division 1",
                  mode: "sub_division",
                  divisionStandings: null,
                  divisionZones: null,
                  divisionGroupLabels: null,
                  groups: [
                    {
                      subDivisionId: "g1",
                      name: "Division 1a",
                      shortName: "1a",
                      standings: [],
                      zones: null,
                      matches: [
                        {
                          matchId: "m1",
                          round: 1,
                          playerA: {
                            userId: "u1",
                            name: "Frieda Immergrün",
                            avatarUrl: null,
                          },
                          playerB: {
                            userId: "u2",
                            name: "Karl Kraut",
                            avatarUrl: null,
                          },
                          reported: true,
                          pending: false,
                          scoreA: 2,
                          scoreB: 1,
                          winnerId: "u1",
                          isMotw: false,
                          motwEmbargo: null,
                        },
                        {
                          matchId: "m2",
                          round: 1,
                          playerA: {
                            userId: "u3",
                            name: "Mara Blitz",
                            avatarUrl: null,
                          },
                          playerB: null,
                          reported: false,
                          pending: false,
                          scoreA: null,
                          scoreB: null,
                          winnerId: null,
                          isMotw: false,
                          motwEmbargo: null,
                        },
                        {
                          matchId: "m3",
                          round: 2,
                          playerA: {
                            userId: "u2",
                            name: "Karl Kraut",
                            avatarUrl: null,
                          },
                          playerB: {
                            userId: "u3",
                            name: "Mara Blitz",
                            avatarUrl: null,
                          },
                          reported: false,
                          pending: false,
                          scoreA: null,
                          scoreB: null,
                          winnerId: null,
                          isMotw: false,
                          motwEmbargo: null,
                        },
                      ],
                    },
                    {
                      subDivisionId: "g2",
                      name: "Division 1b",
                      shortName: "1b",
                      standings: [],
                      zones: null,
                      matches: [
                        {
                          matchId: "m4",
                          round: 1,
                          playerA: {
                            userId: "u4",
                            name: "Ole Wetter",
                            avatarUrl: null,
                          },
                          playerB: {
                            userId: "u5",
                            name: "Pia Sturm",
                            avatarUrl: null,
                          },
                          reported: true,
                          pending: false,
                          scoreA: 2,
                          scoreB: 0,
                          winnerId: "u4",
                          isMotw: true,
                          motwEmbargo: null,
                        },
                      ],
                    },
                  ],
                },
              ],
            }}
          />
        </Specimen>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">Spieler-Dashboard</h2>
        <Specimen label="Gesamttabelle (Division-Modus, Zonen: Auf-/Abstieg + Playoff)">
          <InSeasonDashboard
            groupName="Division 1a"
            currentRound={2}
            totalRounds={4}
            next={DASH_MATCHES[1]}
            matches={DASH_MATCHES}
            resultByMatchId={DASH_RESULTS}
            standings={DASH_STANDINGS}
            divisionName="Division 1"
            divisionStandings={DASH_DIVISION_STANDINGS}
            divisionZones={zoneMap(DASH_DIVISION_STANDINGS, {
              champion: 1,
              promotions: 1,
              promotionPlayoff: 1,
              demotionPlayoff: 1,
              demotions: 1,
            })}
            defaultScope="division"
            meId="me"
            today={DASH_TODAY}
            seasonNumber={9}
          />
        </Specimen>
        <Specimen label="Gruppentabelle (Sub-Division-Modus, Zonen pro Gruppe)">
          <InSeasonDashboard
            groupName="Division 1a"
            currentRound={2}
            totalRounds={4}
            next={DASH_MATCHES[1]}
            matches={DASH_MATCHES}
            resultByMatchId={DASH_RESULTS}
            standings={DASH_STANDINGS}
            groupZones={zoneMap(DASH_STANDINGS, {
              promotions: 1,
              promotionPlayoff: 0,
              demotionPlayoff: 0,
              demotions: 1,
            })}
            divisionName="Division 1"
            divisionStandings={null}
            defaultScope="group"
            meId="me"
            today={DASH_TODAY}
            seasonNumber={9}
          />
        </Specimen>
        <Specimen label="Vorsaison: keine Saison">
          <ComingSoonPanel />
        </Specimen>
        <Specimen label="Vorsaison: Anmeldung läuft (CTA)">
          <RegisterCtaPanel seasonName="Saison 1" />
        </Specimen>
        <Specimen label="Vorsaison: nicht dabei">
          <SeasonMessagePanel
            title="Du bist in der laufenden Saison nicht dabei"
            body="Für diese Saison liegt keine Einteilung für dich vor."
          />
        </Specimen>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">Match-Meldung: Formular (Replay-Pflicht)</h2>
        <Specimen label="Division mit Replay-Pflicht — Replays/Video Pflicht">
          <div className="max-h-[520px] overflow-auto rounded-lg border p-4">
            <ReportForm
              matchId="demo"
              round={2}
              groupName="Division 1a"
              deadline="2026-07-14"
              proofRequired
              playerA={{ ...SUMMARY_A, userId: "me" }}
              playerB={{ ...SUMMARY_B, userId: "opp" }}
              reporterId="me"
              staffOptions={[
                { userId: "staff1", name: "Orga Team", avatarUrl: null },
              ]}
            />
          </div>
        </Specimen>
        <Specimen label="Division ohne Replay-Pflicht — Beweis optional">
          <div className="max-h-[520px] overflow-auto rounded-lg border p-4">
            <ReportForm
              matchId="demo"
              round={2}
              groupName="Division 3b"
              deadline="2026-07-14"
              proofRequired={false}
              playerA={{ ...SUMMARY_A, userId: "me" }}
              playerB={{ ...SUMMARY_B, userId: "opp" }}
              reporterId="me"
              staffOptions={[
                { userId: "staff1", name: "Orga Team", avatarUrl: null },
              ]}
            />
          </div>
        </Specimen>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">Teamsheets</h2>
        <Specimen label="Paste-Karten (Mega, Standard, ohne Item / drei Attacken)">
          <TeamSheetCards cards={GALLERY_CARDS} ots={SEED_SHEET_A} />
        </Specimen>
        <Specimen label="Feld: leer (Link oder Import)">
          <div className="max-w-[420px]">
            <TeamsheetField
              label="Dein Team"
              value={GALLERY_SHEET_EMPTY}
              onChange={() => {}}
            />
          </div>
        </Specimen>
        <Specimen label="Feld: Link akzeptiert">
          <div className="max-w-[420px]">
            <TeamsheetField
              label="Dein Team"
              value={GALLERY_SHEET_LINKED}
              onChange={() => {}}
            />
          </div>
        </Specimen>
        <Specimen label="Feld: über Showdown-Export importiert">
          <div className="max-w-[420px]">
            <TeamsheetField
              label="Dein Team"
              value={GALLERY_SHEET_IMPORTED}
              onChange={() => {}}
            />
          </div>
        </Specimen>
        <Specimen label="Feld: Fehler (unvollständiges Teamsheet)">
          <div className="max-w-[420px]">
            <TeamsheetField
              label="Team von Kai"
              value={GALLERY_SHEET_ERROR}
              onChange={() => {}}
            />
          </div>
        </Specimen>
        <Specimen label="Feld: Fehler (VRPaste nicht erreichbar)">
          <div className="max-w-[420px]">
            <TeamsheetField
              label="Team von Kai"
              value={GALLERY_SHEET_VRPASTE_DOWN}
              onChange={() => {}}
            />
          </div>
        </Specimen>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">Match-Meldung: Ergebnis</h2>
        <Specimen label="Ergebnis (Teilnehmer-Sicht: Sieg, Showdown, 2:1)">
          <ReportSummary
            result={SUMMARY_RESULT}
            playerA={SUMMARY_A}
            playerB={SUMMARY_B}
            viewerId="me"
            privileged
            round={2}
            groupName="Division 1a"
          />
        </Specimen>
        <Specimen label="Ergebnis (neutrale Sicht: A vs. B, ohne Meta)">
          <ReportSummary
            result={SUMMARY_RESULT}
            playerA={SUMMARY_A}
            playerB={SUMMARY_B}
            viewerId={null}
            privileged={false}
            round={2}
            groupName="Division 1a"
          />
        </Specimen>
        <Specimen label="Freewin (Teilnehmer/Staff: wartet auf Staff + Kontext)">
          <ReportSummary
            result={FREEWIN_RESULT}
            playerA={SUMMARY_A}
            playerB={SUMMARY_B}
            viewerId="me"
            privileged
            round={3}
            groupName="Division 1a"
          />
        </Specimen>
        <Specimen label="Angefochten (Chip Final → Angefochten)">
          <ReportSummary
            result={SUMMARY_RESULT}
            playerA={SUMMARY_A}
            playerB={SUMMARY_B}
            viewerId="me"
            privileged
            disputed
            round={2}
            groupName="Division 1a"
          />
        </Specimen>
        <Specimen label="Öffentliche Sicht (Gast, ohne Ergebnis)">
          <PublicMatchView
            round={2}
            groupName="Division 1a"
            seasonLabel="Saison 1"
            playerA={SUMMARY_A}
            playerB={SUMMARY_B}
          />
        </Specimen>
        <Specimen label="Öffentliche Sicht (Gast, Match of the Week gespielt, Ergebnis folgt mit dem VOD)">
          <PublicMatchView
            round={2}
            groupName="Division 1a"
            seasonLabel="Saison 1"
            playerA={SUMMARY_A}
            playerB={SUMMARY_B}
            state="played"
          />
        </Specimen>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">Staff: Saison-Dashboard</h2>
        <Specimen label="Worklist (überfällig · angefochten · diese Woche · Freewins)">
          <SaisonDashboard
            overdue={STAFF_OVERDUE}
            thisWeek={STAFF_WEEK}
            pendingFreeWins={STAFF_PENDING}
            disputed={STAFF_DISPUTED}
            resolvedDisputes={STAFF_RESOLVED}
            today="2026-07-10"
          />
        </Specimen>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">Disputes</h2>
        <Specimen label="Spieler: Ergebnis anfechten">
          <DisputeDialog matchId="demo" />
        </Specimen>
        <Specimen label="Staff: Anfechtung entscheiden (gemeldetes Ergebnis)">
          <DisputeResolveDialog
            matchId="demo"
            playerA={EDITOR_A}
            playerB={EDITOR_B}
            reason="Spiel 2 ging an mich, nicht an Sora."
            openedByName="Kai"
            outcome="normal"
            winnerName={EDITOR_A.name}
            editorInitial={EDITOR_INITIAL}
          />
        </Specimen>
        <Specimen label="Staff: Anfechtung entscheiden (unbestätigter Freewin)">
          <DisputeResolveDialog
            matchId="demo"
            playerA={EDITOR_A}
            playerB={EDITOR_B}
            reason="Wir hatten einen Termin, ich war da."
            openedByName="Kai"
            outcome="free_win"
            winnerName={EDITOR_A.name}
            pendingFreeWin
            editorInitial={null}
          />
        </Specimen>
        <Specimen label="Staff: Ergebnis bearbeiten">
          <StaffResultEditor
            matchId="demo"
            playerA={EDITOR_A}
            playerB={EDITOR_B}
            initial={EDITOR_INITIAL}
          />
        </Specimen>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">Feedback</h2>
        <Specimen label="Spieler: nur Fehlermeldung (kein Typ-Umschalter)">
          <FeedbackSpecimen canSubmitIdea={false} />
        </Specimen>
        <Specimen label="Staff: Fehler oder Idee">
          <FeedbackSpecimen canSubmitIdea />
        </Specimen>
        <Specimen label="Validierungsfehler / Rate Limit">
          <FeedbackSpecimen
            canSubmitIdea
            error="Du hast gerade sehr viele Meldungen abgeschickt. Bitte versuche es in einer Stunde erneut."
          />
        </Specimen>
        <Specimen label='Screenshots — Anhänge voll (3/3, kein "Bild"-Button mehr)'>
          <FeedbackSpecimen
            canSubmitIdea={false}
            attachments={[
              { id: "s1", name: "screenshot-1.webp", previewUrl: PIXEL },
              { id: "s2", name: "screenshot-2.webp", previewUrl: PIXEL },
              { id: "s3", name: "screenshot-3.webp", previewUrl: PIXEL },
            ]}
          />
        </Specimen>
        <Specimen label="Gesendet — Screenshots konnten nicht angehängt werden">
          <DialogWidth>
            <FeedbackPanel
              canSubmitIdea
              kind="bug"
              onKindChange={() => {}}
              title=""
              onTitleChange={() => {}}
              body=""
              onBodyChange={() => {}}
              sent={{
                threadUrl: null,
                attachmentCount: 2,
                attachmentsPosted: false,
              }}
            />
            <FeedbackActions sent onSubmit={() => {}} onClose={() => {}} />
          </DialogWidth>
        </Specimen>
        <Specimen label="Gesendet — mit Thread-Link (Forum auf dem Hauptserver)">
          <DialogWidth>
            <FeedbackPanel
              canSubmitIdea
              kind="bug"
              onKindChange={() => {}}
              title=""
              onTitleChange={() => {}}
              body=""
              onBodyChange={() => {}}
              sent={{
                threadUrl: "https://discord.com/channels/1/2",
                attachmentCount: 2,
                attachmentsPosted: true,
              }}
            />
            <FeedbackActions sent onSubmit={() => {}} onClose={() => {}} />
          </DialogWidth>
        </Specimen>
        <Specimen label="Gesendet — ohne Link (Forum auf dem Staff-Server)">
          <DialogWidth>
            <FeedbackPanel
              canSubmitIdea
              kind="bug"
              onKindChange={() => {}}
              title=""
              onTitleChange={() => {}}
              body=""
              onBodyChange={() => {}}
              sent={{
                threadUrl: null,
                attachmentCount: 0,
                attachmentsPosted: true,
              }}
            />
            <FeedbackActions sent onSubmit={() => {}} onClose={() => {}} />
          </DialogWidth>
        </Specimen>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">Regelwerk</h2>
        <Specimen label="Auf einen Blick — sechs Kacheln, eine hervorgehoben">
          <FactsGrid
            facts={SAISON_9.facts}
            emphasisIndex={SAISON_9.emphasisIndex}
          />
        </Specimen>
        <Specimen label="Kapitelliste — Sidebar (Desktop) · aufklappbar (Mobil)">
          {/* Both variants side by side: on the document itself only one is
              ever visible, so the gallery is the only place to compare them. */}
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <ChapterSidebar chapters={REGELWERK_CHAPTERS} />
            <ChapterDisclosure
              chapters={REGELWERK_CHAPTERS}
              className="w-full sm:max-w-xs"
            />
          </div>
        </Specimen>
        <Specimen label="Pull-out: Deine Spielwoche (Mi = Meldefrist)">
          <SpielwochePullOut />
        </Specimen>
        <Specimen label="Pull-out: Punkte (orange = Sieg, Niederlagen neutral)">
          <PunktePullOut />
        </Specimen>
        <Specimen label="Pull-out: Tiebreaker — geordnete Leiter mit Qualifier-Pill">
          <TiebreakerPullOut />
        </Specimen>
        <Specimen label="Pull-out: Nichtantreten — Zeitleiste (orange = Anspruch)">
          <NichtantretenPullOut />
        </Specimen>
        <Specimen label="Callout — orange (kostet den Spieler etwas) · navy (strukturell)">
          <div className="flex flex-col gap-4">
            <Callout title="Replay-Pflicht" tickColor="orange" emphasis>
              Von den Spielen in Division 1 &amp; 2 müssen Replays hochgeladen
              werden!
            </Callout>
            <Callout title="Nachrichten sind unveränderlich">
              Die Nachrichten dürfen nicht bearbeitet oder gelöscht werden.
            </Callout>
          </div>
        </Specimen>
        <Specimen label='Strafen-Karte — mit und ohne "Champions"-Qualifier'>
          <div className="flex flex-col gap-4">
            <PenaltyCard title="Teamsheet-Fehler" qualifier="Champions">
              <Bullets className="text-[13px]">
                <Bullet>
                  Bei Verdacht sollte die Orga hinzugezogen werden.
                </Bullet>
              </Bullets>
            </PenaltyCard>
            <PenaltyCard title="Ghosting">
              <Bullets className="text-[13px]">
                <Bullet>
                  Das Annehmen von Hinweisen zu einem laufenden Match ist
                  verboten.
                </Bullet>
              </Bullets>
            </PenaltyCard>
          </div>
        </Specimen>
        <Specimen label="Prosa — Aufzählung mit Unterpunkten und Schlüsselbegriffen">
          <Bullets>
            <Bullet>
              Die Spiele dürfen von{" "}
              <Key>Montag 0:00 Uhr bis Sonntag 23:59 Uhr</Key> abgehalten
              werden.
              <SubBullets>
                <Bullet>
                  Sämtliche Konversation muss über den Division-Channel
                  stattfinden.
                </Bullet>
              </SubBullets>
            </Bullet>
            <Bullet>Es ist kein Startgeld nötig.</Bullet>
          </Bullets>
        </Specimen>
        <Specimen label="Dashboard-Karte — leiser Einstieg während der Saison">
          <div className="max-w-sm">
            <RegelwerkCard seasonNumber={9} />
          </div>
        </Specimen>
        <Specimen label="Regelwerk-Seite — noch nicht bestätigt (öffnet den Dialog)">
          <AcceptanceStatus seasonNumber={9} acceptedAt={null} />
        </Specimen>
        <Specimen label="Regelwerk-Seite — bestätigt (nur Status, kein Steuerelement)">
          <AcceptanceStatus
            seasonNumber={9}
            acceptedAt="2026-07-31T12:20:00.000Z"
          />
        </Specimen>
        {/* Rendered inside a closed Dialog root: DialogTitle needs that
            context, and Root renders its children inline — only Content
            portals. The real gate dialog cannot be mounted here, because it is
            deliberately non-dismissible and would take the gallery hostage. */}
        <Specimen label="Erinnerungs-Dialog — Saison noch nicht gestartet (orange, schließbar)">
          <Dialog>
            <DialogWidth>
              <ReminderBody seasonNumber={9} />
            </DialogWidth>
          </Dialog>
        </Specimen>
        <Specimen label="Sperr-Dialog — Saison läuft (navy, nicht schließbar)">
          <Dialog>
            <DialogWidth>
              <GateBody seasonNumber={9} />
            </DialogWidth>
          </Dialog>
        </Specimen>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">Discord-Saison (Rollen & Gruppenkanäle)</h2>
        <Specimen label="Staff — Abweichung (Fehler, fehlende Gruppe, übersprungene Spieler)">
          <DiscordSeasonCard
            view={{
              kind: "attention",
              ranAt: new Date("2026-09-06T18:05:00+02:00"),
              groups: { ready: 3, total: 4 },
              players: { ready: 37, total: 40 },
              error:
                "Kanal für Division 2b konnte nicht angelegt werden (HTTP 403)",
              skipped: [
                { name: "Alice", reason: "no_discord_id" },
                { name: "Bob", reason: "error" },
              ],
            }}
          />
        </Specimen>
        <Specimen label="Staff — Abgleich läuft nicht (letzter Lauf über eine Stunde her)">
          <DiscordSeasonCard
            view={{
              kind: "stale",
              ranAt: new Date("2026-09-06T09:40:00+02:00"),
            }}
          />
        </Specimen>
        <Specimen label="Staff — noch kein Abgleich (Button ohne Staff-Login wirkungslos)">
          <DiscordSeasonCard view={{ kind: "never" }} />
        </Specimen>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">Discord-Mitgliedschaft</h2>
        {/* Same closed-Dialog trick as the Regelwerk gate above: the real
            dialog is non-dismissible and would take the gallery hostage. */}
        <Specimen label="Sperr-Dialog — Konto nicht auf dem Server (navy, nicht schließbar)">
          <Dialog>
            <DialogWidth>
              <MembershipGateBody />
            </DialogWidth>
          </Dialog>
        </Specimen>
        <Specimen label="Anmeldung — blockiert, weil nicht auf dem Server">
          <MembershipBlockedCard />
        </Specimen>
        <Specimen label="Staff — Warnung oben auf dem Dashboard (einer / mehrere)">
          <div className="flex flex-col gap-3">
            <MembershipWarningCard count={1} listId="gallery-membership" />
            <MembershipWarningCard count={3} listId="gallery-membership" />
          </div>
        </Specimen>
        <Specimen label="Staff — Liste (nicht auf dem Server · noch nicht geprüft), mit Stornieren">
          <MembershipList
            roster={MEMBERSHIP_ROSTER}
            seasonName="Saison 9"
            canCancel
          />
        </Specimen>
        <Specimen label="Staff — alle bestätigt">
          <MembershipList
            roster={MEMBERSHIP_ROSTER_CONFIRMED}
            seasonName="Saison 9"
            canCancel={false}
          />
        </Specimen>
        <Specimen label="Anmeldung stornieren — Bestätigungsdialog (Staff, nur nach Anmeldeschluss)">
          <CancelRegistrationDialog
            seasonName="Saison 9"
            player={{
              userId: "66666666-6666-4666-8666-666666666666",
              name: "Ausgetreten",
            }}
          />
        </Specimen>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">Dev: Impersonation</h2>
        <Specimen label="Picker — Suche, Rollen, Drop-Markierung, Kappung">
          <ImpersonationPicker users={IMPERSONATION_USERS} />
        </Specimen>
        <Specimen label="Picker — ohne Nutzer (leere Datenbank)">
          <ImpersonationPicker users={[]} />
        </Specimen>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl">Nutzung (Staff-Bereich, admin+)</h2>
        <Specimen label="UsageCards — Kennzahlen">
          <UsageCards
            cards={[
              { label: "Heute", value: 143, unit: "Aufrufe" },
              { label: "Heute", value: 61, unit: "Personen" },
              { label: "Diese Woche", value: 188, unit: "Personen" },
              { label: "Dieser Monat", value: 1204, unit: "Personen" },
            ]}
          />
        </Specimen>
        <Specimen label="UsageBarChart — gezählt · ruhig (0) · vor Beginn der Zählung (schraffiert)">
          <div className="flex flex-col gap-3">
            <UsageBarChart bars={USAGE_BARS} unit="Aufrufe" labelEvery={5} />
            <UsageLegend />
          </div>
        </Specimen>
        <Specimen label="UsageBarChart — noch nichts gezählt">
          <UsageBarChart
            bars={USAGE_BARS.map((bar) => ({
              ...bar,
              value: 0,
              counted: false,
            }))}
            unit="Aufrufe"
            labelEvery={5}
          />
        </Specimen>
        <Specimen label="UsageTable — mit Zeile vor Beginn der Zählung">
          <UsageTable
            periodHeading="Tag"
            rows={[
              {
                id: "2026-08-31",
                label: "Mo., 31.08.2026",
                visits: 143,
                uniques: 61,
                counted: true,
              },
              {
                id: "2026-08-30",
                label: "So., 30.08.2026",
                visits: 0,
                uniques: 0,
                counted: true,
              },
              {
                id: "2026-08-29",
                label: "Sa., 29.08.2026",
                visits: 0,
                uniques: 0,
                counted: false,
              },
            ]}
          />
        </Specimen>
      </section>
    </div>
  );
}

// 30 days of bars: the first six from before counting began, one quiet day.
const USAGE_BARS = Array.from({ length: 30 }, (_, i) => {
  const day = String(i + 1).padStart(2, "0");
  const counted = i >= 6;
  const value = !counted || i === 13 ? 0 : 40 + ((i * 37) % 90);
  return { label: `${day}.08.`, value, counted };
});

// Deliberately includes the shapes a cloned season produces: umlauts, an
// overlong name, a dropped player, a user with no profile identity at all, and
// enough rows to trip the "weitere Treffer" cap.
// One confirmed non-member, one never-checked, one confirmed member (does not
// appear in the list, only in the roster stamp).
const MEMBERSHIP_ROSTER: RosterMembership[] = [
  {
    userId: "66666666-6666-4666-8666-666666666666",
    displayName: "Ausgetreten",
    username: "ausgetreten",
    avatarUrl: null,
    guildMember: false,
    guildMemberCheckedAt: new Date("2026-08-20T14:32:00Z"),
  },
  {
    userId: "77777777-7777-4777-8777-777777777777",
    displayName: "Nie Geprüft",
    username: "nie_geprueft",
    avatarUrl: null,
    guildMember: null,
    guildMemberCheckedAt: null,
  },
  {
    userId: "88888888-8888-4888-8888-888888888888",
    displayName: "Brav Dabei",
    username: "brav",
    avatarUrl: null,
    guildMember: true,
    guildMemberCheckedAt: new Date("2026-08-21T09:00:00Z"),
  },
];

const MEMBERSHIP_ROSTER_CONFIRMED: RosterMembership[] = [MEMBERSHIP_ROSTER[2]];

const IMPERSONATION_USERS: ImpersonatableUser[] = [
  {
    userId: "11111111-1111-4111-8111-111111111111",
    displayName: "Jörg Müller",
    username: "jorgm",
    role: "dev",
    division: "Division 1a",
    dropped: false,
  },
  {
    userId: "22222222-2222-4222-8222-222222222222",
    displayName: "Blaubeerkuchenbäckermeisterin Annegret III.",
    username: "annegret",
    role: "admin",
    division: "Division 1b",
    dropped: false,
  },
  {
    userId: "33333333-3333-4333-8333-333333333333",
    displayName: "Kai",
    username: "kai",
    role: "staff",
    division: "Division 2a",
    dropped: true,
  },
  {
    userId: "44444444-4444-4444-8444-444444444444",
    displayName: null,
    username: null,
    role: "player",
    division: null,
    dropped: false,
  },
  ...Array.from({ length: 26 }, (_, i) => ({
    userId: `55555555-5555-4555-8555-${String(i).padStart(12, "0")}`,
    displayName: `Spielerin ${i + 1}`,
    username: `spielerin_${i + 1}`,
    role: "player" as const,
    division: `Division ${1 + (i % 3)}${"abc"[i % 3]}`,
    dropped: false,
  })),
];

const SEEDING_DIVISIONS = [
  { id: "d1", tier: 1 },
  { id: "d2", tier: 2 },
];
const SEEDING_SUBS = [
  { id: "s1", divisionId: "d1", position: 0 },
  { id: "s2", divisionId: "d1", position: 1 },
];

// The finalize dialog is controlled (opened via the step bar in the real
// toolbar), so the specimen provides its own opener button + open state.
function FinalizeSpecimen() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        Finalisieren…
      </Button>
      <FinalizeDialog
        season="Saison 9"
        onConfirm={async () => ({ ok: true })}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

function seedPlayer(overrides: Partial<SeedingPlayer>): SeedingPlayer {
  return {
    userId: crypto.randomUUID(),
    displayName: "Spieler",
    username: "spieler",
    avatarUrl: null,
    status: "new",
    platform: "showdown",
    participatedBefore: false,
    skillSelfRating: 5,
    prevSeason: null,
    prevName: null,
    prevDivision: null,
    prevPlacement: null,
    greatestAchievements: null,
    divisionId: null,
    subDivisionId: null,
    ...overrides,
  };
}

const REGELWERK_CHAPTERS = SAISON_9.chapters.map((chapter) => ({
  id: chapter.id,
  number: chapter.number,
  title: chapter.title,
}));

const SEEDING_PLAYERS: SeedingPlayer[] = [
  seedPlayer({
    displayName: "AltHase",
    status: "returning",
    platform: "cartridge",
    participatedBefore: true,
    skillSelfRating: null,
    prevSeason: "Saison 4",
    prevDivision: 1,
    prevPlacement: 2,
  }),
  seedPlayer({ displayName: "Neuling", skillSelfRating: 8 }),
  seedPlayer({
    displayName: "Kuro",
    divisionId: "d1",
    subDivisionId: "s1",
    skillSelfRating: 9,
  }),
  seedPlayer({
    displayName: "Annegret",
    divisionId: "d1",
    subDivisionId: "s2",
    platform: "cartridge",
  }),
];
