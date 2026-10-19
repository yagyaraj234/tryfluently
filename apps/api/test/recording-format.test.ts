import { expect, spyOn, test } from "bun:test";
import { learnerWithLegacyRoadmap, lessonPlan } from "./fixtures";
import { json, makeApp, mockModel, WEB_ORIGIN } from "./helpers";
import { openaiTranscriber } from "../src/recordings";

test.each([
  ["audio/mpeg", "answer.mp3"],
  ["audio/mp4; codecs=mp4a.40.2", "answer.m4a"],
  ["audio/webm; codecs=opus", "answer.webm"],
])("%s answers reach transcription with the matching filename", async (type, filename) => {
  const { cookie } = await learnerWithLegacyRoadmap();
  const app = makeApp({ models: { step: mockModel(lessonPlan()) }, transcriber: openaiTranscriber("test-key") });
  const lesson = (await (await app.request("/api/lessons/next", json({}, cookie))).json()) as any;
  const provider = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async (input: any, init: any) => {
        expect(String(input)).toBe("https://api.openai.com/v1/audio/transcriptions");
        const sent = await new Request(String(input), { method: "POST", body: init.body }).formData();
        const audio = sent.get("file") as File;
        expect(audio.name).toBe(filename);
        return Response.json({ text: "Yesterday I built an application." });
      },
      { preconnect: fetch.preconnect },
    ),
  );
  try {
    const form = new FormData();
    form.append(
      "audio",
      new File([new Uint8Array([255, 243, 196, 196])], `recording.${filename.split(".").at(-1)}`, { type }),
    );
    form.append("seconds", "5");
    const response = await app.request(`/api/lessons/${lesson.id}/recordings`, {
      method: "POST",
      headers: { cookie, origin: WEB_ORIGIN },
      body: form,
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ text: "Yesterday I built an application." });
  } finally {
    provider.mockRestore();
  }
});
