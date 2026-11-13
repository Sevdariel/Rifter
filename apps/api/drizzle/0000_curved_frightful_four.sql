CREATE TABLE "matches" (
	"puuid" text NOT NULL,
	"match_id" text NOT NULL,
	"queue_id" integer NOT NULL,
	"game_creation_ms" bigint,
	"game_duration_sec" integer,
	"match" jsonb NOT NULL,
	"timeline" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "matches_puuid_match_id_pk" PRIMARY KEY("puuid","match_id")
);
