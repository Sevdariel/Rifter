CREATE TYPE "public"."data_tier" AS ENUM('basic', 'full');--> statement-breakpoint
CREATE TYPE "public"."report_locale" AS ENUM('pl', 'en');--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"puuid" text NOT NULL,
	"match_id" text NOT NULL,
	"report" jsonb NOT NULL,
	"contract_version" integer NOT NULL,
	"prompt_version" integer NOT NULL,
	"model_digest" text,
	"data_tier" "data_tier" NOT NULL,
	"locale" "report_locale" NOT NULL,
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_puuid_match_id_matches_puuid_match_id_fk" FOREIGN KEY ("puuid","match_id") REFERENCES "public"."matches"("puuid","match_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reports_match" ON "reports" USING btree ("puuid","match_id");--> statement-breakpoint
CREATE INDEX "reports_list" ON "reports" USING btree ("puuid","updated_at");