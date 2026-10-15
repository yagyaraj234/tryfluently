import { expect, test } from "bun:test";
import { modelsFromSettings } from "../src/models";

test("each AI job's model comes from a setting, so providers can be swapped without code changes", () => {
  const models = modelsFromSettings({
    OPENAI_API_KEY: "sk-test",
    GOOGLE_GENERATIVE_AI_API_KEY: "g-test",
    MODEL_STEP: "openai:gpt-5-mini",
    MODEL_BRIEF: "google:gemini-2.5-pro",
    MODEL_ROADMAP: "openai:gpt-5",
    MODEL_JUDGE: "openai:gpt-5",
    MODEL_REPORT: "google:gemini-2.5-pro",
  });
  expect(models.step).toMatchObject({ modelId: "gpt-5-mini" });
  expect(models.brief).toMatchObject({ modelId: "gemini-2.5-pro", provider: expect.stringContaining("google") });
});

test("a missing model setting fails at start-up", () => {
  expect(() => modelsFromSettings({ MODEL_STEP: "openai:gpt-5-mini" })).toThrow("MODEL_BRIEF");
});
