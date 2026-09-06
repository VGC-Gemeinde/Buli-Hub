// Discord REST API client (server-only — the bot token must never reach
// client code). No bot process: the backend calls the API directly.

const API_BASE = "https://discord.com/api/v10";
const CDN_BASE = "https://cdn.discordapp.com";

export type GuildMember = {
  roles: string[];
  // Server-specific nickname, null if the member has none.
  nick: string | null;
  // Server-specific avatar hash, null if the member uses their global one.
  avatar: string | null;
  user: {
    id: string;
    username: string;
    globalName: string | null;
    avatar: string | null;
  };
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function avatarExt(hash: string): string {
  return hash.startsWith("a_") ? "gif" : "png";
}

// Resolves the avatar URL, preferring the guild-specific avatar over the
// global one. Returns null when the user has neither (→ initials fallback).
export function memberAvatarUrl(
  guildId: string,
  member: GuildMember,
): string | null {
  if (member.avatar) {
    return `${CDN_BASE}/guilds/${guildId}/users/${member.user.id}/avatars/${member.avatar}.${avatarExt(member.avatar)}`;
  }
  if (member.user.avatar) {
    return `${CDN_BASE}/avatars/${member.user.id}/${member.user.avatar}.${avatarExt(member.user.avatar)}`;
  }
  return null;
}

function botToken(): string {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    throw new Error("DISCORD_BOT_TOKEN is not set (see .env.example)");
  }
  return token;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

// Longest a single call waits out a rate limit before giving up. Discord
// answers a 429 with `retry_after` in seconds; the season sync's member role
// calls are the only place bursts happen, and they stay in the low seconds.
const MAX_RATE_LIMIT_WAIT_MS = 15_000;

// One authenticated call against the API, retried once after a 429 (waiting
// out `retry_after`, bounded). Every other status is the caller's to judge.
async function apiFetch(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<Response> {
  const { json, ...rest } = init;
  const headers: Record<string, string> = {
    Authorization: `Bot ${botToken()}`,
    ...(rest.headers as Record<string, string> | undefined),
  };
  let body = rest.body;
  if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  }
  const send = () => fetch(`${API_BASE}${path}`, { ...rest, headers, body });

  const first = await send();
  if (first.status !== 429) {
    return first;
  }
  const retryAfterMs = await rateLimitWaitMs(first);
  if (retryAfterMs === null || retryAfterMs > MAX_RATE_LIMIT_WAIT_MS) {
    return first;
  }
  await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
  return send();
}

async function rateLimitWaitMs(response: Response): Promise<number | null> {
  try {
    const body = (await response.json()) as { retry_after?: unknown };
    if (typeof body.retry_after === "number") {
      return Math.ceil(body.retry_after * 1000);
    }
  } catch {
    // No JSON body — fall back to the header.
  }
  const header = Number(response.headers.get("Retry-After"));
  return Number.isFinite(header) && header > 0 ? header * 1000 : null;
}

// Non-2xx responses are returned as typed outcomes (the caller decides —
// e.g. a 404 on edit means the message was deleted on Discord and can be
// re-posted); network failures still throw.
export type DiscordCallResult = { ok: true } | { ok: false; status: number };

// Posts a plain-content message; returns its id so later edits/deletes can
// target it. Mentions are never resolved — a player name containing
// @everyone must not ping the server.
export async function postChannelMessage(
  channelId: string,
  content: string,
): Promise<{ ok: true; messageId: string } | { ok: false; status: number }> {
  const response = await fetch(`${API_BASE}/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${botToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
  });
  if (!response.ok) {
    return { ok: false, status: response.status };
  }
  const message = (await response.json()) as { id?: unknown };
  const messageId = asString(message.id);
  return messageId ? { ok: true, messageId } : { ok: false, status: 500 };
}

// Opens a forum post: a thread plus its first message, in one call. The
// channel may live in *any* guild the bot is a member of — the API addresses
// it by channel id alone — so the returned thread's `guild_id` is reported
// back rather than assumed from configuration.
export type DiscordUpload = {
  name: string;
  contentType: string;
  bytes: Uint8Array;
};

export async function createForumThread(
  channelId: string,
  thread: {
    name: string;
    content: string;
    appliedTags?: string[];
    files?: readonly DiscordUpload[];
  },
): Promise<
  | { ok: true; threadId: string; guildId: string | null }
  | { ok: false; status: number }
> {
  const payload = {
    name: thread.name,
    ...(thread.appliedTags && thread.appliedTags.length > 0
      ? { applied_tags: thread.appliedTags }
      : {}),
    message: {
      content: thread.content,
      allowed_mentions: { parse: [] },
      ...(thread.files && thread.files.length > 0
        ? {
            attachments: thread.files.map((file, index) => ({
              id: index,
              filename: file.name,
            })),
          }
        : {}),
    },
  };

  // With files this has to be multipart: `payload_json` plus one `files[n]`
  // part per upload, whose index matches the attachment id above. Without
  // files, plain JSON — the common case stays as simple as it was.
  let body: BodyInit;
  const headers: Record<string, string> = {
    Authorization: `Bot ${botToken()}`,
  };
  if (thread.files && thread.files.length > 0) {
    const form = new FormData();
    form.append("payload_json", JSON.stringify(payload));
    thread.files.forEach((file, index) => {
      form.append(
        `files[${index}]`,
        // Copy into a fresh ArrayBuffer: a Uint8Array view may sit on a larger
        // pooled buffer, and Blob would otherwise take the whole thing.
        new Blob([file.bytes.slice().buffer as ArrayBuffer], {
          type: file.contentType,
        }),
        file.name,
      );
    });
    body = form;
    // Deliberately no Content-Type — fetch must set the multipart boundary.
  } else {
    body = JSON.stringify(payload);
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${API_BASE}/channels/${channelId}/threads`, {
    method: "POST",
    headers,
    body,
  });
  if (!response.ok) {
    return { ok: false, status: response.status };
  }
  const created = (await response.json()) as {
    id?: unknown;
    guild_id?: unknown;
  };
  const threadId = asString(created.id);
  return threadId
    ? { ok: true, threadId, guildId: asString(created.guild_id) }
    : { ok: false, status: 500 };
}

export async function editChannelMessage(
  channelId: string,
  messageId: string,
  content: string,
): Promise<DiscordCallResult> {
  const response = await fetch(
    `${API_BASE}/channels/${channelId}/messages/${messageId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bot ${botToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
    },
  );
  return response.ok ? { ok: true } : { ok: false, status: response.status };
}

export async function deleteChannelMessage(
  channelId: string,
  messageId: string,
): Promise<DiscordCallResult> {
  const response = await fetch(
    `${API_BASE}/channels/${channelId}/messages/${messageId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bot ${botToken()}` },
    },
  );
  return response.ok ? { ok: true } : { ok: false, status: response.status };
}

export type GuildMemberRoles = { id: string; roles: string[] };

/**
 * Fetches every guild member with their role ids, via the paginated members
 * list. Unlike the single-member lookup below this requires the privileged
 * Server Members Intent on the bot. The whole list is fetched before
 * anything is returned; any non-2xx page — notably the 403 of a bot without
 * the intent — is a typed failure, so callers never see a partial list.
 */
export async function fetchGuildMembers(
  guildId: string,
): Promise<
  { ok: true; members: GuildMemberRoles[] } | { ok: false; status: number }
> {
  const members: GuildMemberRoles[] = [];
  let after = "0";
  for (;;) {
    const response = await apiFetch(
      `/guilds/${guildId}/members?limit=1000&after=${after}`,
      { cache: "no-store" },
    );
    if (!response.ok) {
      return { ok: false, status: response.status };
    }
    const page = (await response.json()) as {
      user?: { id?: unknown };
      roles?: unknown;
    }[];
    if (!Array.isArray(page) || page.length === 0) {
      return { ok: true, members };
    }
    let last: string | null = null;
    for (const member of page) {
      const id = asString(member.user?.id);
      if (id) {
        members.push({ id, roles: stringArray(member.roles) });
        // Pages are sorted ascending by user id, so the last id is the cursor.
        last = id;
      }
    }
    if (page.length < 1000 || last === null) {
      return { ok: true, members };
    }
    after = last;
  }
}

/**
 * The Discord user ids of every guild member. Throws on any non-2xx so
 * callers fail open and never treat a missing list as "everyone left".
 */
export async function fetchGuildMemberIds(
  guildId: string,
): Promise<Set<string>> {
  const result = await fetchGuildMembers(guildId);
  if (!result.ok) {
    throw new Error(`Discord API ${result.status} on guild members list`);
  }
  return new Set(result.members.map((member) => member.id));
}

/**
 * Fetches a guild member by Discord user id.
 * Returns null when the user is not a member of the guild.
 */
export async function fetchGuildMember(
  guildId: string,
  discordUserId: string,
): Promise<GuildMember | null> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    throw new Error("DISCORD_BOT_TOKEN is not set (see .env.example)");
  }

  const response = await fetch(
    `${API_BASE}/guilds/${guildId}/members/${discordUserId}`,
    {
      headers: { Authorization: `Bot ${token}` },
      cache: "no-store",
    },
  );

  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Discord API ${response.status}: ${await response.text()}`);
  }

  const member = (await response.json()) as {
    roles?: unknown;
    nick?: unknown;
    avatar?: unknown;
    user?: {
      id?: unknown;
      username?: unknown;
      global_name?: unknown;
      avatar?: unknown;
    };
  };

  return {
    roles: Array.isArray(member.roles)
      ? member.roles.filter((role): role is string => typeof role === "string")
      : [],
    nick: asString(member.nick),
    avatar: asString(member.avatar),
    user: {
      id: asString(member.user?.id) ?? "",
      username: asString(member.user?.username) ?? "",
      globalName: asString(member.user?.global_name),
      avatar: asString(member.user?.avatar),
    },
  };
}

// --- Season setup: roles, channels, permission overwrites -------------------
// Thin wrappers for docs/plans/discord-season-setup.md. Non-2xx is a typed
// outcome; the converge decides what a 403 (missing bot permission) or a 404
// (member left, role deleted) means.

// Channel types the season setup cares about.
export const CHANNEL_TYPE_TEXT = 0;
export const CHANNEL_TYPE_CATEGORY = 4;

export type ChannelOverwrite = {
  id: string;
  // 0 = role, 1 = member.
  type: number;
  // Permission bitfields, as decimal strings (Discord's wire format).
  allow: string;
  deny: string;
};

export type GuildChannel = {
  id: string;
  type: number;
  parentId: string | null;
  permissionOverwrites: ChannelOverwrite[];
};

function readOverwrites(value: unknown): ChannelOverwrite[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const overwrites: ChannelOverwrite[] = [];
  for (const raw of value as {
    id?: unknown;
    type?: unknown;
    allow?: unknown;
    deny?: unknown;
  }[]) {
    const id = asString(raw.id);
    if (id && typeof raw.type === "number") {
      overwrites.push({
        id,
        type: raw.type,
        allow: asString(raw.allow) ?? "0",
        deny: asString(raw.deny) ?? "0",
      });
    }
  }
  return overwrites;
}

function readChannel(raw: {
  id?: unknown;
  type?: unknown;
  parent_id?: unknown;
  permission_overwrites?: unknown;
}): GuildChannel | null {
  const id = asString(raw.id);
  if (!id || typeof raw.type !== "number") {
    return null;
  }
  return {
    id,
    type: raw.type,
    parentId: asString(raw.parent_id),
    permissionOverwrites: readOverwrites(raw.permission_overwrites),
  };
}

// The bot's own user id — the season setup grants itself an explicit view
// overwrite on every group channel, so denying @everyone cannot lock it out.
export async function fetchBotUserId(): Promise<
  { ok: true; userId: string } | { ok: false; status: number }
> {
  const response = await apiFetch("/users/@me", { cache: "no-store" });
  if (!response.ok) {
    return { ok: false, status: response.status };
  }
  const user = (await response.json()) as { id?: unknown };
  const userId = asString(user.id);
  return userId ? { ok: true, userId } : { ok: false, status: 500 };
}

// A single channel with the guild it belongs to — how the season setup
// resolves its guild from the configured category id.
export async function fetchChannel(
  channelId: string,
): Promise<
  | { ok: true; channel: GuildChannel; guildId: string | null }
  | { ok: false; status: number }
> {
  const response = await apiFetch(`/channels/${channelId}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    return { ok: false, status: response.status };
  }
  const raw = (await response.json()) as Parameters<typeof readChannel>[0] & {
    guild_id?: unknown;
  };
  const channel = readChannel(raw);
  return channel
    ? { ok: true, channel, guildId: asString(raw.guild_id) }
    : { ok: false, status: 500 };
}

export async function fetchGuildRoles(
  guildId: string,
): Promise<
  | { ok: true; roles: { id: string; name: string }[] }
  | { ok: false; status: number }
> {
  const response = await apiFetch(`/guilds/${guildId}/roles`, {
    cache: "no-store",
  });
  if (!response.ok) {
    return { ok: false, status: response.status };
  }
  const raw = (await response.json()) as { id?: unknown; name?: unknown }[];
  const roles: { id: string; name: string }[] = [];
  for (const role of Array.isArray(raw) ? raw : []) {
    const id = asString(role.id);
    if (id) {
      roles.push({ id, name: asString(role.name) ?? "" });
    }
  }
  return { ok: true, roles };
}

export async function fetchGuildChannels(
  guildId: string,
): Promise<
  { ok: true; channels: GuildChannel[] } | { ok: false; status: number }
> {
  const response = await apiFetch(`/guilds/${guildId}/channels`, {
    cache: "no-store",
  });
  if (!response.ok) {
    return { ok: false, status: response.status };
  }
  const raw = (await response.json()) as Parameters<typeof readChannel>[0][];
  const channels: GuildChannel[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    const channel = readChannel(item);
    if (channel) {
      channels.push(channel);
    }
  }
  return { ok: true, channels };
}

export async function createGuildRole(
  guildId: string,
  role: { name: string; mentionable: boolean },
): Promise<{ ok: true; roleId: string } | { ok: false; status: number }> {
  const response = await apiFetch(`/guilds/${guildId}/roles`, {
    method: "POST",
    json: { name: role.name, mentionable: role.mentionable, hoist: false },
  });
  if (!response.ok) {
    return { ok: false, status: response.status };
  }
  const created = (await response.json()) as { id?: unknown };
  const roleId = asString(created.id);
  return roleId ? { ok: true, roleId } : { ok: false, status: 500 };
}

// A text channel under a category. Deliberately created without permission
// overwrites, so it inherits the category's (who may see every group channel
// is the category's business); the caller adds its own overwrites afterwards.
export async function createGuildTextChannel(
  guildId: string,
  channel: { name: string; parentId: string },
): Promise<{ ok: true; channelId: string } | { ok: false; status: number }> {
  const response = await apiFetch(`/guilds/${guildId}/channels`, {
    method: "POST",
    json: {
      name: channel.name,
      type: CHANNEL_TYPE_TEXT,
      parent_id: channel.parentId,
    },
  });
  if (!response.ok) {
    return { ok: false, status: response.status };
  }
  const created = (await response.json()) as { id?: unknown };
  const channelId = asString(created.id);
  return channelId ? { ok: true, channelId } : { ok: false, status: 500 };
}

export async function putChannelPermissionOverwrite(
  channelId: string,
  overwrite: ChannelOverwrite,
): Promise<DiscordCallResult> {
  const response = await apiFetch(
    `/channels/${channelId}/permissions/${overwrite.id}`,
    {
      method: "PUT",
      json: {
        type: overwrite.type,
        allow: overwrite.allow,
        deny: overwrite.deny,
      },
    },
  );
  return response.ok ? { ok: true } : { ok: false, status: response.status };
}

// 404 means the user is not (or no longer) a guild member, or the role no
// longer exists — the converge treats it as a skip, not an error.
export async function addMemberRole(
  guildId: string,
  userId: string,
  roleId: string,
): Promise<DiscordCallResult> {
  const response = await apiFetch(
    `/guilds/${guildId}/members/${userId}/roles/${roleId}`,
    { method: "PUT" },
  );
  return response.ok ? { ok: true } : { ok: false, status: response.status };
}

export async function removeMemberRole(
  guildId: string,
  userId: string,
  roleId: string,
): Promise<DiscordCallResult> {
  const response = await apiFetch(
    `/guilds/${guildId}/members/${userId}/roles/${roleId}`,
    { method: "DELETE" },
  );
  return response.ok ? { ok: true } : { ok: false, status: response.status };
}
