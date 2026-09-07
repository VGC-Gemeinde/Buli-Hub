import { Dex } from "@pkmn/dex";

// Mega handling, ported from justhit.gg (src/lib/pokepaste.ts#resolveMega).
// Pokémon Champions brought megas back, and a paste can express one two ways:
// as the mega forme itself ("Delphox-Mega @ Delphoxite") or as the base form
// holding the stone ("Delphox @ Delphoxite"). Both mean the same team.
//
// Nothing here can reject a sheet. `@pkmn/dex` is a cosmetics table for us —
// a species it does not know renders with a fallback sprite and no mega badge,
// and still validates and stores fine.

// Escape hatch for the window between a Champions patch and the next `@pkmn`
// release. Keys are @pkmn ids (lowercase alphanumeric).
const STONE_OVERRIDES: Record<string, { base: string; mega: string }> = {};
const MEGA_ABILITY_OVERRIDES: Record<string, string> = {};

const toId = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]/g, "");

type StoneEvolution = { base: string; mega: string };

// What a stone does for the given species: the form it evolves and the mega
// it becomes, or null when the stone is not this species' stone. The dex keys
// a stone by the exact form that can hold it — usually the base species
// ("Delphox"), but "Floette-Eternal" for Floettite (plain Floette cannot
// mega-evolve), and one key per form for stones like Tatsugirinite or
// Meowsticite, whose megas keep the form. So the lookup goes form as written
// → the mega itself (a paste that writes "Floette-Mega" inline, matched on
// the stone's value) → base species, and reports the holding form as `base`.
// The base species comes last on purpose: "Tatsugiri-Droopy-Mega" must find
// its own entry before falling back to the one plain "Tatsugiri" would use.
function stoneEvolution(item: string, species: string): StoneEvolution | null {
  const sp = Dex.species.get(species);
  const written = sp.exists ? sp.name : species;
  const baseSpecies = sp.exists ? sp.baseSpecies || sp.name : species;

  const override = STONE_OVERRIDES[toId(item)];
  if (override) {
    return [written, baseSpecies].some((c) => toId(c) === toId(override.base))
      ? override
      : null;
  }
  const stone = (Dex.items.get(item) as { megaStone?: Record<string, string> })
    .megaStone;
  if (!stone) {
    return null;
  }
  if (stone[written]) {
    return { base: written, mega: stone[written] };
  }
  const inline = Object.entries(stone).find(([, mega]) => mega === written);
  if (inline) {
    return { base: inline[0], mega: inline[1] };
  }
  return stone[baseSpecies]
    ? { base: baseSpecies, mega: stone[baseSpecies] }
    : null;
}

// The single ability a species mega-evolves into (slot 0).
function megaAbilityOf(mega: string): string | null {
  const override = MEGA_ABILITY_OVERRIDES[toId(mega)];
  if (override) {
    return override;
  }
  return Dex.species.get(mega).abilities?.["0"] ?? null;
}

// The species we store. A mon holding its own mega stone is always written as
// the form that holds it, so that a Pokepaste (which writes the mega forme
// inline) and a VRPaste (which returns the base form plus a separate mega
// block) produce byte-identical OTS for the same team. A mega forme *without*
// its stone is left alone — it is unusual, but it is what the player wrote.
// `Dex` lowercases the name of a species it does not know, so unknown input is
// passed through untouched rather than mangled into "nonexistentmon".
export function canonicalSpecies(species: string, item: string | null): string {
  if (item) {
    const evolution = stoneEvolution(item, species);
    if (evolution) {
      return evolution.base;
    }
  }
  const sp = Dex.species.get(species);
  return sp.exists ? sp.name : species;
}

export type MegaResolution = {
  // The species to draw the sprite for — the mega when one applies.
  spriteSpecies: string;
  // What to call it on screen: always the base name, never "Delphox-Mega".
  displayName: string;
  // The ability after mega-evolving, when it differs from the listed one.
  megaAbility: string | null;
};

// A mon shows its mega when it either *is* a mega forme in the paste, or holds
// the stone that evolves it.
export function resolveMega(
  species: string,
  item: string | null,
): MegaResolution {
  const sp = Dex.species.get(species);

  if (sp.exists && /^Mega/i.test(sp.forme ?? "")) {
    return {
      spriteSpecies: sp.name,
      displayName: sp.baseSpecies || sp.name,
      megaAbility: megaAbilityOf(sp.name),
    };
  }

  if (item) {
    const evolution = stoneEvolution(item, species);
    if (evolution) {
      return {
        spriteSpecies: evolution.mega,
        displayName: evolution.base,
        megaAbility: megaAbilityOf(evolution.mega),
      };
    }
  }

  return { spriteSpecies: species, displayName: species, megaAbility: null };
}

// The +10% / -10% a nature applies, for the arrows on a team card. Derived from
// the nature name alone, so it reveals nothing about the EVs we strip.
//
// The stat abbreviations are the Showdown ones, untranslated. They are what
// every VGC player reads on every sheet, calc and replay; a German rendering
// ("Ang", "SpVert") would be ours alone and nobody else's.
const STAT_LABEL: Record<string, string> = {
  hp: "HP",
  atk: "Atk",
  def: "Def",
  spa: "SpA",
  spd: "SpD",
  spe: "Spe",
};

export function natureEffect(
  nature: string,
): { plus: string; minus: string } | null {
  const nat = Dex.natures.get(nature);
  if (!nat.exists || !nat.plus || !nat.minus) {
    return null;
  }
  return {
    plus: STAT_LABEL[nat.plus] ?? nat.plus,
    minus: STAT_LABEL[nat.minus] ?? nat.minus,
  };
}
