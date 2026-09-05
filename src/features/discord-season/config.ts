// Env for the Discord season setup (docs/plans/discord-season-setup.md). The
// guild is resolved from the category at sync time, so no guild id here —
// local and staging point both ids at the test server, production at the
// real one.
export type SeasonDiscordConfig = {
  // The permanent league category every group channel is created in.
  categoryId: string;
  // The permanent Buli-Spieler (ping) role.
  buliRoleId: string;
};

// Null when unconfigured (local dev, a service without the feature): every
// entry point is then a silent no-op. One of the two set without the other
// is a misconfiguration and is logged, then treated the same.
export function seasonDiscordConfig(): SeasonDiscordConfig | null {
  const categoryId = process.env.DISCORD_LEAGUE_CATEGORY_ID;
  const buliRoleId = process.env.DISCORD_ROLE_ID_BULI_PLAYER;
  if (!categoryId && !buliRoleId) {
    return null;
  }
  if (!categoryId || !buliRoleId) {
    console.error(
      "[discord-season] DISCORD_LEAGUE_CATEGORY_ID and DISCORD_ROLE_ID_BULI_PLAYER must be set together; season setup skipped",
    );
    return null;
  }
  return { categoryId, buliRoleId };
}
