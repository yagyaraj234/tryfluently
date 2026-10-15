CREATE TABLE "pronunciation_clip" (
	"text" text NOT NULL,
	"voice" text NOT NULL,
	"audio" "bytea" NOT NULL,
	"content_type" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pronunciation_clip_text_voice_pk" PRIMARY KEY("text","voice")
);
