import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { ProfileHeader } from "@/features/profile/components/profile-header";
import { SettingsForm } from "@/features/profile/components/settings-form";
import { getProfile } from "@/features/profile/queries";
import { currentUser } from "@/features/roles/guard";
import { roleLabel } from "@/features/roles/roles";
import { latestWindow } from "@/features/staff/queries";
import { StreamPhotoCard } from "@/features/stream-photos/components/stream-photo-card";
import {
  showStreamPhotoCard,
  streamPhotoUrl,
} from "@/features/stream-photos/photo";
import { streamRelevanceOf } from "@/features/stream-photos/queries";

export default async function ProfilPage() {
  const current = await currentUser();
  if (!current) {
    redirect("/");
  }

  const profile = await getProfile(current.userId);

  // The stream photo is only asked of the players the stream is about to
  // show: the Match of the Week and the matches staff record. Anyone who
  // already has one keeps the card, so they can swap or delete it later.
  const window = await latestWindow();
  const relevance = window
    ? await streamRelevanceOf(current.userId, window.id)
    : { isMotwPlayer: false, isRecordedPlayer: false };
  const photoUrl = streamPhotoUrl(profile?.streamPhotoPath ?? null);
  const showPhotoCard = showStreamPhotoCard({
    ...relevance,
    hasPhoto: photoUrl !== null,
  });

  const initial = {
    twitterHandle: profile?.twitterHandle ?? "",
    blueskyHandle: profile?.blueskyHandle ?? "",
    origin: profile?.origin ?? null,
    hasCaptureCard: profile?.hasCaptureCard ?? false,
  };

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[640px] flex-1 px-6 py-12 sm:px-8">
        <ProfileHeader
          displayName={current.displayName}
          username={current.username}
          avatarUrl={current.avatarUrl}
          roleLabel={roleLabel(current.role)}
        />
        <div className="mt-11">
          <SettingsForm initial={initial} />
        </div>
        {showPhotoCard ? (
          <div className="mt-11">
            <StreamPhotoCard photoUrl={photoUrl} />
          </div>
        ) : null}
      </main>
    </div>
  );
}
