import { schema } from "@impromptu/db";
import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, Deps } from "./app";

export type Speech = {
  speak(req: { text: string; voice: string }): Promise<{ audio: Uint8Array; contentType: string }>;
};

// Kenpath Svara through its OpenAI-compatible speech endpoint.
export const kenpathSpeech = (baseUrl: string, apiKey: string, model: string): Speech => ({
  async speak({ text, voice }) {
    const res = await fetch(`${baseUrl}/audio/speech`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model, input: text, voice, response_format: "mp3" }),
    });
    if (!res.ok) throw new Error(`Kenpath ${res.status}: ${await res.text()}`);
    return { audio: new Uint8Array(await res.arrayBuffer()), contentType: res.headers.get("content-type") ?? "audio/mpeg" };
  },
});

const { pronunciationClip: clip } = schema;

const query = z.object({
  text: z.string().trim().min(1).max(200),
  voice: z
    .string()
    .regex(/^[a-z0-9_-]{1,32}$/i)
    .default("alloy"),
});

export const pronunciation = ({ db, speech }: Deps) =>
  new Hono<AppEnv>().get("/", zValidator("query", query), async (c) => {
    const { text, voice } = c.req.valid("query");
    const audio = (a: { audio: Uint8Array; contentType: string }) =>
      c.body(a.audio as Uint8Array<ArrayBuffer>, 200, { "content-type": a.contentType, "cache-control": "private, max-age=86400" });

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
    await db.insert(clip).values({ text, voice, ...made }).onConflictDoNothing();
    return audio(made);
  });
