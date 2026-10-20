ALTER TABLE "skill_score" ADD COLUMN "sequence" bigserial NOT NULL;--> statement-breakpoint
-- Preserve historical order before new scores start using write order.
WITH ordered AS (
  SELECT "id", row_number() OVER (ORDER BY "created_at", "id") AS ordinal FROM "skill_score"
)
UPDATE "skill_score" SET "sequence" = ordered.ordinal FROM ordered WHERE "skill_score"."id" = ordered."id";--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('skill_score', 'sequence'), COALESCE(max("sequence"), 1), max("sequence") IS NOT NULL) FROM "skill_score";--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_usage_user_kind_started_idx" ON "ai_usage" USING btree ("user_id","kind","started_at");--> statement-breakpoint
CREATE INDEX "assessment_user_status_ended_idx" ON "assessment" USING btree ("user_id","status","ended_at");--> statement-breakpoint
CREATE INDEX "assessment_job_user_kind_status_idx" ON "assessment_job" USING btree ("user_id","kind","status");--> statement-breakpoint
CREATE INDEX "focus_item_user_status_idx" ON "focus_item" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "goal_user_idx" ON "goal" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lesson_user_idx" ON "lesson" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lesson_unit_position_idx" ON "lesson" USING btree ("unit_id","position");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "skill_score_user_skill_sequence_idx" ON "skill_score" USING btree ("user_id","skill","sequence");--> statement-breakpoint
CREATE INDEX "step_lesson_position_idx" ON "step" USING btree ("lesson_id","position");--> statement-breakpoint
CREATE INDEX "step_user_answered_idx" ON "step" USING btree ("user_id","answered_at");--> statement-breakpoint
CREATE INDEX "unit_user_position_idx" ON "unit" USING btree ("user_id","position");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");
