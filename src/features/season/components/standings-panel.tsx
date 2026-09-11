"use client";

import { useState } from "react";
import { PlayerLink } from "@/features/player-profile/components/player-link";
import type { StandingsRow } from "@/features/reporting/standings";
import type { Zone } from "@/features/seeding/post-season";
import { cn } from "@/lib/utils";
import { PlayerAvatar } from "./player-avatar";

// Game differential with an explicit sign, e.g. "+11", "0", "−3".
function formatDiff(diff: number): string {
  if (diff > 0) return `+${diff}`;
  if (diff < 0) return `−${-diff}`;
  return "0";
}

// Post-season zone visuals. Guaranteed spots are green (promotion) / red
// (demotion); both playoff bands share amber — position + legend disambiguate.
// Each zoned row gets a soft tint plus a 6px rail flush left.
const ZONE_TINT: Record<Zone, string> = {
  champion: "bg-zone-champion/12",
  promote: "bg-zone-promote/7",
  promotion_playoff: "bg-zone-playoff/10",
  demotion_playoff: "bg-zone-playoff/10",
  demote: "bg-zone-demote/6",
  none: "",
};
const ZONE_OVERLAY: Record<Zone, string> = {
  champion: "before:absolute before:inset-0 before:bg-zone-champion/12",
  promote: "before:absolute before:inset-0 before:bg-zone-promote/7",
  promotion_playoff: "before:absolute before:inset-0 before:bg-zone-playoff/10",
  demotion_playoff: "before:absolute before:inset-0 before:bg-zone-playoff/10",
  demote: "before:absolute before:inset-0 before:bg-zone-demote/6",
  none: "",
};
const ZONE_RAIL: Record<Zone, string> = {
  champion: "bg-zone-champion",
  promote: "bg-zone-promote",
  promotion_playoff: "bg-zone-playoff",
  demotion_playoff: "bg-zone-playoff",
  demote: "bg-zone-demote",
  none: "",
};
const ME_TINT = "bg-brand-orange/6";
const ME_OVERLAY = "before:absolute before:inset-0 before:bg-brand-orange/6";

export type ZoneMap = Map<string, Zone>;

// The standings table itself — dumb, view-only. Shared by the group and the
// division view. Rows can be tinted by post-season zone (rail + soft tint); the
// current player is always marked (orange rail/tint when unzoned, plus bold name,
// "Du" badge and filled avatar). The Platz + Spieler columns stay frozen (sticky)
// on the left as the score columns scroll; frozen cells carry an opaque base + a
// `before` tint so scrolled columns don't bleed through, and the rail sits on the
// rank cell's left edge. `groupLabels` adds a sub-division chip in the division
// view.
export function StandingsTable({
  standings,
  meId,
  zones,
  groupLabels,
  withheld = 0,
}: {
  standings: StandingsRow[];
  meId: string;
  zones?: ZoneMap;
  groupLabels?: Map<string, string>;
  // Results of this table that are under embargo and therefore not counted
  // yet (docs/plans/standings-embargo.md).
  withheld?: number;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[400px] border-separate border-spacing-0 text-left [&_tr:last-child_td]:border-b-0">
          <thead>
            <tr className="text-[11px] text-muted-foreground uppercase tracking-[0.1em]">
              <th className="sticky left-0 z-20 w-[44px] border-b bg-background py-2.5 pr-1 pl-4 font-semibold before:absolute before:inset-0 before:bg-muted/50">
                <span className="relative">Pl.</span>
              </th>
              <th className="sticky left-[44px] z-10 border-r border-b bg-background py-2.5 pr-3 pl-2 font-semibold before:absolute before:inset-0 before:bg-muted/50">
                <span className="relative">Spieler</span>
              </th>
              <th className="border-b bg-muted/50 py-2.5 pr-3 pl-5 text-right font-semibold">
                Bilanz
              </th>
              <th className="border-b bg-muted/50 px-3 py-2.5 text-right font-semibold">
                Diff.
              </th>
              <th className="border-b bg-muted/50 px-3 py-2.5 text-right font-semibold">
                Punkte
              </th>
            </tr>
          </thead>
          <tbody>
            {standings.map((row) => {
              const me = row.userId === meId;
              const zone = zones?.get(row.userId) ?? "none";
              const zoned = zone !== "none";
              const rowTint = zoned ? ZONE_TINT[zone] : me ? ME_TINT : "";
              const overlay = zoned ? ZONE_OVERLAY[zone] : me ? ME_OVERLAY : "";
              const rail = zoned
                ? ZONE_RAIL[zone]
                : me
                  ? "bg-brand-orange"
                  : "";
              const groupLabel = groupLabels?.get(row.userId);
              return (
                <tr key={row.userId} className={cn(rowTint)}>
                  <td
                    className={cn(
                      "sticky left-0 z-20 border-b bg-background py-2.5 pr-1 pl-4 font-semibold text-muted-foreground text-sm tabular-nums",
                      overlay,
                    )}
                  >
                    {rail ? (
                      <span
                        className={cn("absolute inset-y-0 left-0 w-1.5", rail)}
                      />
                    ) : null}
                    <span className="relative">{row.rank}</span>
                  </td>
                  <td
                    className={cn(
                      "sticky left-[44px] z-10 border-r border-b bg-background py-2.5 pr-3 pl-2",
                      overlay,
                    )}
                  >
                    <span className="relative flex min-w-0 items-center gap-2">
                      <PlayerAvatar
                        identity={row}
                        size="size-[26px]"
                        filled={me}
                      />
                      <PlayerLink
                        userId={row.userId}
                        name={row.name}
                        className={cn(
                          "truncate text-[14.5px]",
                          me ? "font-semibold" : "font-medium",
                        )}
                      />
                      {groupLabel ? (
                        <span className="shrink-0 rounded-full bg-muted px-[7px] py-[2px] font-bold text-[10.5px] text-muted-foreground">
                          {groupLabel}
                        </span>
                      ) : null}
                      {row.dropped ? (
                        <span
                          title="Spieler wurde gedroppt, alle Matches zählen als Freewin für die Gegner"
                          className="shrink-0 rounded-full border border-destructive/40 bg-destructive/8 px-[7px] py-[2px] font-bold text-[10.5px] text-destructive uppercase tracking-[0.06em]"
                        >
                          Drop
                        </span>
                      ) : null}
                      {me ? (
                        <span className="shrink-0 font-bold text-[10px] text-brand-orange uppercase tracking-[0.1em]">
                          Du
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td className="border-b py-2.5 pr-3 pl-5 text-right text-muted-foreground text-sm tabular-nums">
                    {row.wins} : {row.losses}
                  </td>
                  <td className="border-b px-3 py-2.5 text-right font-semibold text-[14.5px] tabular-nums">
                    {formatDiff(row.gamesWon - row.gamesLost)}
                  </td>
                  <td className="border-b px-3 py-2.5 text-right font-semibold text-[14.5px] tabular-nums">
                    {row.points}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ZoneLegend zones={zones} />
      <WithheldNote count={withheld} />
    </div>
  );
}

// Why the table can be behind the Spielplan: a result that is not public does
// not count yet (docs/plans/standings-embargo.md). Without the line the table
// looks wrong rather than deliberate; it gives nothing away, the match row
// already says that the result is pending.
function WithheldNote({ count }: { count: number }) {
  if (count <= 0) {
    return null;
  }
  return (
    <p className="text-[12.5px] text-muted-foreground">
      {count === 1
        ? "Ein Ergebnis wird noch zurückgehalten und zählt erst, sobald es veröffentlicht ist."
        : `${count} Ergebnisse werden noch zurückgehalten und zählen erst, sobald sie veröffentlicht sind.`}
    </p>
  );
}

// Legend for the zones actually present. The two playoff bands are named
// separately even though they share the amber swatch.
function ZoneLegend({ zones }: { zones?: ZoneMap }) {
  if (!zones) return null;
  const present = new Set(zones.values());
  const items: { show: boolean; bar: string; label: string }[] = [
    {
      show: present.has("champion"),
      bar: "bg-zone-champion",
      label: "Playoffs",
    },
    {
      show: present.has("promote"),
      bar: "bg-zone-promote",
      label: "Direkter Aufstieg",
    },
    {
      show: present.has("promotion_playoff"),
      bar: "bg-zone-playoff",
      label: "Aufstiegs-Playoff",
    },
    {
      show: present.has("demotion_playoff"),
      bar: "bg-zone-playoff",
      label: "Abstiegs-Playoff",
    },
    {
      show: present.has("demote"),
      bar: "bg-zone-demote",
      label: "Direkter Abstieg",
    },
  ].filter((i) => i.show);
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[12.5px] text-muted-foreground">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5">
          <span className={cn("h-[5px] w-3.5 rounded-[3px]", item.bar)} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

// The Tabelle section body. Post-season zones are shown on the division's
// *relevant* table only: in `division` mode the division table carries them and
// is the default view; in `sub_division` mode the group table carries them and no
// division tab is shown. `divisionStandings === null` means sub-division mode.
export function StandingsPanel({
  groupName,
  groupStandings,
  groupZones,
  divisionName,
  divisionStandings,
  divisionZones,
  divisionGroupLabels,
  defaultScope,
  meId,
  groupWithheld = 0,
  divisionWithheld = 0,
}: {
  groupName: string;
  groupStandings: StandingsRow[];
  groupZones?: ZoneMap;
  divisionName: string;
  divisionStandings: StandingsRow[] | null;
  divisionZones?: ZoneMap;
  divisionGroupLabels?: Map<string, string>;
  defaultScope: "group" | "division";
  meId: string;
  // Embargoed results per table, so the note matches the table on screen.
  groupWithheld?: number;
  divisionWithheld?: number;
}) {
  const [scope, setScope] = useState<"group" | "division">(defaultScope);
  const divisionMode = divisionStandings !== null;
  const showDivision = divisionMode && scope === "division";

  const context = !divisionMode
    ? "Auf- und Abstieg wird innerhalb deiner Gruppe entschieden. Die markierten Plätze gelten."
    : showDivision
      ? "Auf- und Abstieg wird über die Gesamttabelle der Division entschieden. Die markierten Plätze gelten."
      : `Nur zur Orientierung. Auf- und Abstieg wird über die Gesamttabelle (${divisionName}) entschieden.`;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-muted-foreground">{context}</p>

      {divisionMode ? (
        <div className="flex gap-1 self-start rounded-full border bg-muted/40 p-[3px]">
          <Segment
            active={!showDivision}
            onClick={() => setScope("group")}
            label={groupName}
          />
          <Segment
            active={showDivision}
            onClick={() => setScope("division")}
            label={divisionName}
            relevant
          />
        </div>
      ) : null}

      {showDivision ? (
        <StandingsTable
          standings={divisionStandings}
          meId={meId}
          zones={divisionZones}
          groupLabels={divisionGroupLabels}
          withheld={divisionWithheld}
        />
      ) : (
        <StandingsTable
          standings={groupStandings}
          meId={meId}
          zones={groupZones}
          withheld={groupWithheld}
        />
      )}
    </div>
  );
}

// A switcher segment. The relevant table's segment carries a skewed tick — the
// "this one decides" marker (navy on the active orange fill, orange otherwise).
function Segment({
  active,
  onClick,
  label,
  relevant,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  relevant?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1.5 rounded-full px-3 py-1.5 font-semibold text-[13px] uppercase tracking-[0.08em] transition-colors",
        active
          ? "bg-brand-orange text-white"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {relevant ? (
        <span
          className={cn(
            "h-[7px] w-3.5 -skew-x-[18deg]",
            active ? "bg-brand-blue" : "bg-brand-orange",
          )}
        />
      ) : null}
      {label}
    </button>
  );
}
