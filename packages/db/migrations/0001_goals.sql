CREATE TYPE "public"."goal_kind" AS ENUM('job_interview', 'client_communication', 'general_fluency');--> statement-breakpoint
CREATE TYPE "public"."goal_status" AS ENUM('proposed', 'confirmed');--> statement-breakpoint
CREATE TYPE "public"."usage_kind" AS ENUM('realtime', 'recording', 'text');--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" "usage_kind" NOT NULL,
	"call_id" text,
	"started_at" timestamp NOT NULL,
	"seconds" real DEFAULT 0 NOT NULL,
	"usage" jsonb
);
--> statement-breakpoint
CREATE TABLE "goal" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" "goal_kind" NOT NULL,
	"context_raw" text,
	"brief" text,
	"target_levels" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "goal_status" DEFAULT 'proposed' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal" ADD CONSTRAINT "goal_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;