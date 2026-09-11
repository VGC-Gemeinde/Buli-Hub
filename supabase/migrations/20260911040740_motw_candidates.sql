CREATE TYPE "public"."motw_role" AS ENUM('primary', 'backup');--> statement-breakpoint
ALTER TABLE "recording_holds" ADD COLUMN "motw_role" "motw_role";--> statement-breakpoint
CREATE UNIQUE INDEX "recording_holds_motw_primary_uq" ON "recording_holds" USING btree ("window_id","round") WHERE "recording_holds"."motw_role" = 'primary';