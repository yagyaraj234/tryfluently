import { schema, type Db } from "@fluently/db";
import { and, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { localDay } from "./progress";

export type Transcriber = { transcribe(audio: Blob): Promise<{ text: string }> };

// gpt-4o-transcribe through OpenAI's transcriptions endpoint. The audio is passed through and never kept.
export const openaiTranscriber = (apiKey: string): Transcriber => ({
  async transcribe(audio) {
    const form = new FormData();
    const extensions: Record<string, string> = {
      "audio/mpeg": "mp3",
      "audio/mp4": "m4a",
      "audio/x-m4a": "m4a",
      "video/mp4": "mp4",
      "audio/ogg": "ogg",
      "audio/wav": "wav",
    };
    const extension = extensions[audio.type.split(";")[0]!] ?? "webm";
    form.append("file", audio, `answer.${extension}`);
    form.append("model", "gpt-4o-transcribe");
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      signal: AbortSignal.timeout(30_000),
      headers: { authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!res.ok) throw new Error(`Transcription ${res.status}: ${await res.text()}`);
    return { text: ((await res.json()) as { text: string }).text };
  },
});

// ponytail: the length comes from the browser's recorder, since gpt-4o-transcribe returns no duration;
// it's bounded per clip here. Measure it on the server (e.g. ffprobe) if the daily cap gets gamed.
export const recordingForm = z.object({
  audio: z.instanceof(File).refine((f) => f.size > 0 && f.size <= 5_000_000, "Audio must be under 5 MB"),
  seconds: z.coerce.number().positive().max(180),
});

export type Timing = { seconds: number; words: number; wpm: number };

export function timingOf(text: string, seconds: number): Timing {
  const words = text.split(/\s+/).filter(Boolean).length;
  return { seconds, words, wpm: Math.round((words / seconds) * 600) / 10 };
}

const { aiUsage } = schema;

// Seconds recorded today in the Learner's timezone.
export async function recordedSecondsToday(db: Db, user: { id: string; timezone: string }, now: Date) {
  const rows = await db
    .select({ startedAt: aiUsage.startedAt, seconds: aiUsage.seconds })
    .from(aiUsage)
    .where(
      and(
        eq(aiUsage.userId, user.id),
        eq(aiUsage.kind, "recording"),
        gte(aiUsage.startedAt, new Date(now.getTime() - 2 * 86_400_000)),
      ),
    );
  const today = localDay(now, user.timezone);
  return rows.filter((r) => localDay(r.startedAt, user.timezone) === today).reduce((sum, r) => sum + r.seconds, 0);
}

// A recording's transcript is kept on its ai_usage row, so a voice answer can only point at what the server transcribed.
export async function findRecording(db: Db, userId: string, lessonId: string, recordingId: string) {
  const [row] = await db
    .select({ usage: aiUsage.usage })
    .from(aiUsage)
    .where(
      and(
        eq(aiUsage.userId, userId),
        eq(aiUsage.kind, "recording"),
        eq(aiUsage.callId, recordingId),
        sql`${aiUsage.usage}->>'lessonId' = ${lessonId}`,
      ),
    );
  return row?.usage as { text: string; timing: Timing } | undefined;
}
