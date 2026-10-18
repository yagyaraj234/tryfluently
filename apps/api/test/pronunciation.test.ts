import { describe, expect, test } from "bun:test";
import { fakeSpeech, get, makeApp, signUp } from "./helpers";

const hear = (text: string, voice?: string) =>
  `/api/pronunciation?${new URLSearchParams({ text, ...(voice ? { voice } : {}) })}`;

describe("reference pronunciation", () => {
  test("asking to hear a phrase returns its audio", async () => {
    const speech = fakeSpeech();
    const app = makeApp({ speech });
    const { cookie } = await signUp(app);
    const text = `I went to Pune last year ${crypto.randomUUID()}`;

    const res = await app.request(hear(text, "nova"), get(cookie));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    expect(await res.text()).toBe(`audio:nova:${text}`);
    expect(speech.calls).toEqual([{ text, voice: "nova" }]);
  });

  test("the same text and voice is served from the cache without calling Kenpath again, for any Learner", async () => {
    const speech = fakeSpeech();
    const app = makeApp({ speech });
    const asha = await signUp(app);
    const ravi = await signUp(app);
    const text = `excellent ${crypto.randomUUID()}`;

    await app.request(hear(text, "nova"), get(asha.cookie));
    const again = await app.request(hear(text, "nova"), get(ravi.cookie));
    expect(again.status).toBe(200);
    expect(again.headers.get("content-type")).toBe("audio/mpeg");
    expect(await again.text()).toBe(`audio:nova:${text}`);
    expect(speech.calls).toHaveLength(1);

    // A different voice is a different clip.
    await app.request(hear(text, "echo"), get(asha.cookie));
    expect(speech.calls).toHaveLength(2);
  });

  test("a cached clip is still found after a restart", async () => {
    const text = `articulate ${crypto.randomUUID()}`;
    const first = makeApp();
    const { cookie } = await signUp(first);
    await first.request(hear(text), get(cookie));

    const speech = fakeSpeech();
    const restarted = makeApp({ speech });
    expect((await restarted.request(hear(text), get(cookie))).status).toBe(200);
    expect(speech.calls).toHaveLength(0);
  });

  test("the default voice is used when none is given", async () => {
    const speech = fakeSpeech();
    const app = makeApp({ speech });
    const { cookie } = await signUp(app);

    await app.request(hear(`hello ${crypto.randomUUID()}`), get(cookie));
    expect(speech.calls[0]!.voice).toBe("alloy");
  });

  test("a missing default voice only disables Reference Pronunciation", async () => {
    const speech = fakeSpeech();
    const app = makeApp({ speech, env: { KENPATH_VOICE: undefined } });
    const { cookie } = await signUp(app);

    const res = await app.request(hear(`hello ${crypto.randomUUID()}`), get(cookie));
    expect(res.status).toBe(503);
    expect(speech.calls).toEqual([]);
  });

  test("hearing a phrase needs a session", async () => {
    const speech = fakeSpeech();
    const res = await makeApp({ speech }).request(hear("hello"));
    expect(res.status).toBe(401);
    expect(speech.calls).toHaveLength(0);
  });

  test("empty, overly long or odd input is refused without calling Kenpath", async () => {
    const speech = fakeSpeech();
    const app = makeApp({ speech });
    const { cookie } = await signUp(app);

    expect((await app.request(hear("   "), get(cookie))).status).toBe(400);
    expect((await app.request(hear("a".repeat(201)), get(cookie))).status).toBe(400);
    expect((await app.request(hear("hello", "../../etc"), get(cookie))).status).toBe(400);
    expect(speech.calls).toHaveLength(0);
  });

  test("if Kenpath fails the Learner gets a clear error and nothing is cached", async () => {
    let fail = true;
    const calls: unknown[] = [];
    const speech = {
      speak: async (req: { text: string; voice: string }) => {
        calls.push(req);
        if (fail) throw new Error("Kenpath is busy");
        return { audio: new Uint8Array([1, 2, 3]), contentType: "audio/mpeg" };
      },
    };
    const app = makeApp({ speech });
    const { cookie } = await signUp(app);
    const text = `resilient ${crypto.randomUUID()}`;

    expect((await app.request(hear(text), get(cookie))).status).toBe(502);
    fail = false;
    expect((await app.request(hear(text), get(cookie))).status).toBe(200);
    expect(calls).toHaveLength(2);
  });
});
