CREATE TABLE "learner_memory" (
	"user_id" text PRIMARY KEY NOT NULL,
	"summary" text NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lesson" ALTER COLUMN "started_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "lesson" ADD COLUMN "preparation" text;--> statement-breakpoint
ALTER TABLE "lesson" ADD COLUMN "preparation_token" text;--> statement-breakpoint
ALTER TABLE "lesson" ADD COLUMN "preparation_at" timestamp;--> statement-breakpoint
ALTER TABLE "lesson" ADD COLUMN "material" jsonb;--> statement-breakpoint
ALTER TABLE "lesson" ADD COLUMN "phase" text;--> statement-breakpoint
ALTER TABLE "lesson" ADD COLUMN "report" jsonb;--> statement-breakpoint
ALTER TABLE "learner_memory" ADD CONSTRAINT "learner_memory_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;