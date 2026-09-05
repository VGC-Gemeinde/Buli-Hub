import { describe, expect, it, vi } from "vitest";
import type { GuildChannel, GuildMemberRoles } from "@/lib/discord";
import {
  runSeasonDiscordSync,
  type SeasonDiscordClient,
  type SeasonDiscordStore,
} from "./converge";
import { VIEW_CHANNEL } from "./naming";
import type { SeasonPlayer, TrackedResource } from "./plan";
import type { SeasonDiscordReport } from "./report";

const CONFIG = { categoryId: "cat", buliRoleId: "buli" };
const GUILD = "guild";
const BOT = "bot";
const VIEW = VIEW_CHANNEL.toString();

// A fake Discord that behaves like the real one for what the sync does:
// records every mutation in order, hands out ids, lets tests fail specific
// calls. Roles/channels/members are the server's state at the start.
function fakeDiscord(state: {
  roles?: string[];
  channels?: GuildChannel[];
  members?: GuildMemberRoles[];
  categoryType?: number;
  fail?: Partial<Record<keyof SeasonDiscordClient, number>>;
  addStatus?: (userId: string, roleId: string) => number | null;
}) {
  const calls: string[] = [];
  let counter = 0;
  const fail = state.fail ?? {};
  const failing = (name: keyof SeasonDiscordClient) =>
    fail[name] !== undefined
      ? { ok: false as const, status: fail[name] }
      : null;
  const client: SeasonDiscordClient = {
    fetchBotUserId: async () =>
      failing("fetchBotUserId") ?? { ok: true, userId: BOT },
    fetchChannel: async (id) =>
      failing("fetchChannel") ?? {
        ok: true,
        channel: {
          id,
          type: state.categoryType ?? 4,
          parentId: null,
          permissionOverwrites: [],
        },
        guildId: GUILD,
      },
    fetchGuildRoles: async () =>
      failing("fetchGuildRoles") ?? {
        ok: true,
        roles: ["buli", ...(state.roles ?? [])].map((id) => ({
          id,
          name: id,
        })),
      },
    fetchGuildChannels: async () =>
      failing("fetchGuildChannels") ?? {
        ok: true,
        channels: state.channels ?? [],
      },
    fetchGuildMembers: async () =>
      failing("fetchGuildMembers") ?? {
        ok: true,
        members: state.members ?? [],
      },
    createGuildRole: async (_guild, role) => {
      calls.push(`create_role ${role.name}`);
      return (
        failing("createGuildRole") ?? { ok: true, roleId: `role-${++counter}` }
      );
    },
    createGuildTextChannel: async (_guild, channel) => {
      calls.push(`create_channel ${channel.name} in ${channel.parentId}`);
      return (
        failing("createGuildTextChannel") ?? {
          ok: true,
          channelId: `chan-${++counter}`,
        }
      );
    },
    putChannelPermissionOverwrite: async (channelId, overwrite) => {
      calls.push(`overwrite ${channelId} ${overwrite.id}`);
      return failing("putChannelPermissionOverwrite") ?? { ok: true };
    },
    addMemberRole: async (_guild, userId, roleId) => {
      calls.push(`add ${userId} ${roleId}`);
      const status = state.addStatus?.(userId, roleId) ?? null;
      return status === null ? { ok: true } : { ok: false, status };
    },
    removeMemberRole: async (_guild, userId, roleId) => {
      calls.push(`remove ${userId} ${roleId}`);
      return failing("removeMemberRole") ?? { ok: true };
    },
  };
  return { client, calls };
}

function fakeStore(state: {
  groups?: { subDivisionId: string; tier: number; position: number }[];
  players?: SeasonPlayer[];
  tracked?: TrackedResource[];
}) {
  const tracked: TrackedResource[] = [...(state.tracked ?? [])];
  const recorded: TrackedResource[] = [];
  const saved: { ranAt: Date; report: SeasonDiscordReport }[] = [];
  const store: SeasonDiscordStore = {
    listSeasonGroups: async () => state.groups ?? [],
    listPlacedPlayers: async () => state.players ?? [],
    trackedResources: async () => tracked,
    recordResource: async (input) => {
      recorded.push(input);
      tracked.push(input);
    },
    saveSyncState: async (_windowId, ranAt, report) => {
      saved.push({ ranAt, report });
    },
  };
  return { store, recorded, saved };
}

const G1A = { subDivisionId: "sd-1a", tier: 1, position: 0 };
const G1B = { subDivisionId: "sd-1b", tier: 1, position: 1 };
const alice: SeasonPlayer = {
  userId: "alice",
  name: "Alice",
  discordId: "d-alice",
  subDivisionId: "sd-1a",
};
const bob: SeasonPlayer = {
  userId: "bob",
  name: "Bob",
  discordId: "d-bob",
  subDivisionId: "sd-1b",
};

const NOW = new Date("2026-09-06T12:00:00Z");

async function run(
  discord: ReturnType<typeof fakeDiscord>,
  store: ReturnType<typeof fakeStore>,
) {
  vi.spyOn(console, "error").mockImplementation(() => {});
  return runSeasonDiscordSync(
    {
      discord: discord.client,
      store: store.store,
      config: CONFIG,
      now: () => NOW,
    },
    "window",
  );
}

describe("runSeasonDiscordSync", () => {
  it("sets up a fresh season: roles, channels, overwrites, member roles, in order", async () => {
    const discord = fakeDiscord({
      members: [
        { id: "d-alice", roles: [] },
        { id: "d-bob", roles: ["buli"] },
      ],
    });
    const store = fakeStore({ groups: [G1A, G1B], players: [alice, bob] });

    const report = await run(discord, store);

    expect(discord.calls).toEqual([
      "create_role Division 1a",
      "create_channel division-1a in cat",
      "overwrite chan-2 bot",
      "overwrite chan-2 role-1",
      "overwrite chan-2 guild",
      "create_role Division 1b",
      "create_channel division-1b in cat",
      "overwrite chan-4 bot",
      "overwrite chan-4 role-3",
      "overwrite chan-4 guild",
      "add d-alice buli",
      "add d-alice role-1",
      "add d-bob role-3",
    ]);
    expect(store.recorded).toEqual([
      {
        windowId: "window",
        subDivisionId: "sd-1a",
        kind: "group_role",
        discordId: "role-1",
      },
      {
        windowId: "window",
        subDivisionId: "sd-1a",
        kind: "group_channel",
        discordId: "chan-2",
      },
      {
        windowId: "window",
        subDivisionId: "sd-1b",
        kind: "group_role",
        discordId: "role-3",
      },
      {
        windowId: "window",
        subDivisionId: "sd-1b",
        kind: "group_channel",
        discordId: "chan-4",
      },
    ]);
    expect(report).toEqual({
      groupsReady: 2,
      groupsTotal: 2,
      playersReady: 2,
      playersTotal: 2,
      skipped: [],
      error: null,
    });
    expect(store.saved).toEqual([{ ranAt: NOW, report }]);
  });

  it("does nothing on a converged server beyond reading", async () => {
    const discord = fakeDiscord({
      roles: ["r1a"],
      channels: [
        {
          id: "c1a",
          type: 0,
          parentId: "cat",
          permissionOverwrites: [
            { id: BOT, type: 1, allow: VIEW, deny: "0" },
            { id: "r1a", type: 0, allow: VIEW, deny: "0" },
            { id: GUILD, type: 0, allow: "0", deny: VIEW },
          ],
        },
      ],
      members: [{ id: "d-alice", roles: ["buli", "r1a"] }],
    });
    const store = fakeStore({
      groups: [G1A],
      players: [alice],
      tracked: [
        { subDivisionId: "sd-1a", kind: "group_role", discordId: "r1a" },
        { subDivisionId: "sd-1a", kind: "group_channel", discordId: "c1a" },
      ],
    });

    const report = await run(discord, store);

    expect(discord.calls).toEqual([]);
    expect(store.recorded).toEqual([]);
    expect(report).toMatchObject({
      groupsReady: 1,
      playersReady: 1,
      error: null,
    });
  });

  it("recreates a deleted channel and re-points the tracked row", async () => {
    const discord = fakeDiscord({
      roles: ["r1a"],
      channels: [], // channel gone
      members: [{ id: "d-alice", roles: ["buli", "r1a"] }],
    });
    const store = fakeStore({
      groups: [G1A],
      players: [alice],
      tracked: [
        { subDivisionId: "sd-1a", kind: "group_role", discordId: "r1a" },
        { subDivisionId: "sd-1a", kind: "group_channel", discordId: "c-old" },
      ],
    });

    await run(discord, store);

    expect(discord.calls).toEqual([
      "create_channel division-1a in cat",
      "overwrite chan-1 bot",
      "overwrite chan-1 r1a",
      "overwrite chan-1 guild",
    ]);
    expect(store.recorded).toEqual([
      {
        windowId: "window",
        subDivisionId: "sd-1a",
        kind: "group_channel",
        discordId: "chan-1",
      },
    ]);
  });

  it("strips hub roles from members who are not active placed players", async () => {
    const discord = fakeDiscord({
      roles: ["r1a"],
      channels: [
        {
          id: "c1a",
          type: 0,
          parentId: "cat",
          permissionOverwrites: [
            { id: BOT, type: 1, allow: VIEW, deny: "0" },
            { id: "r1a", type: 0, allow: VIEW, deny: "0" },
            { id: GUILD, type: 0, allow: "0", deny: VIEW },
          ],
        },
      ],
      members: [
        { id: "d-alice", roles: ["buli", "r1a"] },
        { id: "d-dropped", roles: ["buli", "r1a"] },
      ],
    });
    const store = fakeStore({
      groups: [G1A],
      players: [alice],
      tracked: [
        { subDivisionId: "sd-1a", kind: "group_role", discordId: "r1a" },
        { subDivisionId: "sd-1a", kind: "group_channel", discordId: "c1a" },
      ],
    });

    await run(discord, store);

    expect(discord.calls).toEqual([
      "remove d-dropped buli",
      "remove d-dropped r1a",
    ]);
  });

  it("stops creating after the first failing create and reports it", async () => {
    const discord = fakeDiscord({
      members: [{ id: "d-alice", roles: [] }],
      fail: { createGuildTextChannel: 403 },
    });
    const store = fakeStore({ groups: [G1A, G1B], players: [alice, bob] });

    const report = await run(discord, store);

    // Role 1a created and recorded, channel failed, group 1b never tried;
    // members still get what exists (Buli-Spieler + the 1a role).
    expect(discord.calls).toEqual([
      "create_role Division 1a",
      "create_channel division-1a in cat",
      "add d-alice buli",
      "add d-alice role-1",
    ]);
    expect(store.recorded).toHaveLength(1);
    expect(report).toMatchObject({
      groupsReady: 0,
      groupsTotal: 2,
      playersReady: 1,
      playersTotal: 2,
      error: "Kanal für Division 1a konnte nicht angelegt werden (HTTP 403)",
    });
    expect(report.skipped).toEqual([{ name: "Bob", reason: "not_on_server" }]);
    expect(store.saved).toHaveLength(1);
  });

  it("treats a 404 on a role add as not on the server, a 403 as an error that stops the run", async () => {
    const carol: SeasonPlayer = {
      ...bob,
      userId: "carol",
      name: "Carol",
      discordId: "d-carol",
      subDivisionId: "sd-1a",
    };
    const discord = fakeDiscord({
      roles: ["r1a"],
      channels: [
        {
          id: "c1a",
          type: 0,
          parentId: "cat",
          permissionOverwrites: [
            { id: BOT, type: 1, allow: VIEW, deny: "0" },
            { id: "r1a", type: 0, allow: VIEW, deny: "0" },
            { id: GUILD, type: 0, allow: "0", deny: VIEW },
          ],
        },
      ],
      members: [
        { id: "d-alice", roles: [] },
        { id: "d-carol", roles: [] },
        { id: "d-bob", roles: ["buli", "r1a"] },
      ],
      addStatus: (userId) =>
        userId === "d-alice" ? 404 : userId === "d-carol" ? 403 : null,
    });
    const store = fakeStore({
      groups: [G1A],
      players: [alice, carol, { ...bob, subDivisionId: "sd-1a" }],
      tracked: [
        { subDivisionId: "sd-1a", kind: "group_role", discordId: "r1a" },
        { subDivisionId: "sd-1a", kind: "group_channel", discordId: "c1a" },
      ],
    });

    const report = await run(discord, store);

    expect(discord.calls).toEqual(["add d-alice buli", "add d-carol buli"]);
    expect(report.skipped).toEqual([
      { name: "Alice", reason: "not_on_server" },
      { name: "Carol", reason: "error" },
    ]);
    expect(report.error).toBe(
      "Rolle für Carol konnte nicht vergeben werden (HTTP 403)",
    );
    // Bob was already converged and still counts.
    expect(report.playersReady).toBe(1);
  });

  it("reports a misconfigured category or an unreachable guild without touching anything", async () => {
    const notCategory = fakeDiscord({ categoryType: 0 });
    const store = fakeStore({ groups: [G1A], players: [alice] });
    let report = await run(notCategory, store);
    expect(report.error).toBe(
      "Die konfigurierte Liga-Kategorie ist keine Kategorie",
    );
    expect(notCategory.calls).toEqual([]);

    const noMembers = fakeDiscord({ fail: { fetchGuildMembers: 403 } });
    report = await run(
      noMembers,
      fakeStore({ groups: [G1A], players: [alice] }),
    );
    expect(report.error).toBe("Mitgliederliste nicht abrufbar (HTTP 403)");
    expect(noMembers.calls).toEqual([]);
    expect(report).toMatchObject({
      groupsTotal: 1,
      playersTotal: 1,
      groupsReady: 0,
    });
  });

  it("refuses to run against a missing Buli-Spieler role", async () => {
    const discord = fakeDiscord({});
    discord.client.fetchGuildRoles = async () => ({ ok: true, roles: [] });
    const report = await run(
      discord,
      fakeStore({ groups: [G1A], players: [alice] }),
    );
    expect(report.error).toBe(
      "Die konfigurierte Buli-Spieler-Rolle existiert nicht",
    );
    expect(discord.calls).toEqual([]);
  });

  it("stores a report even when a dependency throws", async () => {
    const discord = fakeDiscord({});
    discord.client.fetchGuildChannels = async () => {
      throw new Error("network down");
    };
    const store = fakeStore({ groups: [G1A], players: [alice] });
    const report = await run(discord, store);
    expect(report.error).toBe("network down");
    expect(store.saved).toHaveLength(1);
  });
});
