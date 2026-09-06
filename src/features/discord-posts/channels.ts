// Which Discord channel a post belongs to (docs/plans/discord-result-channels.md).
// The league runs three channels: results of Division 1 and 2, results of
// every other division, and the Match-of-the-Week announcements. Routing is
// by the match's division tier and nothing else.

// Divisions with tier <= this post into the top results channel.
export const TOP_RESULT_TIERS = 2;

export type ResultChannels = {
  topResults: string;
  otherResults: string;
  motw: string;
};

const ENV_NAMES = {
  topResults: "DISCORD_RESULTS_TOP_CHANNEL_ID",
  otherResults: "DISCORD_RESULTS_CHANNEL_ID",
  motw: "DISCORD_MOTW_CHANNEL_ID",
} as const;

export function resultChannelFor(
  tier: number,
  channels: ResultChannels,
): string {
  return tier <= TOP_RESULT_TIERS ? channels.topResults : channels.otherResults;
}

// The three channel ids from the environment. None set → null (local dev,
// every entry point is a silent no-op). All three set → the config; the ids
// may be identical (staging points everything at one test channel). Anything
// in between is a misconfiguration: logged, then treated as unset, so a
// half-configured service posts nothing rather than everything into one
// channel.
export function resultChannels(
  env: Record<string, string | undefined> = process.env,
): ResultChannels | null {
  const values = {
    topResults: env[ENV_NAMES.topResults] || undefined,
    otherResults: env[ENV_NAMES.otherResults] || undefined,
    motw: env[ENV_NAMES.motw] || undefined,
  };
  const missing = (Object.keys(values) as (keyof ResultChannels)[]).filter(
    (key) => values[key] === undefined,
  );
  if (missing.length === 3) {
    return null;
  }
  if (missing.length > 0) {
    console.error(
      `[discord-posts] ${missing.map((key) => ENV_NAMES[key]).join(", ")} not set; all three result channel ids are required together, posting skipped`,
    );
    return null;
  }
  return values as ResultChannels;
}
