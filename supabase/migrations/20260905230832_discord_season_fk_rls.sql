-- FKs + RLS for the Discord season setup tables. Server-only (RLS on, no
-- policies), like discord_posts. Tracked resources die with their season's
-- sub-division (and window); deleting the Discord objects themselves is the
-- cleanup feature's job. See docs/plans/discord-season-setup.md.

ALTER TABLE "discord_season_resources"
  ADD CONSTRAINT "discord_season_resources_window_id_fk"
  FOREIGN KEY ("window_id") REFERENCES "registration_windows" (id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "discord_season_resources"
  ADD CONSTRAINT "discord_season_resources_sub_division_id_fk"
  FOREIGN KEY ("sub_division_id") REFERENCES "sub_divisions" (id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "discord_season_resources" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "discord_season_sync_state"
  ADD CONSTRAINT "discord_season_sync_state_window_id_fk"
  FOREIGN KEY ("window_id") REFERENCES "registration_windows" (id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "discord_season_sync_state" ENABLE ROW LEVEL SECURITY;
