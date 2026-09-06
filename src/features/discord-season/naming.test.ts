import { describe, expect, it } from "vitest";
import {
  allowsView,
  botAllowOverwrite,
  deniesView,
  everyoneDenyOverwrite,
  groupChannelName,
  groupRoleAllowOverwrite,
  groupRoleName,
  VIEW_CHANNEL,
} from "./naming";

describe("group names", () => {
  it("names the role after the hub's group name", () => {
    expect(groupRoleName(1, 0)).toBe("Division 1a");
    expect(groupRoleName(2, 2)).toBe("Division 2c");
  });

  it("names the channel after the league convention", () => {
    expect(groupChannelName(1, 0)).toBe("💬-div-1a-chat-💬");
    expect(groupChannelName(3, 1)).toBe("💬-div-3b-chat-💬");
  });
});

describe("overwrites", () => {
  it("uses the guild id as the @everyone role and denies view only", () => {
    const overwrite = everyoneDenyOverwrite("guild");
    expect(overwrite).toEqual({
      id: "guild",
      type: 0,
      allow: "0",
      deny: VIEW_CHANNEL.toString(),
    });
    expect(deniesView(overwrite)).toBe(true);
    expect(allowsView(overwrite)).toBe(false);
  });

  it("grants the group role view only", () => {
    const overwrite = groupRoleAllowOverwrite("role");
    expect(overwrite.type).toBe(0);
    expect(allowsView(overwrite)).toBe(true);
    expect(deniesView(overwrite)).toBe(false);
  });

  it("grants the bot a member overwrite", () => {
    expect(botAllowOverwrite("bot").type).toBe(1);
    expect(allowsView(botAllowOverwrite("bot"))).toBe(true);
  });

  it("reads the view bit out of a wider bitfield", () => {
    // View Channel (1024) plus Send Messages (2048).
    expect(allowsView({ id: "x", type: 0, allow: "3072", deny: "0" })).toBe(
      true,
    );
    expect(allowsView({ id: "x", type: 0, allow: "2048", deny: "0" })).toBe(
      false,
    );
  });
});
