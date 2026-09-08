import { droppedIdsForSubDivision } from "@/features/drops/queries";
import { motwByMatchId } from "@/features/motw/queries";
import { isHeld } from "@/features/recordings/queries";
import {
  getMatchForReport,
  getMatchResult,
} from "@/features/reporting/queries";
import { pasteUrl } from "@/features/teamsheets/paths";
import {
  deleteChannelMessage,
  editChannelMessage,
  postChannelMessage,
} from "@/lib/discord";
import { resultChannelFor, resultChannels } from "./channels";
import { motwVodMessage, resultMessage, shouldPostResult } from "./messages";
import { deletePostRow, getPost, type PostKind, upsertPost } from "./queries";

// Best-effort convergence of the Discord result channels onto the hub's
// public state: one message per match and kind — posted, edited, moved, or
// deleted so the channels always match what the hub shows openly. Which
// channel a post belongs to is `channels.ts` (by division tier; the MotW
// announcements have their own). Called by the reporting/MotW actions after
// their DB write; every entry point catches and logs, a Discord outage never
// fails an action. Without the channel ids nothing is posted at all (local
// dev stays silent); without APP_BASE_URL posts simply carry no hub link.

// The public paste for a player's sheet, absolute. Null when the sheet is
// missing (free win) or APP_BASE_URL is unset — the message then omits the
// team block rather than posting a dead relative link.
function teamSheetUrl(
  result: { sheets: { playerId: string; id: string }[] },
  playerId: string,
): string | null {
  const sheet = result.sheets.find((row) => row.playerId === playerId);
  return sheet ? pasteUrl(sheet.id) : null;
}

function matchUrl(matchId: string): string | null {
  const base = process.env.APP_BASE_URL;
  return base && base.length > 0
    ? `${base.replace(/\/+$/, "")}/match/${matchId}`
    : null;
}

// Post, edit, or re-post so the stored message shows `content` in
// `channelId`. Re-posts on a 404 (the message was deleted on Discord) and
// when the stored message sits in another channel (the routing changed,
// or the post landed in the wrong channel): a post in the wrong channel is
// a mismatch like any other, so it is deleted there and posted afresh.
async function putMessage(
  kind: PostKind,
  matchId: string,
  channelId: string,
  content: string,
): Promise<void> {
  const post = await getPost(kind, matchId);
  if (post && post.channelId !== channelId) {
    const deleted = await deleteChannelMessage(post.channelId, post.messageId);
    if (!deleted.ok && deleted.status !== 404) {
      console.error(
        `[discord-posts] move failed (${deleted.status}) for ${kind}/${matchId}`,
      );
      return;
    }
    // Fall through to a fresh post; upsertPost re-points the row.
  } else if (post) {
    const edited = await editChannelMessage(
      post.channelId,
      post.messageId,
      content,
    );
    if (edited.ok) {
      return;
    }
    if (edited.status !== 404) {
      console.error(
        `[discord-posts] edit failed (${edited.status}) for ${kind}/${matchId}`,
      );
      return;
    }
    // 404 → fall through to a fresh post in the configured channel.
  }
  const created = await postChannelMessage(channelId, content);
  if (!created.ok) {
    console.error(
      `[discord-posts] post failed (${created.status}) for ${kind}/${matchId}`,
    );
    return;
  }
  await upsertPost({ kind, matchId, channelId, messageId: created.messageId });
}

// Deletes the stored message (best-effort; a 404 just means it is already
// gone) and its row.
async function dropMessage(kind: PostKind, matchId: string): Promise<void> {
  const post = await getPost(kind, matchId);
  if (!post) {
    return;
  }
  const deleted = await deleteChannelMessage(post.channelId, post.messageId);
  if (!deleted.ok && deleted.status !== 404) {
    console.error(
      `[discord-posts] delete failed (${deleted.status}) for ${kind}/${matchId}`,
    );
    return;
  }
  await deletePostRow(kind, matchId);
}

// Converges the result post of a match: posted while the hub shows a public
// result (for the Match of the Week: once its VOD is live; for a match held
// for a recording: once staff release it), deleted otherwise.
export async function syncResultPost(matchId: string): Promise<void> {
  try {
    const channels = resultChannels();
    if (!channels) {
      return;
    }
    const match = await getMatchForReport(matchId);
    if (!match || !match.playerB) {
      return;
    }
    const [result, motw, held, droppedIds] = await Promise.all([
      getMatchResult(matchId),
      motwByMatchId(matchId),
      isHeld(matchId),
      droppedIdsForSubDivision(match.subDivisionId),
    ]);

    const hasDroppedParticipant =
      droppedIds.has(match.playerA.userId) ||
      droppedIds.has(match.playerB.userId);
    if (
      !shouldPostResult({
        motw,
        held,
        hasDroppedParticipant,
        result,
      })
    ) {
      await dropMessage("result", matchId);
      return;
    }
    if (!result) {
      return; // unreachable after shouldPostResult, but keeps types narrow
    }

    const winnerName =
      result.winnerId === match.playerA.userId
        ? match.playerA.name
        : result.winnerId === match.playerB.userId
          ? match.playerB.name
          : null;
    const content = resultMessage({
      groupName: match.groupName,
      round: match.round,
      playerAName: match.playerA.name,
      playerBName: match.playerB.name,
      outcome: result.outcome,
      winnerName,
      scoreA: result.games.filter((g) => g.winnerId === match.playerA.userId)
        .length,
      scoreB: result.games.filter((g) => g.winnerId === match.playerB?.userId)
        .length,
      platform: result.platform,
      playerATeamUrl: teamSheetUrl(result, match.playerA.userId),
      playerBTeamUrl: teamSheetUrl(result, match.playerB.userId),
      videoUrl: result.videoUrl,
      replayUrls: result.games
        .map((g) => g.replayUrl)
        .filter((url): url is string => url !== null && url !== undefined),
      corrected: result.correctedAt !== null,
      matchUrl: matchUrl(matchId),
      isMotw: motw !== null,
    });
    await putMessage(
      "result",
      matchId,
      resultChannelFor(match.tier, channels),
      content,
    );
  } catch (error) {
    console.error("[discord-posts] syncResultPost failed", error);
  }
}

// Converges the Match-of-the-Week VOD announcement: posted while the match
// is the featured pick *and* has a YouTube link, deleted otherwise. Never
// contains the result.
export async function syncMotwVodPost(matchId: string): Promise<void> {
  try {
    const channels = resultChannels();
    if (!channels) {
      return;
    }
    const match = await getMatchForReport(matchId);
    if (!match || !match.playerB) {
      return;
    }
    const selection = await motwByMatchId(matchId);

    if (!selection?.youtubeUrl) {
      await dropMessage("motw_vod", matchId);
      return;
    }
    const content = motwVodMessage({
      round: selection.round,
      playerAName: match.playerA.name,
      playerBName: match.playerB.name,
      youtubeUrl: selection.youtubeUrl,
      matchUrl: matchUrl(matchId),
    });
    await putMessage("motw_vod", matchId, channels.motw, content);
  } catch (error) {
    console.error("[discord-posts] syncMotwVodPost failed", error);
  }
}
