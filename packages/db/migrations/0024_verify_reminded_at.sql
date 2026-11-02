ALTER TABLE "user" ADD COLUMN "verify_reminders" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "verify_reminded_at" timestamp;