import { schema } from "@impromptu/db";
import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import OpenAI from "openai";
import { z } from "zod";
import type { AppEnv, Deps } from "./app";

export type Speech = {
  speak(req: { text: string; voice: string }): Promise<{ audio: Uint8Array; contentType: string }>;
};

// Kenpath Svara through its OpenAI-compatible speech endpoint.
export const kenpathSpeech = (baseUrl: string, apiKey: string, model: string): Speech => ({
  async speak({ text, voice }) {
    const client = new OpenAI({ apiKey, baseURL: baseUrl });
    const audio = await client.audio.speech.create({ model, input: text, voice, response_format: "mp3" });
    return { audio: new Uint8Array(await audio.arrayBuffer()), contentType: "audio/mpeg" };
  },
});

const { pronunciationClip: clip } = schema;

const query = (defaultVoice: string) =>
  z.object({
    text: z.string().trim().min(1).max(200),
    voice: z
      .string()
      .regex(/^[a-z0-9_-]{1,32}$/i)
      .default(defaultVoice),
  });

export const pronunciation = ({ db, speech }: Deps, defaultVoice?: string) => {
  const route = new Hono<AppEnv>();
  if (!defaultVoice)
    return route.get("/", (c) => c.json({ error: "Reference Pronunciation needs KENPATH_VOICE configured." }, 503));
  return route.get("/", zValidator("query", query(defaultVoice)), async (c) => {
    const { text, voice } = c.req.valid("query");
    const audio = (a: { audio: Uint8Array; contentType: string }) =>
      c.body(a.audio as Uint8Array<ArrayBuffer>, 200, {
        "content-type": a.contentType,
        "cache-control": "private, max-age=86400",
      });

    const [cached] = await db
      .select()
      .from(clip)
      .where(and(eq(clip.text, text), eq(clip.voice, voice)));
    if (cached) return audio(cached);

    // ponytail: two first requests for the same clip at once both call Kenpath; dedupe in flight if the free tier's 2 streams bite.
    let made: Awaited<ReturnType<Speech["speak"]>>;
    try {
      made = await speech.speak({ text, voice });
    } catch (e) {
      console.error("Reference Pronunciation failed", e);
      return c.json({ error: "The audio couldn't be made right now. Try again." }, 502);
    }
    await db
      .insert(clip)
      .values({ text, voice, ...made })
      .onConflictDoNothing();
    return audio(made);
  });
};
