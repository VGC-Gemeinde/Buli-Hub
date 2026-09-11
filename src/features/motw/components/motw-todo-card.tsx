import Link from "next/link";
import { Button } from "@/components/ui/button";
import { emphasisSurface } from "@/lib/emphasis";
import { cn } from "@/lib/utils";
import type { MotwTodo } from "../motw";

// The staff dashboard's MotW todo (docs/plans/motw-candidates.md). Two duties
// share one card: confirming a finished week whose candidates were never
// decided — until that happens the billboard keeps advertising an older week —
// and nominating candidates for a week that has none. Purely informational,
// nothing (pairings included) is blocked by it.
export function MotwTodoCard({ todo }: { todo: NonNullable<MotwTodo> }) {
  const urgent = todo.urgency === "urgent";
  const confirming = todo.kind === "confirm";
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-lg px-5 py-4",
        emphasisSurface(urgent ? "destructive" : "orange"),
      )}
    >
      <div className="flex flex-col gap-0.5">
        <p
          className={cn(
            "font-semibold text-[14.5px]",
            urgent && "text-destructive",
          )}
        >
          {confirming
            ? `Match of the Week für Spieltag ${todo.round} bestätigen`
            : `Kandidaten für Spieltag ${todo.round} wählen`}
        </p>
        <p className="text-[13px] text-muted-foreground">
          {confirming
            ? "Der Spieltag ist vorbei und die Kandidaten sind noch nicht entschieden. Solange wird weiter das Match der Vorwoche beworben."
            : urgent
              ? "Der aktuelle Spieltag läuft noch ohne Kandidaten für das Match of the Week."
              : "Der nächste Spieltag hat noch keine Kandidaten für das Match of the Week."}
        </p>
      </div>
      <Button
        asChild
        size="sm"
        variant={urgent ? "default" : "outline"}
        className={cn(!urgent && "border-brand-orange/50")}
      >
        {/* Deep-link the workspace at the round the todo is about, so the
            button opens on the week that needs the work. */}
        <Link href={`/staff/motw?spieltag=${todo.round}`}>
          {confirming ? "Jetzt bestätigen" : "Jetzt wählen"}
        </Link>
      </Button>
    </div>
  );
}
