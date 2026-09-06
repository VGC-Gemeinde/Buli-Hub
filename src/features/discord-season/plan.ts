import type {
  ChannelOverwrite,
  GuildChannel,
  GuildMemberRoles,
} from "@/lib/discord";
import {
  allowsView,
  botAllowOverwrite,
  deniesView,
  everyoneDenyOverwrite,
  groupChannelName,
  groupRoleAllowOverwrite,
  groupRoleName,
} from "./naming";
import type { SkipReason } from "./report";

// The pure core of the Discord season sync: given the season's desired state
// and what Discord currently holds, what has to change. The converge
// (`converge.ts`) executes the answer; nothing here talks to anything.

export type ResourceKind = "group_role" | "group_channel";

export type SeasonGroup = {
  subDivisionId: string;
  tier: number;
  position: number;
};

// An active placed player (not dropped, in a sub-division).
export type SeasonPlayer = {
  userId: string;
  name: string;
  discordId: string | null;
  subDivisionId: string;
};

export type TrackedResource = {
  subDivisionId: string;
  kind: ResourceKind;
  discordId: string;
};

// Per group: the role and channel either exist on Discord (tracked id that
// is still live) or must be created — including tracked ids whose object
// disappeared, which the converge then replaces in the table.
export type ResourceState =
  | { status: "exists"; id: string }
  | { status: "create"; name: string };

export type GroupResourcePlan = {
  subDivisionId: string;
  role: ResourceState;
  channel: ResourceState;
};

export function planGroupResources(input: {
  groups: readonly SeasonGroup[];
  tracked: readonly TrackedResource[];
  // Ids that exist on Discord right now.
  liveRoleIds: ReadonlySet<string>;
  liveChannelIds: ReadonlySet<string>;
}): GroupResourcePlan[] {
  const trackedId = (subDivisionId: string, kind: ResourceKind) =>
    input.tracked.find(
      (row) => row.subDivisionId === subDivisionId && row.kind === kind,
    )?.discordId ?? null;

  return input.groups.map((group) => {
    const roleId = trackedId(group.subDivisionId, "group_role");
    const channelId = trackedId(group.subDivisionId, "group_channel");
    return {
      subDivisionId: group.subDivisionId,
      role:
        roleId !== null && input.liveRoleIds.has(roleId)
          ? { status: "exists", id: roleId }
          : {
              status: "create",
              name: groupRoleName(group.tier, group.position),
            },
      channel:
        channelId !== null && input.liveChannelIds.has(channelId)
          ? { status: "exists", id: channelId }
          : {
              status: "create",
              name: groupChannelName(group.tier, group.position),
            },
    };
  });
}

// The overwrites a group channel must carry, in the order they are applied:
// the bot's own view first (so it never locks itself out), then the group
// role's view, then the @everyone deny. Returns only what is missing on the
// channel, so a converged channel costs no calls. Only the View Channel bit
// is checked: moderators may add other permissions to the same overwrites.
export function missingOverwrites(
  channel: Pick<GuildChannel, "permissionOverwrites">,
  ids: { guildId: string; botUserId: string; roleId: string },
): ChannelOverwrite[] {
  const byId = new Map(
    channel.permissionOverwrites.map((overwrite) => [overwrite.id, overwrite]),
  );
  const missing: ChannelOverwrite[] = [];
  const bot = byId.get(ids.botUserId);
  if (!bot || !allowsView(bot)) {
    missing.push(botAllowOverwrite(ids.botUserId));
  }
  const role = byId.get(ids.roleId);
  if (!role || !allowsView(role)) {
    missing.push(groupRoleAllowOverwrite(ids.roleId));
  }
  const everyone = byId.get(ids.guildId);
  if (!everyone || !deniesView(everyone)) {
    missing.push(everyoneDenyOverwrite(ids.guildId));
  }
  return missing;
}

export type PlayerRolePlan = {
  userId: string;
  name: string;
  discordId: string;
  // Hub roles the member must gain. Empty = already converged.
  add: string[];
  // True when the player's group has no live role yet (its creation failed):
  // the player cannot become ready in this run, whatever `add` achieves.
  blocked: boolean;
};

export type MemberRolePlan = {
  players: PlayerRolePlan[];
  // Hub roles held by members who must not have them: former players, dropped
  // players, a hand-assigned Buli-Spieler role. Removed on every run.
  removes: { discordId: string; roleId: string }[];
  skipped: { name: string; reason: SkipReason }[];
};

export function planMemberRoles(input: {
  players: readonly SeasonPlayer[];
  buliRoleId: string;
  // Live group role per sub-division; absent when the role does not exist.
  groupRoleIds: ReadonlyMap<string, string>;
  members: readonly GuildMemberRoles[];
}): MemberRolePlan {
  const hubRoleIds = new Set<string>([
    input.buliRoleId,
    ...input.groupRoleIds.values(),
  ]);
  const membersById = new Map(input.members.map((m) => [m.id, m]));

  // Desired hub roles per Discord id — exactly the active placed players.
  const desired = new Map<string, Set<string>>();
  const players: PlayerRolePlan[] = [];
  const skipped: MemberRolePlan["skipped"] = [];
  for (const player of input.players) {
    if (player.discordId === null) {
      skipped.push({ name: player.name, reason: "no_discord_id" });
      continue;
    }
    const member = membersById.get(player.discordId);
    if (!member) {
      skipped.push({ name: player.name, reason: "not_on_server" });
      continue;
    }
    const groupRoleId = input.groupRoleIds.get(player.subDivisionId) ?? null;
    const wanted = new Set<string>([input.buliRoleId]);
    if (groupRoleId !== null) {
      wanted.add(groupRoleId);
    }
    desired.set(player.discordId, wanted);
    const held = new Set(member.roles);
    players.push({
      userId: player.userId,
      name: player.name,
      discordId: player.discordId,
      add: [...wanted].filter((roleId) => !held.has(roleId)),
      blocked: groupRoleId === null,
    });
  }

  const removes: MemberRolePlan["removes"] = [];
  for (const member of input.members) {
    const wanted = desired.get(member.id);
    for (const roleId of member.roles) {
      if (hubRoleIds.has(roleId) && !(wanted?.has(roleId) ?? false)) {
        removes.push({ discordId: member.id, roleId });
      }
    }
  }

  return { players, removes, skipped };
}
