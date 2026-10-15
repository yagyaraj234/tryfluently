CREATE TYPE "public"."unit_status" AS ENUM('planned', 'active', 'mastered', 'skipped');--> statement-breakpoint
CREATE TABLE "unit" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"objective" text NOT NULL,
	"skills" jsonb NOT NULL,
	"ends_with_roleplay" boolean DEFAULT false NOT NULL,
	"status" "unit_status" DEFAULT 'planned' NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "unit" ADD CONSTRAINT "unit_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;