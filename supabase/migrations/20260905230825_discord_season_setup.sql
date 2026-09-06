CREATE TYPE "public"."discord_season_resource_kind" AS ENUM('group_role', 'group_channel');--> statement-breakpoint
CREATE TABLE "discord_season_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"window_id" uuid NOT NULL,
	"sub_division_id" uuid NOT NULL,
	"kind" "discord_season_resource_kind" NOT NULL,
	"discord_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discord_season_resources_sub_division_id_kind_unique" UNIQUE("sub_division_id","kind")
);
--> statement-breakpoint
CREATE TABLE "discord_season_sync_state" (
	"window_id" uuid PRIMARY KEY NOT NULL,
	"ran_at" timestamp with time zone NOT NULL,
	"report" jsonb NOT NULL
);
