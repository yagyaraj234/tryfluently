CREATE TYPE "public"."lesson_kind" AS ENUM('practice', 'roleplay');--> statement-breakpoint
CREATE TYPE "public"."lesson_status" AS ENUM('in_progress', 'completed', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."roleplay_kind" AS ENUM('mock_interview', 'client_call');--> statement-breakpoint
CREATE TYPE "public"."step_mode" AS ENUM('voice', 'text');--> statement-breakpoint
CREATE TYPE "public"."step_type" AS ENUM('vocabCard', 'fillGap', 'rewrite', 'speakPrompt', 'roleplayTurn');--> statement-breakpoint
CREATE TYPE "public"."tone" AS ENUM('friendly', 'standard', 'tough');--> statement-breakpoint
CREATE TABLE "lesson" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"unit_id" text,
	"position" integer NOT NULL,
	"kind" "lesson_kind" NOT NULL,
	"title" text NOT NULL,
	"objective" text NOT NULL,
	"roleplay_kind" "roleplay_kind",
	"tone" "tone",
	"status" "lesson_status" DEFAULT 'in_progress' NOT NULL,
	"objective_progress" integer,
	"summary" text,
	"text_mode" boolean DEFAULT false NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"debrief" jsonb,
	"started_at" timestamp NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "step" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"lesson_id" text NOT NULL,
	"position" integer NOT NULL,
	"type" "step_type" NOT NULL,
	"mode" "step_mode" DEFAULT 'text' NOT NULL,
	"input" jsonb NOT NULL,
	"output" jsonb,
	"feedback" jsonb,
	"timing" jsonb,
	"answered_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "lesson" ADD CONSTRAINT "lesson_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson" ADD CONSTRAINT "lesson_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step" ADD CONSTRAINT "step_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step" ADD CONSTRAINT "step_lesson_id_lesson_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lesson"("id") ON DELETE cascade ON UPDATE no action;