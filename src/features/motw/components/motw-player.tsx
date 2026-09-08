import { CircleHelp, Video, VideoOff } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PlayerLink } from "@/features/player-profile/components/player-link";
import { StreamPhotoMark } from "@/features/stream-photos/components/stream-photo-mark";
import { cn } from "@/lib/utils";
import type { MotwPlayer } from "../motw";

// The player side of a MotW matchup, shared by the picker rows and the pick
// panel — the same broadcast anatomy as the public billboard: avatars on the
// outside, names meeting at the centered "vs.".
//
// `side` is the half of the row the player occupies. Everything mirrors around
// the centre, so the placement chip always sits nearest the middle on both
// sides and scans straight down a long list. Below `sm` the row stacks and the
// mirroring drops away — two left-aligned lines read better on a phone.

// Capture card as a shape difference, not a color one: a camera that is there
// or crossed out. The label carries it for screen readers and on hover.
export function CaptureCardMark({
  player,
  size = "sm",
}: {
  player: MotwPlayer;
  size?: "sm" | "lg";
}) {
  // An untouched profile is "unknown", not "no": `hasCaptureCard` defaults to
  // false, so a player who never saved their settings would otherwise look like
  // they answered the question. Staff can then ask instead of skipping them.
  const state = player.hasCaptureCard
    ? "yes"
    : player.profileEdited
      ? "no"
      : "unknown";
  const { Icon, label, tone } = {
    yes: {
      Icon: Video,
      label: "Capture Card vorhanden",
      tone: "text-brand-orange",
    },
    no: {
      Icon: VideoOff,
      label: "Keine Capture Card",
      tone: "text-muted-foreground/50",
    },
    unknown: {
      Icon: CircleHelp,
      label: "Profil nie ausgefüllt, Capture Card unbekannt",
      tone: "text-[#9a4b00] dark:text-brand-orange",
    },
  }[state];
  return (
    <span role="img" aria-label={label} title={label} className="flex">
      <Icon
        aria-hidden
        className={cn(
          "shrink-0",
          size === "lg" ? "size-5" : "size-[18px]",
          tone,
        )}
      />
    </span>
  );
}

// "#2 4–1 📹" — placement first and boxed, because that is what the pick is
// judged on at a glance; the match record follows, quieter. Deliberately no
// game differential: it is table detail that does not change which matchup is
// worth featuring, and it crowded the line.
function PlayerFormLine({
  player,
  side,
  size,
}: {
  player: MotwPlayer;
  side: "left" | "right";
  size: "sm" | "lg";
}) {
  const text = size === "lg" ? "text-[16px]" : "text-[15px]";
  return (
    <span
      className={cn(
        "flex items-center gap-2",
        side === "left" && "sm:flex-row-reverse",
      )}
    >
      {player.rank === null ? (
        <span
          title="Noch keine Platzierung"
          className={cn(
            "rounded-md bg-muted px-2 py-0.5 font-bold text-muted-foreground leading-tight",
            text,
          )}
        >
          —
        </span>
      ) : (
        <span
          title={`Platz ${player.rank}`}
          className={cn(
            "rounded-md bg-muted px-2 py-0.5 font-bold leading-tight tabular-nums",
            text,
          )}
        >
          #{player.rank}
        </span>
      )}
      <span
        title="Bilanz: Siege–Niederlagen"
        className={cn(
          "whitespace-nowrap font-semibold text-foreground/70 leading-tight tabular-nums",
          text,
        )}
      >
        {player.wins}–{player.losses}
      </span>
      <CaptureCardMark player={player} size={size} />
      {/* Two different questions, side by side: can this match be recorded,
          and does the stream have a picture of this player. */}
      <StreamPhotoMark photoUrl={player.streamPhotoUrl} name={player.name} />
    </span>
  );
}

// `size="lg"` is the pick panel's treatment (condensed uppercase name, like the
// billboard), `"sm"` the picker row's.
export function MotwSide({
  player,
  side,
  size = "sm",
  linkName = false,
}: {
  player: MotwPlayer;
  side: "left" | "right";
  size?: "sm" | "lg";
  linkName?: boolean;
}) {
  const nameClass = cn(
    "min-w-0 break-words",
    size === "lg"
      ? "font-bold font-heading text-[19px] text-brand-blue uppercase leading-[1.1] tracking-[0.02em] sm:text-[22px] dark:text-white"
      : "font-semibold text-[16px] leading-tight",
    player.dropped && "text-muted-foreground line-through",
  );

  const avatar = (
    <Avatar className={cn("shrink-0", size === "lg" ? "size-11" : "size-8")}>
      {player.avatarUrl ? <AvatarImage src={player.avatarUrl} alt="" /> : null}
      <AvatarFallback
        className={cn(
          "font-semibold",
          size === "lg" ? "text-[13px]" : "text-[11px]",
        )}
      >
        {player.name.slice(0, 2).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );

  const text = (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1",
        side === "left" && "sm:items-end",
      )}
    >
      {linkName ? (
        <PlayerLink
          userId={player.userId}
          name={player.name}
          className={nameClass}
        />
      ) : (
        <span className={nameClass}>{player.name}</span>
      )}
      <PlayerFormLine player={player} side={side} size={size} />
    </div>
  );

  return (
    <div
      className={cn(
        // `justify-between` is what pins the avatar to the outer edge and lets
        // the name drift to the centre when it is short.
        "flex min-w-0 items-center gap-2.5 sm:justify-between",
        size === "lg" && "gap-3.5",
        // Player B keeps its avatar last so it lands on the row's right edge.
        side === "right" && "sm:flex-row-reverse",
      )}
    >
      {avatar}
      {text}
    </div>
  );
}
