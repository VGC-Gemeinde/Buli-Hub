import { z } from "zod";
import { type matchOutcomeEnum, platformEnum } from "@/db/schema";

// Pure logic for a player's match report: best-of-3 legality, the report form
// schema (a discriminated union over the outcome), and the mapping from the
// reporter-relative form input to absolute persistence rows.

export type Platform = (typeof platformEnum.enumValues)[number];
export type MatchOutcome = (typeof matchOutcomeEnum.enumValues)[number];

export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export type SeriesResult =
  | { ok: true; winnerId: string; gamesPlayed: 2 | 3 }
  | {
      ok: false;
      reason:
        | "too_few"
        | "too_many"
        | "not_decisive"
        | "extra_game"
        | "unknown_player";
    };

// Best-of-3 derivation from the per-game winner ids. Legal series: each winner
// is one of the two participants and games are played until one side reaches 2.
export function deriveSeries(
  winners: readonly string[],
  playerAId: string,
  playerBId: string,
): SeriesResult {
  if (winners.length < 2) {
    return { ok: false, reason: "too_few" };
  }
  if (winners.length > 3) {
    return { ok: false, reason: "too_many" };
  }
  let a = 0;
  let b = 0;
  for (let i = 0; i < winners.length; i++) {
    if (winners[i] === playerAId) {
      a++;
    } else if (winners[i] === playerBId) {
      b++;
    } else {
      return { ok: false, reason: "unknown_player" };
    }
    // A decided series must end immediately — no game after 2 wins.
    if ((a === 2 || b === 2) && i !== winners.length - 1) {
      return { ok: false, reason: "extra_game" };
    }
  }
  if (a < 2 && b < 2) {
    return { ok: false, reason: "not_decisive" };
  }
  return {
    ok: true,
    winnerId: a === 2 ? playerAId : playerBId,
    gamesPlayed: winners.length as 2 | 3,
  };
}

const seriesMessages: Record<
  Extract<SeriesResult, { ok: false }>["reason"],
  string
> = {
  too_few: "Best-of-3 braucht mindestens zwei Spiele.",
  too_many: "Ein Best-of-3 hat höchstens drei Spiele.",
  not_decisive: "Bei 1:1 fehlt das entscheidende dritte Spiel.",
  extra_game: "Das Match war bereits entschieden.",
  unknown_player: "Unbekannter Spieler",
};

const platformValues = platformEnum.enumValues;

const gameInputSchema = z.object({
  winnerId: z.string().min(1),
  replayUrl: z.string().trim().optional(),
});

// A team sheet as it arrives from the form: already resolved and stripped by
// `validateTeamsheet`, whichever of the three routes produced it. Only the
// shape is checked here — the sheet's *contents* are re-parsed server-side in
// the action, which is what keeps @pkmn out of this module and out of the
// client bundle it feeds.
const sheetInputSchema = z.object({
  source: z.enum(["pokepaste", "vrpaste", "import"]),
  ots: z.string().trim().min(1, "Pflichtfeld"),
});

export type SheetInput = z.infer<typeof sheetInputSchema>;

const normalSchema = z.object({
  outcome: z.literal("normal"),
  platform: z.enum(platformValues, { error: "Bitte eine Plattform wählen" }),
  games: z.array(gameInputSchema).min(2).max(3),
  playerASheet: sheetInputSchema,
  playerBSheet: sheetInputSchema,
  videoUrl: z.string().trim().nullish(),
});

const freeWinSchema = z.object({
  outcome: z.literal("free_win"),
  winnerId: z.string().min(1),
  freeWinReason: z
    .string()
    .trim()
    .min(1, "Bitte einen Grund angeben")
    .max(2000),
  discussedWithId: z.string().min(1, "Bitte einen Staff auswählen"),
});

// Staff-only outcome (never player-reportable): both players lose, no winner.
const doubleLossSchema = z.object({ outcome: z.literal("double_loss") });

const reportUnion = z.discriminatedUnion("outcome", [
  normalSchema,
  freeWinSchema,
]);
const staffResultUnion = z.discriminatedUnion("outcome", [
  normalSchema,
  freeWinSchema,
  doubleLossSchema,
]);

export type ReportInput = z.infer<typeof reportUnion>;
export type StaffResultInput = z.infer<typeof staffResultUnion>;

export type ReportContext = {
  participants: { playerAId: string; playerBId: string };
  isStaffOrAdmin: (userId: string) => boolean;
  // Whether this match's division requires proof (top-X rule from the
  // seeding): Showdown replays per game / a cartridge video. When false,
  // proof is optional — provided links are still format-checked. The
  // Match of the Week is never required: it is recorded on stream.
  proofRequired: boolean;
};

// Shared validation for player reports and staff edits (double_loss needs none).
function refineReport(
  value: StaffResultInput,
  ctx: z.RefinementCtx,
  context: ReportContext,
) {
  const { playerAId, playerBId } = context.participants;
  if (value.outcome === "normal") {
    const series = deriveSeries(
      value.games.map((game) => game.winnerId),
      playerAId,
      playerBId,
    );
    if (!series.ok) {
      ctx.addIssue({
        code: "custom",
        path: ["games"],
        message: seriesMessages[series.reason],
      });
    }
    if (value.platform === "showdown") {
      value.games.forEach((game, i) => {
        if (context.proofRequired && !game.replayUrl) {
          ctx.addIssue({
            code: "custom",
            path: ["games", i, "replayUrl"],
            message: "Replay-Link erforderlich",
          });
        }
        if (game.replayUrl && !isHttpsUrl(game.replayUrl)) {
          ctx.addIssue({
            code: "custom",
            path: ["games", i, "replayUrl"],
            message: "Ungültiger Link",
          });
        }
      });
      if (value.videoUrl) {
        ctx.addIssue({
          code: "custom",
          path: ["videoUrl"],
          message: "Ein Video-Link ist nur für Cartridge vorgesehen.",
        });
      }
    } else {
      if (context.proofRequired && !value.videoUrl) {
        ctx.addIssue({
          code: "custom",
          path: ["videoUrl"],
          message: "Video-Link erforderlich",
        });
      }
      if (value.videoUrl && !isHttpsUrl(value.videoUrl)) {
        ctx.addIssue({
          code: "custom",
          path: ["videoUrl"],
          message: "Ungültiger Link",
        });
      }
      value.games.forEach((game, i) => {
        if (game.replayUrl) {
          ctx.addIssue({
            code: "custom",
            path: ["games", i, "replayUrl"],
            message: "Replays gibt es nur für Showdown.",
          });
        }
      });
    }
  } else if (value.outcome === "free_win") {
    if (value.winnerId !== playerAId && value.winnerId !== playerBId) {
      ctx.addIssue({
        code: "custom",
        path: ["winnerId"],
        message: "Unbekannter Spieler",
      });
    }
    if (!context.isStaffOrAdmin(value.discussedWithId)) {
      ctx.addIssue({
        code: "custom",
        path: ["discussedWithId"],
        message: "Bitte einen Staff auswählen",
      });
    }
  }
}

// The player report form schema (normal | free_win). Context is injected so it
// stays a pure, testable function.
export function reportSchema(context: ReportContext) {
  return reportUnion.superRefine((value, ctx) =>
    refineReport(value, ctx, context),
  );
}

// The staff result editor schema — adds the staff-only double_loss outcome.
export function staffResultSchema(context: ReportContext) {
  return staffResultUnion.superRefine((value, ctx) =>
    refineReport(value, ctx, context),
  );
}

export type ResultRow = {
  outcome: MatchOutcome;
  winnerId: string | null;
  platform: Platform | null;
  videoUrl: string | null;
  freeWinReason: string | null;
  discussedWithId: string | null;
};

export type GameRow = {
  gameNumber: number;
  winnerId: string;
  replayUrl: string | null;
};

// A team sheet keyed to the player it belongs to. Persisted into `team_sheets`,
// upserted on (matchId, playerId) so a correction keeps the paste URL alive.
export type SheetRow = {
  playerId: string;
  source: SheetInput["source"];
  ots: string;
};

// Maps a validated report to persistence rows. Game winners are already
// absolute (the form picks a player), so the match winner is simply whoever won
// two games. The two sheets are keyed to player A/B by the form and become one
// `team_sheets` row each; outcomes without games carry no sheets at all.
export function toResultRows(
  input: StaffResultInput,
  participants?: { playerAId: string; playerBId: string },
): {
  result: ResultRow;
  games: GameRow[];
  sheets: SheetRow[];
} {
  if (input.outcome === "double_loss") {
    return {
      result: {
        outcome: "double_loss",
        winnerId: null,
        platform: null,
        videoUrl: null,
        freeWinReason: null,
        discussedWithId: null,
      },
      games: [],
      sheets: [],
    };
  }
  if (input.outcome === "free_win") {
    return {
      result: {
        outcome: "free_win",
        winnerId: input.winnerId,
        platform: null,
        videoUrl: null,
        freeWinReason: input.freeWinReason,
        discussedWithId: input.discussedWithId,
      },
      games: [],
      sheets: [],
    };
  }

  const wins = new Map<string, number>();
  for (const game of input.games) {
    wins.set(game.winnerId, (wins.get(game.winnerId) ?? 0) + 1);
  }
  const winnerId =
    [...wins.entries()].find(([, count]) => count >= 2)?.[0] ?? null;
  const games: GameRow[] = input.games.map((game, i) => ({
    gameNumber: i + 1,
    winnerId: game.winnerId,
    // `|| null` also folds an empty optional field to null.
    replayUrl: input.platform === "showdown" ? game.replayUrl || null : null,
  }));
  return {
    result: {
      outcome: "normal",
      winnerId,
      platform: input.platform,
      videoUrl: input.platform === "cartridge" ? input.videoUrl || null : null,
      freeWinReason: null,
      discussedWithId: null,
    },
    games,
    sheets: participants
      ? [
          { playerId: participants.playerAId, ...input.playerASheet },
          { playerId: participants.playerBId, ...input.playerBSheet },
        ]
      : [],
  };
}
