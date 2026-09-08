CREATE TABLE "recording_holds" (
	"match_id" uuid PRIMARY KEY NOT NULL,
	"window_id" uuid NOT NULL,
	"round" integer NOT NULL,
	"held_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
