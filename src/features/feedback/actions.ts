"use server";

import { currentUser } from "@/features/roles/guard";
import { currentMatchday } from "@/features/season/dashboard";
import { matchdaysForWindow } from "@/features/season/queries";
import { latestWindow } from "@/features/staff/queries";
import { createForumThread, type DiscordUpload } from "@/lib/discord";
import { germanToday } from "@/lib/german-time";
import { sniffImageType } from "@/lib/image";
import { attachmentFileName, validateAttachments } from "./attachments";
import {
  canSubmit,
  feedbackInputSchema,
  RATE_LIMIT_WINDOW_MS,
  reporterThreadUrl,
  submissionAllowed,
  threadBody,
  threadTitle,
} from "./feedback";
import { insertFeedback, markPosted, recentFeedbackCount } from "./queries";

export type FeedbackActionResult =
  | {
      ok: true;
      threadUrl: string | null;
      // What became of the screenshots. The reporter cannot open the
      // staff-server thread, so the app has to say.
      attachmentCount: number;
      attachmentsPosted: boolean;
    }
  | { ok: false; error: string };

/**
 * Reads the submitted images, identifying each by its magic bytes rather than
 * its declared type: the browser's `type` is just a string, and this forum is
 * read by staff. Returns null when anything fails the gate.
 */
async function readAttachments(
  images: readonly File[],
): Promise<DiscordUpload[] | null> {
  const validated = validateAttachments(
    images.map((image) => ({ size: image.size, type: image.type })),
  );
  if (!validated.ok) {
    return null;
  }

  const uploads: DiscordUpload[] = [];
  for (const [index, image] of images.entries()) {
    const bytes = new Uint8Array(await image.arrayBuffer());
    const sniffed = sniffImageType(bytes);
    if (!sniffed) {
      return null;
    }
    uploads.push({
      name: attachmentFileName(index, sniffed),
      contentType: sniffed,
      bytes,
    });
  }
  return uploads;
}

// Unset → no thread is created and the row is all there is (local dev stays
// silent, like DISCORD_RESULTS_CHANNEL_ID). The forum may sit in any guild
// the bot belongs to; no guild id is configured for it.
function forumChannel(): string | null {
  const id = process.env.DISCORD_FEEDBACK_FORUM_CHANNEL_ID;
  return id && id.length > 0 ? id : null;
}

// Optional forum tag ids. They belong to their forum, so moving the forum to
// another server means new ids here.
function tagFor(kind: "bug" | "idea"): string[] {
  const id =
    kind === "bug"
      ? process.env.DISCORD_FEEDBACK_TAG_BUG
      : process.env.DISCORD_FEEDBACK_TAG_IDEA;
  return id && id.length > 0 ? [id] : [];
}

function buildSha(): string | null {
  const sha = process.env.APP_BUILD_SHA;
  return sha && sha.length > 0 ? sha : null;
}

function mainGuildId(): string | null {
  const id = process.env.DISCORD_GUILD_ID;
  return id && id.length > 0 ? id : null;
}

// Season context the reporter never supplies: which window is live and which
// Spieltag it is in right now.
async function seasonContext(): Promise<{
  windowId: string | null;
  seasonNumber: number | null;
  round: number | null;
}> {
  const window = await latestWindow();
  if (!window) {
    return { windowId: null, seasonNumber: null, round: null };
  }
  const matchdays = await matchdaysForWindow(window.id);
  const round = currentMatchday(matchdays, germanToday())?.round ?? null;
  return {
    windowId: window.id,
    seasonNumber: window.seasonNumber,
    round,
  };
}

/**
 * Files a bug report or (staff+) a feature idea: one row, then one Discord
 * forum thread. The row is written first and is the durable record — a failed
 * Discord call costs the reporter the thread link, never the report.
 */
export async function submitFeedback(
  input: unknown,
  images: readonly File[] = [],
): Promise<FeedbackActionResult> {
  const current = await currentUser();
  if (!current) {
    return { ok: false, error: "Nicht angemeldet" };
  }

  const parsed = feedbackInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Eingabe ungültig",
    };
  }
  const report = parsed.data;

  if (!canSubmit(current.role, report.kind)) {
    return { ok: false, error: "Keine Berechtigung" };
  }

  const recentCount = await recentFeedbackCount(
    current.userId,
    new Date(Date.now() - RATE_LIMIT_WINDOW_MS),
  );
  const allowed = submissionAllowed({ recentCount });
  if (!allowed.ok) {
    return allowed;
  }

  // Before the row: a rejected image should not leave a half-told report
  // behind, and the reporter can fix it and resubmit.
  const uploads = await readAttachments(images);
  if (uploads === null) {
    return {
      ok: false,
      error:
        "Die Bilder konnten nicht angenommen werden. Erlaubt sind bis zu 3 Bilder (PNG, JPEG, WebP, GIF), zusammen maximal 6 MB.",
    };
  }

  const season = await seasonContext();
  const sha = buildSha();

  const id = await insertFeedback({
    kind: report.kind,
    title: report.title,
    body: report.body,
    path: report.path,
    userAgent: report.userAgent,
    buildSha: sha,
    windowId: season.windowId,
    round: season.round,
    reporterId: current.userId,
    reporterRole: current.role,
    attachmentCount: uploads.length,
  });

  // Everything below is best-effort: the report is already safe. The images
  // are not — they live only in the thread, so a failed post loses them, and
  // `attachmentsPosted: false` is what tells the reporter that.
  const failed = {
    ok: true as const,
    threadUrl: null,
    attachmentCount: uploads.length,
    attachmentsPosted: false,
  };

  const channelId = forumChannel();
  if (!channelId) {
    return failed;
  }

  try {
    const created = await createForumThread(channelId, {
      name: threadTitle({ kind: report.kind, title: report.title }),
      content: threadBody({
        body: report.body,
        reporterName: current.displayName ?? current.username ?? "Unbekannt",
        reporterRole: current.role,
        path: report.path,
        userAgent: report.userAgent,
        buildSha: sha,
        round: season.round,
        seasonNumber: season.seasonNumber,
      }),
      appliedTags: tagFor(report.kind),
      files: uploads,
    });
    if (!created.ok) {
      console.error(`[feedback] thread creation failed (${created.status})`);
      return failed;
    }
    await markPosted(id, created);
    return {
      ok: true,
      threadUrl: reporterThreadUrl({
        threadId: created.threadId,
        threadGuildId: created.guildId,
        mainGuildId: mainGuildId(),
      }),
      attachmentCount: uploads.length,
      attachmentsPosted: true,
    };
  } catch (error) {
    console.error("[feedback] thread creation failed", error);
    return failed;
  }
}
