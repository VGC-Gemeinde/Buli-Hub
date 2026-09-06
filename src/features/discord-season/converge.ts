import { subDivisionName } from "@/features/seeding/seeding";
import {
  addMemberRole,
  CHANNEL_TYPE_CATEGORY,
  CHANNEL_TYPE_TEXT,
  createGuildRole,
  createGuildTextChannel,
  fetchBotUserId,
  fetchChannel,
  fetchGuildChannels,
  fetchGuildMembers,
  fetchGuildRoles,
  type GuildChannel,
  putChannelPermissionOverwrite,
  removeMemberRole,
} from "@/lib/discord";
import { type SeasonDiscordConfig, seasonDiscordConfig } from "./config";
import {
  missingOverwrites,
  planGroupResources,
  planMemberRoles,
  type ResourceKind,
  type SeasonGroup,
  type SeasonPlayer,
  type TrackedResource,
} from "./plan";
import {
  listPlacedPlayers,
  listSeasonGroups,
  recordResource,
  saveSyncState,
  trackedResources,
} from "./queries";
import type { SeasonDiscordReport } from "./report";

// Converges the Discord server onto the season: group roles and channels
// exist for every sub-division, every active placed player holds the
// Buli-Spieler role and their group role, nobody else holds them. Reads the
// current state first (a handful of calls), then applies only the
// difference, sequentially, recording each created resource immediately —
// so a run cut short (timeout, outage, rate limit) leaves nothing to undo
// and the next run finishes the rest. Every run stores its report; the
// staff dashboard reads that instead of Discord.
//
// Discord and database access are injected so the orchestration is
// unit-testable with fakes; `syncSeasonDiscord` wires the real ones.

export type SeasonDiscordClient = {
  fetchBotUserId: typeof fetchBotUserId;
  fetchChannel: typeof fetchChannel;
  fetchGuildRoles: typeof fetchGuildRoles;
  fetchGuildChannels: typeof fetchGuildChannels;
  fetchGuildMembers: typeof fetchGuildMembers;
  createGuildRole: typeof createGuildRole;
  createGuildTextChannel: typeof createGuildTextChannel;
  putChannelPermissionOverwrite: typeof putChannelPermissionOverwrite;
  addMemberRole: typeof addMemberRole;
  removeMemberRole: typeof removeMemberRole;
};

export type SeasonDiscordStore = {
  listSeasonGroups: (windowId: string) => Promise<SeasonGroup[]>;
  listPlacedPlayers: (windowId: string) => Promise<SeasonPlayer[]>;
  trackedResources: (windowId: string) => Promise<TrackedResource[]>;
  recordResource: (input: {
    windowId: string;
    subDivisionId: string;
    kind: ResourceKind;
    discordId: string;
  }) => Promise<void>;
  saveSyncState: (
    windowId: string,
    ranAt: Date,
    report: SeasonDiscordReport,
  ) => Promise<void>;
};

export type SeasonDiscordDeps = {
  discord: SeasonDiscordClient;
  store: SeasonDiscordStore;
  config: SeasonDiscordConfig;
  now?: () => Date;
};

export async function runSeasonDiscordSync(
  deps: SeasonDiscordDeps,
  windowId: string,
): Promise<SeasonDiscordReport> {
  const { discord, store, config } = deps;
  const ranAt = (deps.now ?? (() => new Date()))();
  const report: SeasonDiscordReport = {
    groupsReady: 0,
    groupsTotal: 0,
    playersReady: 0,
    playersTotal: 0,
    skipped: [],
    error: null,
  };
  // The first failure is the one worth showing; later ones usually follow.
  const fail = (message: string) => {
    if (report.error === null) {
      report.error = message;
    }
  };

  try {
    const groups = await store.listSeasonGroups(windowId);
    const players = await store.listPlacedPlayers(windowId);
    report.groupsTotal = groups.length;
    report.playersTotal = players.length;
    const groupName = new Map(
      groups.map((g) => [g.subDivisionId, subDivisionName(g.tier, g.position)]),
    );

    // --- Current state -------------------------------------------------
    const category = await discord.fetchChannel(config.categoryId);
    if (!category.ok) {
      fail(`Liga-Kategorie nicht erreichbar (HTTP ${category.status})`);
      return await finish();
    }
    if (
      category.channel.type !== CHANNEL_TYPE_CATEGORY ||
      category.guildId === null
    ) {
      fail("Die konfigurierte Liga-Kategorie ist keine Kategorie");
      return await finish();
    }
    const guildId = category.guildId;

    const bot = await discord.fetchBotUserId();
    if (!bot.ok) {
      fail(`Bot-Identität nicht abrufbar (HTTP ${bot.status})`);
      return await finish();
    }
    const roles = await discord.fetchGuildRoles(guildId);
    if (!roles.ok) {
      fail(`Rollen nicht abrufbar (HTTP ${roles.status})`);
      return await finish();
    }
    const channels = await discord.fetchGuildChannels(guildId);
    if (!channels.ok) {
      fail(`Kanäle nicht abrufbar (HTTP ${channels.status})`);
      return await finish();
    }
    if (!roles.roles.some((role) => role.id === config.buliRoleId)) {
      fail("Die konfigurierte Buli-Spieler-Rolle existiert nicht");
      return await finish();
    }

    // Liveness is guild-wide: a channel a moderator moved out of the
    // category still exists and must not be created twice.
    const textChannels = new Map<string, GuildChannel>(
      channels.channels
        .filter((channel) => channel.type === CHANNEL_TYPE_TEXT)
        .map((channel) => [channel.id, channel]),
    );
    const plans = planGroupResources({
      groups,
      tracked: await store.trackedResources(windowId),
      liveRoleIds: new Set(roles.roles.map((role) => role.id)),
      liveChannelIds: new Set(textChannels.keys()),
    });

    // --- Roles and channels per group ----------------------------------
    const groupRoleIds = new Map<string, string>();
    let resourceFailure = false;
    for (const plan of plans) {
      if (resourceFailure) {
        // A permission problem repeats for every group; stop hammering.
        break;
      }
      const name = groupName.get(plan.subDivisionId) ?? plan.subDivisionId;

      let roleId: string;
      if (plan.role.status === "exists") {
        roleId = plan.role.id;
      } else {
        const created = await discord.createGuildRole(guildId, {
          name: plan.role.name,
          mentionable: true,
        });
        if (!created.ok) {
          fail(
            `Rolle für ${name} konnte nicht angelegt werden (HTTP ${created.status})`,
          );
          resourceFailure = true;
          continue;
        }
        roleId = created.roleId;
        await store.recordResource({
          windowId,
          subDivisionId: plan.subDivisionId,
          kind: "group_role",
          discordId: roleId,
        });
      }
      groupRoleIds.set(plan.subDivisionId, roleId);

      let channel: Pick<GuildChannel, "id" | "permissionOverwrites">;
      if (plan.channel.status === "exists") {
        channel = textChannels.get(plan.channel.id) ?? {
          id: plan.channel.id,
          permissionOverwrites: [],
        };
      } else {
        const created = await discord.createGuildTextChannel(guildId, {
          name: plan.channel.name,
          parentId: config.categoryId,
        });
        if (!created.ok) {
          fail(
            `Kanal für ${name} konnte nicht angelegt werden (HTTP ${created.status})`,
          );
          resourceFailure = true;
          continue;
        }
        channel = { id: created.channelId, permissionOverwrites: [] };
        await store.recordResource({
          windowId,
          subDivisionId: plan.subDivisionId,
          kind: "group_channel",
          discordId: channel.id,
        });
      }

      let overwritesOk = true;
      for (const overwrite of missingOverwrites(channel, {
        guildId,
        botUserId: bot.userId,
        roleId,
      })) {
        const put = await discord.putChannelPermissionOverwrite(
          channel.id,
          overwrite,
        );
        if (!put.ok) {
          fail(
            `Kanalrechte für ${name} konnten nicht gesetzt werden (HTTP ${put.status})`,
          );
          resourceFailure = true;
          overwritesOk = false;
          break;
        }
      }
      if (overwritesOk) {
        report.groupsReady += 1;
      }
    }

    // --- Member roles ----------------------------------------------------
    // Fetched only now: roles and channels do not depend on the member list,
    // so a bot without the Server Members Intent (its 403 lands here) still
    // sets the season up and the report names the one thing left to fix.
    const members = await discord.fetchGuildMembers(guildId);
    if (!members.ok) {
      fail(`Mitgliederliste nicht abrufbar (HTTP ${members.status})`);
      return await finish();
    }
    const memberPlan = planMemberRoles({
      players,
      buliRoleId: config.buliRoleId,
      groupRoleIds,
      members: members.members,
    });
    report.skipped.push(...memberPlan.skipped);

    for (const remove of memberPlan.removes) {
      const result = await discord.removeMemberRole(
        guildId,
        remove.discordId,
        remove.roleId,
      );
      if (!result.ok && result.status !== 404) {
        fail(`Rolle konnte nicht entfernt werden (HTTP ${result.status})`);
        break;
      }
    }

    let memberFailure = false;
    for (const player of memberPlan.players) {
      let ok = true;
      if (memberFailure) {
        // Same as above: a 403 would repeat for every player.
        ok = player.add.length === 0;
      } else {
        for (const roleId of player.add) {
          const result = await discord.addMemberRole(
            guildId,
            player.discordId,
            roleId,
          );
          if (result.ok) {
            continue;
          }
          ok = false;
          if (result.status === 404) {
            report.skipped.push({ name: player.name, reason: "not_on_server" });
          } else {
            report.skipped.push({ name: player.name, reason: "error" });
            fail(
              `Rolle für ${player.name} konnte nicht vergeben werden (HTTP ${result.status})`,
            );
            memberFailure = true;
          }
          break;
        }
      }
      if (ok && !player.blocked) {
        report.playersReady += 1;
      }
    }
    return await finish();
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
    return await finish();
  }

  async function finish(): Promise<SeasonDiscordReport> {
    if (report.error !== null) {
      console.error(`[discord-season] sync for ${windowId}: ${report.error}`);
    }
    await store.saveSyncState(windowId, ranAt, report);
    return report;
  }
}

const realClient: SeasonDiscordClient = {
  fetchBotUserId,
  fetchChannel,
  fetchGuildRoles,
  fetchGuildChannels,
  fetchGuildMembers,
  createGuildRole,
  createGuildTextChannel,
  putChannelPermissionOverwrite,
  addMemberRole,
  removeMemberRole,
};

const realStore: SeasonDiscordStore = {
  listSeasonGroups,
  listPlacedPlayers,
  trackedResources,
  recordResource,
  saveSyncState,
};

// The production entry point: a no-op without configuration, never throws.
// Callers gate on the season phase (only a published schedule has anything
// to mirror); this only mirrors what the placements say.
export async function syncSeasonDiscord(
  windowId: string,
): Promise<SeasonDiscordReport | null> {
  const config = seasonDiscordConfig();
  if (!config) {
    return null;
  }
  try {
    return await runSeasonDiscordSync(
      { discord: realClient, store: realStore, config },
      windowId,
    );
  } catch (error) {
    console.error("[discord-season] syncSeasonDiscord failed", error);
    return null;
  }
}
