CREATE INDEX "ai_usage_user_kind_started_idx" ON "ai_usage" USING btree ("user_id","kind","started_at");--> statement-breakpoint
CREATE INDEX "lesson_user_idx" ON "lesson" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lesson_unit_position_idx" ON "lesson" USING btree ("unit_id","position");--> statement-breakpoint
CREATE INDEX "skill_score_user_skill_seq_idx" ON "skill_score" USING btree ("user_id","skill","seq");--> statement-breakpoint
CREATE INDEX "step_lesson_position_idx" ON "step" USING btree ("lesson_id","position");--> statement-breakpoint
CREATE INDEX "unit_user_position_idx" ON "unit" USING btree ("user_id","position");