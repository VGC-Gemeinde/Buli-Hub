"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { emphasisSurface } from "@/lib/emphasis";
import { formatGermanDateTime } from "@/lib/german-time";
import { cn } from "@/lib/utils";
import { syncSeasonDiscordNow } from "../actions";
import { type SeasonDiscordCardView, skipReasonLabel } from "../report";

// The staff dashboard's Discord card, todo-card anatomy: rendered only while
// the last sync says the server does not match the league (or no sync ran
// lately). Shows what the last run found and offers one immediate re-run.
// Purely presentational apart from the button; the view comes from
// `cardView` so the gallery renders every state from plain data.

function ranAtText(ranAt: Date): string {
  return formatGermanDateTime(ranAt, {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function title(view: SeasonDiscordCardView): string {
  switch (view.kind) {
    case "never":
      return "Discord wurde noch nicht mit der Liga abgeglichen";
    case "stale":
      return "Der Discord-Abgleich läuft nicht";
    case "attention":
      return "Discord stimmt nicht mit der Liga überein";
  }
}

function summary(view: SeasonDiscordCardView): string {
  switch (view.kind) {
    case "never":
      return "Gruppenrollen, Gruppenkanäle und Spielerrollen werden beim Abgleich angelegt und zugeordnet.";
    case "stale":
      return `Letzter Abgleich: ${ranAtText(view.ranAt)}. Der automatische Abgleich sollte alle 15 Minuten laufen.`;
    case "attention":
      return `${view.groups.ready} von ${view.groups.total} Gruppen mit Rolle und Kanal · ${view.players.ready} von ${view.players.total} Spielern mit beiden Rollen · Letzter Abgleich: ${ranAtText(view.ranAt)}`;
  }
}

export function DiscordSeasonCard({ view }: { view: SeasonDiscordCardView }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sync() {
    setPending(true);
    setError(null);
    const result = await syncSeasonDiscordNow();
    setPending(false);
    if (!result.ok) {
      setError(result.error);
    }
    router.refresh();
  }

  const details =
    view.kind === "attention"
      ? [
          ...(view.error ? [view.error] : []),
          ...view.skipped.map(
            (entry) => `${entry.name}: ${skipReasonLabel(entry.reason)}`,
          ),
        ]
      : [];

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg px-5 py-4",
        emphasisSurface("orange"),
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="font-semibold text-[14.5px]">{title(view)}</p>
          <p className="text-[13px] text-muted-foreground">{summary(view)}</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="border-brand-orange/50"
          disabled={pending}
          onClick={sync}
        >
          {pending ? "Wird abgeglichen…" : "Jetzt abgleichen"}
        </Button>
      </div>
      {details.length > 0 || error ? (
        <ul className="flex flex-col gap-0.5 text-[13px]">
          {error ? <li className="text-destructive">{error}</li> : null}
          {details.map((line) => (
            <li key={line} className="text-muted-foreground">
              {line}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
