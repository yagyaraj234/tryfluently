CREATE TYPE "public"."assessment_mode" AS ENUM('voice', 'written');--> statement-breakpoint
CREATE TYPE "public"."assessment_status" AS ENUM('in_progress', 'completed', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."focus_kind" AS ENUM('grammar', 'vocabulary', 'phrase');--> statement-breakpoint
CREATE TYPE "public"."focus_source" AS ENUM('assessment', 'debrief', 'lesson');--> statement-breakpoint
CREATE TYPE "public"."focus_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."score_source" AS ENUM('assessment', 'lesson');--> statement-breakpoint
CREATE TYPE "public"."skill" AS ENUM('fluency', 'grammar', 'vocabulary');--> statement-breakpoint
CREATE TABLE "assessment" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"mode" "assessment_mode" NOT NULL,
	"status" "assessment_status" DEFAULT 'in_progress' NOT NULL,
	"started_at" timestamp NOT NULL,
	"ended_at" timestamp,
	"transcript" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"report" jsonb,
	"emailed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "focus_item" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"label" text NOT NULL,
	"kind" "focus_kind" NOT NULL,
	"source" "focus_source" NOT NULL,
	"source_id" text NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	"status" "focus_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp NOT NULL,
	"closed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "skill_score" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"skill" "skill" NOT NULL,
	"score" real NOT NULL,
	"source" "score_source" NOT NULL,
	"source_id" text NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "focus_item" ADD CONSTRAINT "focus_item_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_score" ADD CONSTRAINT "skill_score_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;