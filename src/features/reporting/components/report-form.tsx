"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Tick } from "@/components/tick";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Identity } from "@/features/season/dashboard";
import { TeamsheetField } from "@/features/teamsheets/components/teamsheet-field";
import {
  emptyTeamsheet,
  isAccepted,
  type TeamsheetValue,
} from "@/features/teamsheets/field-state";
import { formatGermanDay } from "@/lib/german-time";
import { cn } from "@/lib/utils";
import { reportMatch } from "../actions";
import { isHttpsUrl, type Platform } from "../report";

function isReplayUrl(value: string): boolean {
  try {
    return new URL(value).hostname.endsWith("replay.pokemonshowdown.com");
  } catch {
    return false;
  }
}

function formatDeadline(dateStr: string): string {
  return formatGermanDay(dateStr, {
    day: "numeric",
    month: "long",
  });
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <Tick size="s" />
      <span className="whitespace-nowrap font-semibold text-muted-foreground text-xs uppercase tracking-[0.12em]">
        {children}
      </span>
    </div>
  );
}

function SectionHead({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
      <div className="flex items-center gap-2.5">
        <Tick size="m" />
        <h2 className="font-bold font-heading text-[21px] text-brand-blue uppercase tracking-[0.03em] dark:text-white">
          {title}
        </h2>
      </div>
      {meta ? (
        <span className="font-medium text-[12.5px] text-muted-foreground sm:whitespace-nowrap">
          {meta}
        </span>
      ) : null}
    </div>
  );
}

function Face({ identity, filled }: { identity: Identity; filled?: boolean }) {
  return (
    <Avatar className="size-10 sm:size-[46px]">
      {identity.avatarUrl ? (
        <AvatarImage src={identity.avatarUrl} alt="" />
      ) : null}
      <AvatarFallback className={filled ? "bg-brand-blue text-white" : ""}>
        {identity.name.slice(0, 2).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

// The scoreboard mirrors the mental model "ich habe 2:1 gewonnen" as games are
// picked. Feedback only — the game rows are the controls.
function Scoreboard({
  reporter,
  opponent,
  self,
  opp,
  picked,
  decided,
}: {
  reporter: Identity;
  opponent: Identity;
  self: number;
  opp: number;
  picked: boolean;
  decided: boolean;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl border bg-muted/30 px-4 py-4 sm:gap-4.5 sm:px-[30px] sm:py-[22px]">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <Face identity={reporter} filled />
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-bold font-heading text-[17px] text-brand-blue uppercase leading-[1.05] sm:text-[22px] dark:text-white">
            {reporter.name}
          </span>
          <span className="font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.12em]">
            Du
          </span>
        </div>
      </div>
      <div className="flex flex-col items-center gap-1">
        <span className="whitespace-nowrap font-bold font-heading text-[34px] text-brand-blue leading-none sm:text-[46px] dark:text-white">
          {picked ? self : "–"}
          <span className="px-1.5 text-[24px] text-border sm:text-[32px]">
            :
          </span>
          {picked ? opp : "–"}
        </span>
        {decided ? (
          <span className="rounded-full bg-brand-orange/14 px-3 py-[3px] text-center font-semibold text-brand-blue text-xs dark:text-white">
            {self > opp ? "Sieg für dich" : `Sieg für ${opponent.name}`}
          </span>
        ) : (
          <span className="font-medium text-muted-foreground text-xs">
            Best of 3
          </span>
        )}
      </div>
      <div className="flex min-w-0 items-center justify-end gap-2 sm:gap-3">
        <div className="flex min-w-0 flex-col items-end">
          <span className="truncate font-bold font-heading text-[17px] text-brand-blue uppercase leading-[1.05] sm:text-[22px] dark:text-white">
            {opponent.name}
          </span>
          <span className="font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.12em]">
            Gegner
          </span>
        </div>
        <Face identity={opponent} />
      </div>
    </div>
  );
}

function StickyBar({
  missing,
  readback,
  subline,
  buttonLabel,
  pending,
  onSubmit,
}: {
  missing: string[];
  readback: string;
  subline: string;
  buttonLabel: string;
  pending: boolean;
  onSubmit: () => void;
}) {
  const complete = missing.length === 0;
  return (
    <div className="fixed inset-x-0 bottom-0 border-t bg-background/94 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg">
      <div className="mx-auto flex max-w-[760px] flex-col gap-3 px-6 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-8">
        <div className="flex min-w-0 flex-col">
          <span
            className={cn(
              "font-semibold text-[13.5px]",
              complete
                ? "text-brand-blue dark:text-white"
                : "text-muted-foreground",
            )}
          >
            {complete ? readback : `Noch offen: ${missing.join(" · ")}`}
          </span>
          <span className="text-[12.5px] text-muted-foreground">{subline}</span>
        </div>
        <Button
          type="button"
          size="lg"
          className="w-full sm:w-auto"
          disabled={!complete || pending}
          onClick={onSubmit}
        >
          {pending ? "Wird gemeldet…" : buttonLabel}
        </Button>
      </div>
    </div>
  );
}

export function ReportForm({
  matchId,
  round,
  groupName,
  deadline,
  proofRequired,
  playerA,
  playerB,
  reporterId,
  staffOptions,
  backHref = "/spieler",
  backLabel = "Zurück zur Übersicht",
}: {
  matchId: string;
  round: number;
  groupName: string;
  deadline: string | null;
  // Top-X divisions: Showdown replays / cartridge video are mandatory.
  proofRequired: boolean;
  playerA: Identity;
  playerB: Identity;
  reporterId: string;
  staffOptions: Identity[];
  backHref?: string;
  backLabel?: string;
}) {
  const router = useRouter();
  const reporter = reporterId === playerA.userId ? playerA : playerB;
  const opponent = reporterId === playerA.userId ? playerB : playerA;

  const [view, setView] = useState<"normal" | "free_win">("normal");
  const [platform, setPlatform] = useState<Platform | "">("");
  const [games, setGames] = useState<string[]>(["", "", ""]);
  const [replays, setReplays] = useState<string[]>(["", "", ""]);
  const [teamMine, setTeamMine] = useState<TeamsheetValue>(emptyTeamsheet);
  const [teamOpp, setTeamOpp] = useState<TeamsheetValue>(emptyTeamsheet);
  const [video, setVideo] = useState("");
  const [fwWinnerId, setFwWinnerId] = useState("");
  const [reason, setReason] = useState("");
  const [discussedWithId, setDiscussedWithId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const split = games[0] !== "" && games[1] !== "" && games[0] !== games[1];
  const neededIdx = split ? [0, 1, 2] : [0, 1];
  const relevant = neededIdx.map((i) => games[i]).filter((w) => w !== "");
  const self = relevant.filter((w) => w === reporter.userId).length;
  const opp = relevant.length - self;
  const decided = self === 2 || opp === 2;

  function setGame(i: number, winnerId: string) {
    setGames((prev) => {
      const next = [...prev];
      next[i] = winnerId;
      if (next[0] !== "" && next[1] !== "" && next[0] === next[1]) {
        next[2] = ""; // a 2:0 sweep clears game 3
      }
      return next;
    });
  }

  const missing: string[] = [];
  if (platform === "") missing.push("Plattform");
  for (const i of neededIdx) {
    if (games[i] === "") missing.push(`Spiel ${i + 1}`);
  }
  if (
    platform === "showdown" &&
    neededIdx.some((i) =>
      proofRequired
        ? games[i] !== "" && !isReplayUrl(replays[i])
        : replays[i] !== "" && !isReplayUrl(replays[i]),
    )
  ) {
    missing.push("Replay-Links");
  }
  if (
    platform === "cartridge" &&
    (proofRequired ? !isHttpsUrl(video) : video !== "" && !isHttpsUrl(video))
  ) {
    missing.push("Video-Link");
  }
  if (!isAccepted(teamMine) || !isAccepted(teamOpp)) {
    missing.push("Teamsheets");
  }
  if (missing.length === 0 && !decided) missing.push("Serie unvollständig");

  const readback =
    self > opp
      ? `Du meldest einen ${self}:${opp}-Sieg gegen ${opponent.name}.`
      : `Du meldest eine ${self}:${opp}-Niederlage gegen ${opponent.name}.`;

  const fwMissing: string[] = [];
  if (fwWinnerId === "") fwMissing.push("Spieler");
  if (reason.trim() === "") fwMissing.push("Begründung");
  if (discussedWithId === "") fwMissing.push("Staff-Mitglied");
  const fwReadback = `Freewin für ${
    fwWinnerId === reporter.userId ? "dich" : opponent.name
  } melden. Wartet danach auf Staff-Bestätigung.`;

  async function submit() {
    setPending(true);
    setError(null);
    const report =
      view === "free_win"
        ? {
            outcome: "free_win" as const,
            winnerId: fwWinnerId,
            freeWinReason: reason,
            discussedWithId,
          }
        : {
            outcome: "normal" as const,
            platform,
            games: neededIdx.map((i) => ({
              winnerId: games[i],
              // Empty optional replays stay off the payload entirely.
              ...(platform === "showdown" && replays[i].trim() !== ""
                ? { replayUrl: replays[i] }
                : {}),
            })),
            // Team sheets are keyed to the match's player A/B. Both are
            // accepted by this point (the submit button gates on it), so the
            // non-null assertions below cannot fire.
            playerASheet: sheetPayload(
              reporterId === playerA.userId ? teamMine : teamOpp,
            ),
            playerBSheet: sheetPayload(
              reporterId === playerA.userId ? teamOpp : teamMine,
            ),
            ...(platform === "cartridge" && video.trim() !== ""
              ? { videoUrl: video }
              : {}),
          };
    const result = await reportMatch({ matchId, report });
    if (!result.ok) {
      setPending(false);
      setError(result.error);
      return;
    }
    router.refresh();
  }

  const eyebrow =
    view === "free_win"
      ? `Spieltag ${round} · ${groupName} · vs. ${opponent.name}`
      : `Spieltag ${round} · ${groupName}${deadline ? ` · Deadline ${formatDeadline(deadline)}` : ""}`;

  if (view === "free_win") {
    return (
      <>
        <button
          type="button"
          onClick={() => setView("normal")}
          className="mb-4.5 font-medium text-[13px] text-muted-foreground hover:text-brand-blue dark:hover:text-white"
        >
          ← Zurück zur Ergebnismeldung
        </button>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="mt-2 mb-6.5 text-[38px] text-brand-blue leading-[1.1] dark:text-white">
          Freewin melden
        </h1>
        <p className="mb-9 max-w-[560px] text-[14.5px] text-muted-foreground">
          Für Matches, die nicht gespielt wurden. Ein Freewin muss{" "}
          <span className="font-semibold text-brand-blue dark:text-white">
            vorab mit dem Staff abgesprochen
          </span>{" "}
          sein und zählt erst, wenn ein Staff-Mitglied ihn bestätigt hat.
        </p>

        <div className="flex flex-col gap-9">
          <section className="flex flex-col gap-3">
            <SectionHead title="Wer erhält den Freewin?" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[reporter, opponent].map((p) => (
                // biome-ignore lint/a11y/noStaticElementInteractions: pick card
                <button
                  key={p.userId}
                  type="button"
                  onClick={() => setFwWinnerId(p.userId)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border p-3.5 px-4 text-left",
                    fwWinnerId === p.userId
                      ? "border-brand-orange bg-brand-orange/6"
                      : "border-border",
                  )}
                >
                  <Face identity={p} filled={p.userId === reporter.userId} />
                  <span className="flex flex-col">
                    <span className="font-semibold text-brand-blue text-sm dark:text-white">
                      {p.name}
                    </span>
                    <span className="text-[12.5px] text-muted-foreground">
                      {p.userId === reporter.userId ? "Du" : "Gegner"}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>
          <section className="flex flex-col gap-3">
            <SectionHead title="Begründung" />
            <Textarea
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="z. B. Gegner war trotz mehrerer Terminvorschläge nicht erreichbar."
            />
          </section>
          <section className="flex flex-col gap-3">
            <SectionHead title="Mit wem abgesprochen?" />
            <Select value={discussedWithId} onValueChange={setDiscussedWithId}>
              <SelectTrigger className="max-w-[340px]">
                <SelectValue placeholder="Staff-Mitglied wählen …" />
              </SelectTrigger>
              <SelectContent>
                {staffOptions.map((s) => (
                  <SelectItem key={s.userId} value={s.userId}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </div>

        <StickyBar
          missing={fwMissing}
          readback={fwReadback}
          subline="Zählt erst nach Bestätigung durch ein Staff-Mitglied."
          buttonLabel="Freewin melden"
          pending={pending}
          onSubmit={submit}
        />
      </>
    );
  }

  return (
    <>
      <Link
        href={backHref}
        className="mb-4.5 inline-block font-medium text-[13px] text-muted-foreground hover:text-brand-blue dark:hover:text-white"
      >
        ← {backLabel}
      </Link>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1 className="mt-2 mb-6.5 text-[38px] text-brand-blue leading-[1.1] dark:text-white">
        Ergebnis melden
      </h1>

      <div className="mb-9">
        <Scoreboard
          reporter={reporter}
          opponent={opponent}
          self={self}
          opp={opp}
          picked={relevant.length > 0}
          decided={decided}
        />
      </div>

      <div className="flex flex-col gap-9">
        <section className="flex flex-col gap-3">
          <SectionHead title="Wo habt ihr gespielt?" />
          <RadioGroup
            className="grid grid-cols-1 gap-3 sm:grid-cols-2"
            value={platform}
            onValueChange={(v) => setPlatform(v as Platform)}
          >
            {[
              {
                value: "showdown",
                title: "Pokémon Showdown",
                note: proofRequired
                  ? "Für jedes Spiel wird ein Replay-Link gebraucht."
                  : "Replay-Links sind in eurer Division optional.",
              },
              {
                value: "cartridge",
                title: "Cartridge",
                note: proofRequired
                  ? "Auf der Konsole gespielt, Video-Link erforderlich."
                  : "Auf der Konsole gespielt, Video-Link optional.",
              },
            ].map((option) => (
              // biome-ignore lint/a11y/noLabelWithoutControl: the RadioGroupItem is the control
              <label
                key={option.value}
                className="flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 px-4 text-left has-data-[state=checked]:border-brand-orange has-data-[state=checked]:bg-brand-orange/6"
              >
                <RadioGroupItem value={option.value} className="mt-0.5" />
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold text-brand-blue text-sm dark:text-white">
                    {option.title}
                  </span>
                  <span className="text-[12.5px] text-muted-foreground leading-snug">
                    {option.note}
                  </span>
                </span>
              </label>
            ))}
          </RadioGroup>
        </section>

        <section className="flex flex-col gap-3">
          <SectionHead
            title="Wer hat gewonnen?"
            meta="Best of 3, wer zuerst 2 Spiele gewinnt"
          />
          <div className="flex flex-col gap-2.5">
            {[0, 1, 2].map((i) => (
              <GameRow
                key={i}
                index={i}
                reporter={reporter}
                opponent={opponent}
                games={games}
                split={split}
                platform={platform}
                replay={replays[i]}
                proofRequired={proofRequired}
                onPick={(winnerId) => setGame(i, winnerId)}
                onReplay={(value) =>
                  setReplays((prev) => {
                    const next = [...prev];
                    next[i] = value;
                    return next;
                  })
                }
              />
            ))}
          </div>
        </section>

        {platform === "cartridge" ? (
          <section className="flex flex-col gap-3">
            <SectionHead
              title="Video"
              meta={proofRequired ? "Pflicht in eurer Division" : "Optional"}
            />
            <Input
              className="h-10.5"
              value={video}
              onChange={(e) => setVideo(e.target.value)}
              placeholder="z. B. YouTube-Link zur Aufnahme"
            />
          </section>
        ) : null}

        <section className="flex flex-col gap-3">
          <SectionHead title="Teamsheets" meta="Beide Teams, offen" />
          <p className="text-[13.5px] text-muted-foreground leading-relaxed">
            Ein Link zu Pokepaste oder VRPaste, oder der Export direkt aus
            Showdown über "Importieren". Wir prüfen jedes Teamsheet auf
            Vollständigkeit und legen davon eine eigene, offene Version an. Die
            Werte werden dabei entfernt.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TeamsheetField
              label="Dein Team"
              value={teamMine}
              onChange={setTeamMine}
              disabled={pending}
            />
            <TeamsheetField
              label={`Team von ${opponent.name}`}
              value={teamOpp}
              onChange={setTeamOpp}
              disabled={pending}
            />
          </div>
        </section>

        <div className="mt-11 flex items-baseline gap-2 border-t pt-5">
          <span className="text-[13.5px] text-muted-foreground">
            Match nicht zustande gekommen?
          </span>
          <button
            type="button"
            onClick={() => setView("free_win")}
            className="font-semibold text-brand-blue text-sm underline underline-offset-[3px] dark:text-white"
          >
            Freewin melden
          </button>
        </div>

        {error ? <p className="text-destructive text-sm">{error}</p> : null}
      </div>

      <StickyBar
        missing={missing}
        readback={readback}
        subline="Das Ergebnis ist nach dem Melden sofort final."
        buttonLabel="Ergebnis melden"
        pending={pending}
        onSubmit={submit}
      />
    </>
  );
}

// The accepted sheet as the server wants it. Only ever called once both slots
// are accepted, which the submit gate guarantees.
function sheetPayload(value: TeamsheetValue) {
  return {
    source: value.accepted?.source ?? "import",
    ots: value.accepted?.ots ?? "",
  };
}

function GameRow({
  index,
  reporter,
  opponent,
  games,
  split,
  platform,
  replay,
  proofRequired,
  onPick,
  onReplay,
}: {
  index: number;
  reporter: Identity;
  opponent: Identity;
  games: string[];
  split: boolean;
  platform: Platform | "";
  replay: string;
  proofRequired: boolean;
  onPick: (winnerId: string) => void;
  onReplay: (value: string) => void;
}) {
  const picked = games[index];
  // Game 3 only applies at 1:1; explain itself otherwise.
  if (index === 2 && !split) {
    const swept = games[0] !== "" && games[1] !== "" && games[0] === games[1];
    return (
      <div className="flex items-center gap-3.5 rounded-lg border p-3 px-3.5 opacity-55">
        <span className="w-[58px] shrink-0 whitespace-nowrap font-semibold text-muted-foreground text-xs uppercase tracking-[0.08em]">
          Spiel 3
        </span>
        <span className="flex h-10 items-center text-[13px] text-muted-foreground">
          {swept
            ? "Entfällt, die Serie ist mit 2:0 entschieden."
            : "Wird nur bei 1:1 nach zwei Spielen gespielt."}
        </span>
      </div>
    );
  }

  const segment = (p: Identity, isReporter: boolean) => (
    // biome-ignore lint/a11y/noStaticElementInteractions: segmented pick
    <button
      type="button"
      onClick={() => onPick(p.userId)}
      className={cn(
        "flex h-10 min-w-0 items-center justify-center gap-1 rounded-md border px-2 font-semibold text-sm",
        picked === p.userId && isReporter
          ? "border-brand-orange bg-brand-orange/12 text-brand-blue dark:text-white"
          : picked === p.userId
            ? "border-brand-blue bg-brand-blue/6 text-brand-blue dark:text-white"
            : "border-border bg-background text-muted-foreground",
      )}
    >
      <span className="truncate">{p.name}</span>
      {isReporter ? (
        <span className="shrink-0 font-medium opacity-65">· Du</span>
      ) : null}
    </button>
  );

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border p-3 px-3.5">
      <div className="flex items-center gap-3.5">
        <span className="w-[58px] shrink-0 whitespace-nowrap font-semibold text-muted-foreground text-xs uppercase tracking-[0.08em]">
          Spiel {index + 1}
        </span>
        <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
          {segment(reporter, true)}
          {segment(opponent, false)}
        </div>
      </div>
      {platform === "showdown" ? (
        <div className="flex items-center gap-2 pl-[72px]">
          <Input
            className="h-9.5 text-[13.5px]"
            value={replay}
            onChange={(e) => onReplay(e.target.value)}
            placeholder="https://replay.pokemonshowdown.com/…"
            autoComplete="off"
          />
          <span
            className={cn(
              "w-[60px] shrink-0 font-semibold text-xs",
              replay === ""
                ? "text-muted-foreground"
                : isReplayUrl(replay)
                  ? "text-[oklch(0.55_0.15_150)]"
                  : "text-[oklch(0.55_0.2_25)]",
            )}
          >
            {replay === ""
              ? proofRequired
                ? "Pflicht"
                : "optional"
              : isReplayUrl(replay)
                ? "✓"
                : "Link?"}
          </span>
        </div>
      ) : null}
    </div>
  );
}
