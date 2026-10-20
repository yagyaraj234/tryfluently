ALTER TABLE "assessment_job" DROP CONSTRAINT "assessment_job_assessment_id_kind_pk";--> statement-breakpoint
ALTER TABLE "assessment_job" ALTER COLUMN "assessment_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "assessment_job" ADD COLUMN "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL;--> statement-breakpoint
ALTER TABLE "assessment_job" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "assessment_job" ADD COLUMN "lesson_id" text;--> statement-breakpoint
ALTER TABLE "lesson" ADD COLUMN "content_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "lesson" ADD COLUMN "current_page" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lesson" ADD COLUMN "page_status" jsonb;--> statement-breakpoint
ALTER TABLE "assessment_job" ADD CONSTRAINT "assessment_job_lesson_id_lesson_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lesson"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_job_assessment_kind_idx" ON "assessment_job" USING btree ("assessment_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_job_lesson_kind_idx" ON "assessment_job" USING btree ("lesson_id","kind");