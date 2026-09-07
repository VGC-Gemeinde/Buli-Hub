// Pure composition of the Discord results-channel messages — the historical
// community format with hub vocabulary (docs/plans/discord-result-posts.md).
// Scores and outcomes sit behind Discord spoiler tags; both names are always
// bold (bolding only the winner would leak through the spoiler).
//
// Link previews: a URL in angle brackets gets no embed. Every link is wrapped
// that way — team sheets, replays, the hub link — except the two videos,
// whose preview *is* the point: the Match-of-the-Week VOD and a Cartridge
// match video (usually a YouTube link as well).
const noPreview = (url: string): string => `<${url}>`;

export type MatchOutcome = "normal" | "free_win" | "double_loss";

export type ResultMessageInput = {
  groupName: string; // "Division 1a"
  round: number;
  playerAName: string;
  playerBName: string;
  outcome: MatchOutcome;
  // Free win only: whose walkover it is (inside the spoiler).
  winnerName: string | null;
  // Normal only: games won per player.
  scoreA: number;
  scoreB: number;
  platform: "showdown" | "cartridge" | null;
  playerATeamUrl: string | null;
  playerBTeamUrl: string | null;
  videoUrl: string | null;
  // Ordered game replays (Showdown). The rendered Game-3 line always exists:
  // it repeats game 2's replay as a decoy when the series ended 2-0, so the
  // message shape never reveals the split.
  replayUrls: string[];
  corrected: boolean;
  // Absolute hub link, or null when APP_BASE_URL is not configured.
  matchUrl: string | null;
  // The Match of the Week's result post lands only once its VOD is live,
  // typically days after the Spieltag — the header says why it is late.
  isMotw: boolean;
};

function scoreLine(input: ResultMessageInput): string {
  const a = `**${input.playerAName}**`;
  const b = `**${input.playerBName}**`;
  if (input.outcome === "double_loss") {
    return `${a}  ||Doppelniederlage||  ${b}`;
  }
  if (input.outcome === "free_win") {
    return `${a}  ||Freewin für ${input.winnerName ?? "—"}||  ${b}`;
  }
  return `${a}  ||${input.scoreA} - ${input.scoreB}||  ${b}`;
}

export function resultMessage(input: ResultMessageInput): string {
  const header = `VGC Bundesliga · ${input.groupName} · Spieltag ${input.round}`;
  const blocks: string[] = [
    `__**${input.isMotw ? `${header} · Match of the Week` : header}**__`,
    scoreLine(input),
  ];

  if (input.outcome === "normal") {
    if (input.playerATeamUrl && input.playerBTeamUrl) {
      blocks.push(
        `Team von ${input.playerAName}: ${noPreview(input.playerATeamUrl)}\n` +
          `Team von ${input.playerBName}: ${noPreview(input.playerBTeamUrl)}`,
      );
    }
    const [game1, game2, game3] = input.replayUrls;
    if (input.platform === "showdown" && game1 && game2) {
      blocks.push(
        `Game 1: *${noPreview(game1)}*\n` +
          `Game 2: *${noPreview(game2)}*\n` +
          `Game 3: ||*${noPreview(game3 ?? game2)}*||`,
      );
    }
    if (input.platform === "cartridge" && input.videoUrl) {
      // Unwrapped on purpose: the video preview is wanted here.
      blocks.push(`Video: *${input.videoUrl}*`);
    }
  }

  if (input.matchUrl) {
    blocks.push(`Zum Match: ${noPreview(input.matchUrl)}`);
  }
  if (input.corrected) {
    blocks.push("*(korrigiert)*");
  }
  return blocks.join("\n\n");
}

export function motwVodMessage(input: {
  round: number;
  playerAName: string;
  playerBName: string;
  youtubeUrl: string;
  matchUrl: string | null;
}): string {
  const blocks: string[] = [
    `__**VGC Bundesliga · Match of the Week · Spieltag ${input.round}**__`,
    // The YouTube URL stays unwrapped on purpose: its embed preview is the
    // announcement. The result is never part of this message.
    `**${input.playerAName}** vs. **${input.playerBName}**: das VOD ist da!\n${input.youtubeUrl}`,
  ];
  if (input.matchUrl) {
    blocks.push(`Zum Match: ${noPreview(input.matchUrl)}`);
  }
  return blocks.join("\n\n");
}

// Whether the results channel should carry a result post for a match — the
// converge decision. "No" for unreported matches, results the hub itself
// still hides (pending free wins), the Match of the Week while its result is
// under embargo (no VOD yet; once the link is attached the result is public
// and posted like any other), and drop-decided matches (drop free wins get
// no messages; existing posts of played matches stay as historical records
// until the match is touched again).
export function shouldPostResult(input: {
  // The match's MotW selection, null when it is not the featured match.
  motw: { youtubeUrl: string | null } | null;
  hasDroppedParticipant: boolean;
  result: { outcome: MatchOutcome; confirmedAt: Date | null } | null;
}): boolean {
  if (input.motw !== null && input.motw.youtubeUrl === null) {
    return false;
  }
  if (input.hasDroppedParticipant || input.result === null) {
    return false;
  }
  if (
    input.result.outcome === "free_win" &&
    input.result.confirmedAt === null
  ) {
    return false;
  }
  return true;
}
