ALTER TYPE "public"."lesson_status" ADD VALUE 'skipped';--> statement-breakpoint
CREATE TABLE "billing_account" (
	"user_id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"deleting" boolean DEFAULT false NOT NULL,
	CONSTRAINT "billing_account_customerId_unique" UNIQUE("customer_id")
);
--> statement-breakpoint
CREATE TABLE "billing_checkout" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"session_id" text,
	"url" text,
	"created_at" timestamp NOT NULL,
	"completed_at" timestamp,
	CONSTRAINT "billing_checkout_sessionId_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "billing_credit" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"subscription_id" text,
	"starts_at" timestamp NOT NULL,
	"expires_at" timestamp,
	"seconds" integer NOT NULL,
	"used_seconds" double precision DEFAULT 0 NOT NULL,
	"revoked_seconds" double precision DEFAULT 0 NOT NULL,
	"amount" integer NOT NULL,
	"currency" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"status" text NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"next_billing_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_webhook" (
	"id" text PRIMARY KEY NOT NULL,
	"processed_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_allowance" (
	"user_id" text PRIMARY KEY NOT NULL,
	"resets_at" timestamp NOT NULL,
	"used" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "streak_restoration" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"days" jsonb NOT NULL,
	"restored_at" timestamp NOT NULL,
	"next_available_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_reservation" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"started_at" timestamp NOT NULL,
	"ends_at" timestamp NOT NULL,
	"call_id" text,
	"confirmed_seconds" double precision DEFAULT 0 NOT NULL,
	"free_seconds" double precision NOT NULL,
	"allocations" jsonb NOT NULL,
	"settled_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "billing_account" ADD CONSTRAINT "billing_account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_checkout" ADD CONSTRAINT "billing_checkout_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_credit" ADD CONSTRAINT "billing_credit_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_subscription" ADD CONSTRAINT "billing_subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_allowance" ADD CONSTRAINT "lesson_allowance_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streak_restoration" ADD CONSTRAINT "streak_restoration_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_reservation" ADD CONSTRAINT "voice_reservation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_credit_user_idx" ON "billing_credit" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "streak_restoration_user_idx" ON "streak_restoration" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "voice_reservation_one_open_idx" ON "voice_reservation" USING btree ("user_id") WHERE "voice_reservation"."settled_at" is null;
