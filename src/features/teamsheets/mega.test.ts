import { describe, expect, it } from "vitest";
import { canonicalSpecies, natureEffect, resolveMega } from "./mega";

// Champions brought megas back, and Delphox/Staraptor are Champions-era stones
// — they exist in @pkmn/dex 0.10.11, which is what these tests pin down.

describe("canonicalSpecies", () => {
  it("rewrites an inline mega forme to its base form", () => {
    expect(canonicalSpecies("Delphox-Mega", "Delphoxite")).toBe("Delphox");
    expect(canonicalSpecies("Staraptor-Mega", "Staraptite")).toBe("Staraptor");
  });

  it("leaves a base form holding its stone alone", () => {
    expect(canonicalSpecies("Delphox", "Delphoxite")).toBe("Delphox");
  });

  it("makes both paste services agree on the same team", () => {
    // Pokepaste writes the mega inline, VRPaste hands back the base form.
    expect(canonicalSpecies("Staraptor-Mega", "Staraptite")).toBe(
      canonicalSpecies("Staraptor", "Staraptite"),
    );
  });

  it("keeps a mega forme that is not holding its stone", () => {
    expect(canonicalSpecies("Delphox-Mega", "Life Orb")).toBe("Delphox-Mega");
    expect(canonicalSpecies("Delphox-Mega", null)).toBe("Delphox-Mega");
  });

  it("ignores a stone held by the wrong species", () => {
    expect(canonicalSpecies("Garchomp", "Delphoxite")).toBe("Garchomp");
  });

  it("normalises casing for species the dex knows", () => {
    expect(canonicalSpecies("garchomp", null)).toBe("Garchomp");
  });

  it("passes through a species the dex does not know, unmangled", () => {
    // Dex lowercases the name of anything it does not know; we must not.
    expect(canonicalSpecies("Fakemon-Mega", "Fakeite")).toBe("Fakemon-Mega");
  });

  // Stones the dex keys by a form other than the base species: the holding
  // form is what we store, and a form that cannot hold the stone stays as it
  // is.
  describe("stones keyed by a specific form", () => {
    it("keeps Floette-Eternal, the only Floette that can hold Floettite", () => {
      expect(canonicalSpecies("Floette-Eternal", "Floettite")).toBe(
        "Floette-Eternal",
      );
      expect(canonicalSpecies("Floette-Mega", "Floettite")).toBe(
        "Floette-Eternal",
      );
      // Plain Floette cannot mega-evolve; the stone is just an item to it.
      expect(canonicalSpecies("Floette", "Floettite")).toBe("Floette");
    });

    it("keeps the form for stones with one entry per form", () => {
      expect(canonicalSpecies("Tatsugiri-Droopy", "Tatsugirinite")).toBe(
        "Tatsugiri-Droopy",
      );
      expect(canonicalSpecies("Tatsugiri-Droopy-Mega", "Tatsugirinite")).toBe(
        "Tatsugiri-Droopy",
      );
      expect(canonicalSpecies("Meowstic-F-Mega", "Meowsticite")).toBe(
        "Meowstic-F",
      );
      expect(canonicalSpecies("Zygarde-Mega", "Zygardite")).toBe(
        "Zygarde-Complete",
      );
    });
  });
});

describe("resolveMega", () => {
  it("resolves a base form holding its stone", () => {
    expect(resolveMega("Delphox", "Delphoxite")).toEqual({
      spriteSpecies: "Delphox-Mega",
      displayName: "Delphox",
      megaAbility: "Levitate",
    });
  });

  it("resolves an inline mega forme and still displays the base name", () => {
    expect(resolveMega("Staraptor-Mega", "Staraptite")).toEqual({
      spriteSpecies: "Staraptor-Mega",
      displayName: "Staraptor",
      megaAbility: "Contrary",
    });
  });

  it("leaves a mon without a stone unresolved", () => {
    expect(resolveMega("Garchomp", "Life Orb")).toEqual({
      spriteSpecies: "Garchomp",
      displayName: "Garchomp",
      megaAbility: null,
    });
  });

  it("leaves a mon with no item unresolved", () => {
    expect(resolveMega("Garchomp", null).megaAbility).toBeNull();
  });

  it("resolves a stone keyed by a specific form", () => {
    expect(resolveMega("Floette-Eternal", "Floettite")).toEqual({
      spriteSpecies: "Floette-Mega",
      displayName: "Floette-Eternal",
      megaAbility: "Fairy Aura",
    });
    // The right mega for the form, not the first entry of the stone.
    expect(resolveMega("Tatsugiri-Droopy", "Tatsugirinite").spriteSpecies).toBe(
      "Tatsugiri-Droopy-Mega",
    );
    expect(resolveMega("Meowstic-F", "Meowsticite").spriteSpecies).toBe(
      "Meowstic-F-Mega",
    );
    expect(resolveMega("Zygarde-Complete", "Zygardite").spriteSpecies).toBe(
      "Zygarde-Mega",
    );
  });

  it("does not mega-evolve a form that cannot hold the stone", () => {
    expect(resolveMega("Floette", "Floettite")).toEqual({
      spriteSpecies: "Floette",
      displayName: "Floette",
      megaAbility: null,
    });
  });

  it("never throws on a species the dex does not know", () => {
    expect(resolveMega("Fakemon", "Fakeite")).toEqual({
      spriteSpecies: "Fakemon",
      displayName: "Fakemon",
      megaAbility: null,
    });
  });
});

describe("natureEffect", () => {
  it("uses the standard Showdown stat abbreviations, not translations", () => {
    expect(natureEffect("Jolly")).toEqual({ plus: "Spe", minus: "SpA" });
    expect(natureEffect("Modest")).toEqual({ plus: "SpA", minus: "Atk" });
    expect(natureEffect("Adamant")).toEqual({ plus: "Atk", minus: "SpA" });
    expect(natureEffect("Bold")).toEqual({ plus: "Def", minus: "Atk" });
    expect(natureEffect("Calm")).toEqual({ plus: "SpD", minus: "Atk" });
  });

  it("returns nothing for a neutral nature", () => {
    expect(natureEffect("Serious")).toBeNull();
    expect(natureEffect("Hardy")).toBeNull();
  });

  it("returns nothing for an unknown nature", () => {
    expect(natureEffect("Grumpy")).toBeNull();
  });
});
