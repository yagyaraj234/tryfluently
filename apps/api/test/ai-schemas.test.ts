import { expect, test } from "bun:test";
import { z } from "zod";
import { questionsOutput } from "../src/lesson-blocks";
import { planOutput } from "../src/paged-lessons";

// OpenAI structured output rejects optional keys and `oneOf`; the Lesson was failing to write on both.
const strict = (schema: z.ZodType) => {
  const json = JSON.stringify(z.toJSONSchema(schema));
  expect(json).not.toContain("oneOf");
  const check = (node: any) => {
    if (node && typeof node === "object") {
      if (node.properties) expect(node.required ?? []).toEqual(expect.arrayContaining(Object.keys(node.properties)));
      Object.values(node).forEach(check);
    }
  };
  check(JSON.parse(json));
};

test("the Lesson plan schema is accepted by structured output", () => strict(planOutput));
test("the Lesson questions schema is accepted by structured output", () => strict(questionsOutput));
