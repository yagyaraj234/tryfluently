ALTER TYPE "public"."roleplay_kind" ADD VALUE 'presentation';--> statement-breakpoint
ALTER TYPE "public"."roleplay_kind" ADD VALUE 'team_meeting';--> statement-breakpoint
ALTER TYPE "public"."roleplay_kind" ADD VALUE 'phone_call';--> statement-breakpoint
ALTER TYPE "public"."roleplay_kind" ADD VALUE 'small_talk';--> statement-breakpoint
ALTER TYPE "public"."roleplay_kind" ADD VALUE 'custom';--> statement-breakpoint
ALTER TABLE "lesson" ADD COLUMN "roleplay_scenario" text;