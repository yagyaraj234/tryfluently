ALTER TABLE "skill_score" ADD COLUMN "seq" bigserial NOT NULL;--> statement-breakpoint
UPDATE "skill_score" s SET "seq" = r.n FROM (SELECT "id", row_number() OVER (ORDER BY "created_at", "id") AS n FROM "skill_score") r WHERE s."id" = r."id";
