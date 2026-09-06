import { subDivisionName } from "@/features/seeding/seeding";
import type { ChannelOverwrite } from "@/lib/discord";

// Display names for the per-season Discord objects. Set once at creation and
// never enforced afterwards: the hub tracks roles and channels by id, so
// moderators may rename freely.

// "Division 1a" — the group's hub name, as a mentionable role.
export function groupRoleName(tier: number, position: number): string {
  return subDivisionName(tier, position);
}

// "division-1a" — Discord lowercases text channel names and replaces spaces.
export function groupChannelName(tier: number, position: number): string {
  return subDivisionName(tier, position).toLowerCase().replace(/\s+/g, "-");
}

// Discord permission bit for View Channel (1 << 10), as the decimal string
// the API uses for bitfields.
export const VIEW_CHANNEL = BigInt(1024);

const OVERWRITE_TYPE_ROLE = 0;
const OVERWRITE_TYPE_MEMBER = 1;

// Everyone is denied View Channel on the channel itself: the league category
// also holds public channels, so privacy is the channel's own business. The
// @everyone role's id is the guild id.
export function everyoneDenyOverwrite(guildId: string): ChannelOverwrite {
  return {
    id: guildId,
    type: OVERWRITE_TYPE_ROLE,
    allow: "0",
    deny: VIEW_CHANNEL.toString(),
  };
}

// The group role may view its channel. Nothing else is granted — sending is
// allowed by default once a member can see a channel.
export function groupRoleAllowOverwrite(roleId: string): ChannelOverwrite {
  return {
    id: roleId,
    type: OVERWRITE_TYPE_ROLE,
    allow: VIEW_CHANNEL.toString(),
    deny: "0",
  };
}

// The bot keeps seeing (and managing) the channel after @everyone is denied,
// without depending on a category overwrite for its role. Applied before
// the deny, so the bot never locks itself out mid-way.
export function botAllowOverwrite(botUserId: string): ChannelOverwrite {
  return {
    id: botUserId,
    type: OVERWRITE_TYPE_MEMBER,
    allow: VIEW_CHANNEL.toString(),
    deny: "0",
  };
}

// Whether an overwrite grants (or denies) View Channel.
export function allowsView(overwrite: ChannelOverwrite): boolean {
  return (BigInt(overwrite.allow) & VIEW_CHANNEL) !== BigInt(0);
}

export function deniesView(overwrite: ChannelOverwrite): boolean {
  return (BigInt(overwrite.deny) & VIEW_CHANNEL) !== BigInt(0);
}
