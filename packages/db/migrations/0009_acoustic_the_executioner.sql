CREATE TABLE "assessment_job" (
	"assessment_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp DEFAULT now() NOT NULL,
	"locked_at" timestamp,
	"token" text,
	CONSTRAINT "assessment_job_assessment_id_kind_pk" PRIMARY KEY("assessment_id","kind")
);
--> statement-breakpoint
ALTER TABLE "assessment_job" ADD CONSTRAINT "assessment_job_assessment_id_assessment_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_job" ADD CONSTRAINT "assessment_job_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;