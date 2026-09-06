"use client";

import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { TypeToConfirm } from "@/components/type-to-confirm";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { matchesConfirmationPhrase } from "@/lib/confirm";
import { emphasisSurface } from "@/lib/emphasis";
import { cn } from "@/lib/utils";
import { publishSchedule } from "../actions";
import { PUBLISH_CONFIRMATION_PHRASE } from "../spieltage";

// What goes live, summarized for the card body and the dialog's facts strip —
// the same numbers anatomy as the create dialog.
export type PublishFacts = {
  rounds: number;
  matches: number;
  groups: number;
  // First and last Spieltag deadline (ISO days).
  firstDeadline: string;
  lastDeadline: string;
};

// "So. 30.08.2026" — same weekday-prefixed form as the create dialog.
function fmtDay(iso: string): string {
  return format(parseISO(iso), "EEEEEE. dd.MM.yyyy", { locale: de });
}

function Fact({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="min-w-0">
      <div className="font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.08em]">
        {label}
      </div>
      <div className="font-semibold text-[15px]">{value}</div>
      <div className="truncate text-muted-foreground text-xs">{sub}</div>
    </div>
  );
}

// The schedule_hidden todo at the top of the staff dashboard, in the same
// anatomy as the pre-season and MotW todo cards: the one step the season is
// waiting for. The dashboard below is the review surface for the pairings;
// the card stays compact and carries the terminal publish gate.
export function PublishScheduleCard({ facts }: { facts: PublishFacts }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-lg px-5 py-4",
        emphasisSurface("orange"),
      )}
    >
      <div className="flex flex-col gap-0.5">
        <p className="font-semibold text-[14.5px]">Pairings veröffentlichen</p>
        <p className="text-[13px] text-muted-foreground">
          {facts.rounds} Spieltage · {facts.matches} Spiele. Der Spielplan ist
          nur für das Staff sichtbar, die Spieler warten auf ihre Paarungen.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          asChild
          size="sm"
          variant="outline"
          className="border-brand-orange/50"
        >
          <Link href="/spielplan">Spielplan ansehen</Link>
        </Button>
        <PublishScheduleDialog facts={facts} triggerSize="sm" />
      </div>
    </div>
  );
}

// The terminal publish gate: facts strip + type-to-confirm, then the season is
// live for everyone. Mirrors the create dialog's pattern.
export function PublishScheduleDialog({
  facts,
  triggerSize = "default",
}: {
  facts: PublishFacts;
  triggerSize?: "default" | "sm";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setConfirmation("");
      setError(null);
    }
    setOpen(next);
  }

  async function submit() {
    setPending(true);
    setError(null);
    const result = await publishSchedule();
    setPending(false);
    if (result.ok) {
      setOpen(false);
      router.refresh();
    } else {
      setError(result.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" size={triggerSize}>
          Pairings veröffentlichen
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Pairings veröffentlichen?</DialogTitle>
          <DialogDescription>
            Der Spielplan wird für alle sichtbar: Startseite, Spieler-Dashboard
            und Profile zeigen die Paarungen, und Ergebnisse können gemeldet
            werden. Auf Discord werden Gruppenrollen und Gruppenkanäle angelegt
            und die Spieler zugeordnet, das kann ein paar Minuten dauern. Das
            kann nicht rückgängig gemacht werden.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-x-4 gap-y-2.5 rounded-lg bg-muted px-4 py-3 sm:grid-cols-[0.8fr_0.9fr_1.3fr] sm:gap-y-4">
          <Fact
            label="Spieltage"
            value={String(facts.rounds)}
            sub={`Spieltag 1 bis ${fmtDay(facts.firstDeadline)}`}
          />
          <Fact
            label="Spiele"
            value={String(facts.matches)}
            sub={`in ${facts.groups} Gruppen`}
          />
          <Fact
            label="Saisonende"
            value={fmtDay(facts.lastDeadline)}
            sub={`Spieltag ${facts.rounds}`}
          />
        </div>

        <TypeToConfirm
          id="publish-schedule-confirmation"
          phrase={PUBLISH_CONFIRMATION_PHRASE}
          value={confirmation}
          onChange={setConfirmation}
          error={error}
        />

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Abbrechen
            </Button>
          </DialogClose>
          <Button
            type="button"
            disabled={
              !matchesConfirmationPhrase(
                confirmation,
                PUBLISH_CONFIRMATION_PHRASE,
              ) || pending
            }
            onClick={submit}
          >
            {pending ? "Wird veröffentlicht…" : "Pairings veröffentlichen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
