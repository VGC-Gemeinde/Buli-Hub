import { cookies } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { Tick } from "@/components/tick";
import { Button } from "@/components/ui/button";
import { SignInButton } from "@/features/auth/components/sign-in-button";
import {
  parseSignInErrorKind,
  SIGN_IN_ERROR_COPY,
} from "@/features/auth/sign-in-error";
import { PublicLeague } from "@/features/public-league/components/public-league";
import { publicLeagueOverview } from "@/features/public-league/queries";
import { currentUser } from "@/features/roles/guard";
import { roleAtLeast } from "@/features/roles/roles";
import { currentSeason } from "@/features/season/season-status";
import {
  parseSpoilersOff,
  SPOILERS_OFF_COOKIE,
} from "@/features/spoilers/spoilers";
import { germanToday } from "@/lib/german-time";
import { createClient } from "@/lib/supabase/server";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ auth_error?: string }>;
}) {
  const { auth_error } = await searchParams;
  const signInError = parseSignInErrorKind(auth_error);

  // The landing page becomes the public league overview while a season runs.
  const { window, phase } = await currentSeason();

  if (phase === "regular_season" && window) {
    const today = germanToday();
    const [current, cookieStore] = await Promise.all([
      currentUser(),
      cookies(),
    ]);
    // The viewer decides whether an embargoed MotW result is included.
    const overview = await publicLeagueOverview(
      window.id,
      window.seasonNumber,
      today,
      {
        userId: current?.userId ?? null,
        isStaff: current !== null && roleAtLeast(current.role, "staff"),
      },
    );
    const spoilersOff = parseSpoilersOff(
      cookieStore.get(SPOILERS_OFF_COOKIE)?.value,
    );
    return (
      <div className="flex flex-1 flex-col">
        <SiteHeader />
        <PublicLeague
          overview={overview}
          meId={current?.userId ?? ""}
          initialSpoilersOff={spoilersOff}
        />
      </div>
    );
  }

  // Otherwise: the pre-/inter-season landing (anon sign-in / logged-in CTA).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <SiteHeader className="relative z-10 shrink-0" />
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 text-center sm:px-12">
        {/* One hero for both auth states: the logo and h1 are constant; only
            the CTA block below the h1 swaps (DESIGN.md §4.6). */}
        <Image
          src="/logo.svg"
          alt=""
          width={148}
          height={102}
          className="mb-9 rounded-2xl shadow-xl"
        />
        <h1 className="mb-9 text-5xl text-brand-blue leading-[1.05] sm:text-[68px] dark:text-white">
          VGC Bundesliga
        </h1>
        {user ? (
          <>
            <p className="-mt-3 mb-7 max-w-[440px] text-[17px] text-muted-foreground leading-[1.55]">
              Deine Gruppe, dein Spielplan und deine nächste Paarung: alles im
              Spieler-Dashboard.
            </p>
            <Button asChild size="lg">
              <Link href="/spieler">Zum Spieler-Dashboard</Link>
            </Button>
          </>
        ) : (
          <>
            <SignInButton size="lg" />
            {signInError ? (
              <p className="mt-5 max-w-[440px] text-destructive text-sm">
                {SIGN_IN_ERROR_COPY[signInError]}
              </p>
            ) : null}
          </>
        )}
      </main>
      <div className="absolute inset-x-0 bottom-[26px] z-10 flex items-center justify-center gap-3">
        <Tick size="m" />
        <span className="font-semibold text-[13px] text-muted-foreground uppercase tracking-[0.16em]">
          Ausgerichtet von der VGC Gemeinde
        </span>
        <Tick size="m" />
      </div>
      {/* biome-ignore lint/performance/noImgElement: decorative watermark; next/image adds nothing for a local SVG */}
      <img
        src="/logo.svg"
        alt=""
        aria-hidden
        className="pointer-events-none absolute -right-24 -bottom-28 z-0 w-[560px] -rotate-[10deg] rounded-[48px] opacity-5 dark:opacity-[0.06]"
      />
    </div>
  );
}
