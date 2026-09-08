-- FKs + RLS for recording holds. Server-only (RLS on, no policies), like
-- discord_posts. A hold dies with its match and its season; the staff member
-- who set it references auth.users. See docs/plans/recording-holds.md.

ALTER TABLE "recording_holds"
  ADD CONSTRAINT "recording_holds_match_id_fk"
  FOREIGN KEY ("match_id") REFERENCES "matches" (id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recording_holds"
  ADD CONSTRAINT "recording_holds_window_id_fk"
  FOREIGN KEY ("window_id") REFERENCES "registration_windows" (id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recording_holds"
  ADD CONSTRAINT "recording_holds_held_by_id_fk"
  FOREIGN KEY ("held_by_id") REFERENCES auth.users (id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "recording_holds" ENABLE ROW LEVEL SECURITY;
