ALTER TABLE "user" ADD COLUMN "streak_reminders" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "streak_reminded_on" text;