CREATE TYPE "public"."analysis_job_status" AS ENUM('queued', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TABLE "analysis_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"puuid" text NOT NULL,
	"match_id" text NOT NULL,
	"status" "analysis_job_status" DEFAULT 'queued' NOT NULL,
	"contract_version" integer NOT NULL,
	"prompt_version" integer NOT NULL,
	"model_digest" text,
	"prompt" text,
	"report" jsonb,
	"error" text,
	"token_usage" jsonb,
	"timings" jsonb,
	"retries" integer,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "analysis_jobs" ADD CONSTRAINT "analysis_jobs_puuid_match_id_matches_puuid_match_id_fk" FOREIGN KEY ("puuid","match_id") REFERENCES "public"."matches"("puuid","match_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_jobs_dedupe" ON "analysis_jobs" USING btree ("puuid","match_id","contract_version","prompt_version");--> statement-breakpoint
CREATE INDEX "analysis_jobs_claim" ON "analysis_jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "analysis_jobs_finished" ON "analysis_jobs" USING btree ("finished_at");