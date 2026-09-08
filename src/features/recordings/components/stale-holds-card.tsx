import { Video } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { emphasisSurface } from "@/lib/emphasis";
import { cn } from "@/lib/utils";

// The staff dashboard's loud reminder (docs/plans/recording-holds.md): holds
// whose Spieltag is over. Always the destructive surface. A forgotten release
// is a result the community never gets, so this never softens to a nudge.
export function StaleHoldsCard({
  summary,
  linkToPage = true,
}: {
  summary: { count: number; allReported: boolean };
  // On /staff/aufnahmen itself the list is right below; no button needed.
  linkToPage?: boolean;
}) {
  const { count, allReported } = summary;
  const title =
    count === 1
      ? "1 Match aus einem vergangenen Spieltag wird noch zurückgehalten"
      : `${count} Matches aus vergangenen Spieltagen werden noch zurückgehalten`;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-lg px-5 py-4",
        emphasisSurface("destructive"),
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <Video
          aria-hidden
          className="mt-0.5 size-5 shrink-0 text-destructive"
        />
        <div className="flex flex-col gap-0.5">
          <p className="font-semibold text-[14.5px] text-destructive">
            {title}
          </p>
          <p className="text-[13px] text-muted-foreground">
            {allReported
              ? "Die Ergebnisse sind gemeldet, aber noch nicht öffentlich. Nach dem Stream freigeben."
              : "Die Ergebnisse bleiben nach der Meldung zurückgehalten, bis sie freigegeben werden. Nach dem Stream freigeben."}
          </p>
        </div>
      </div>
      {linkToPage ? (
        <Button asChild size="sm">
          <Link href="/staff/aufnahmen">Jetzt freigeben</Link>
        </Button>
      ) : null}
    </div>
  );
}
