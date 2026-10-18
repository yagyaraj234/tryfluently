import { expect, test } from "bun:test";
import { reportOutput } from "../src/assessments";
import { debriefOutput, judgeOutput } from "../src/completion";
import { planOutput } from "../src/lessons";
import { revisionOutput, roadmapOutput } from "../src/roadmap";
import { z } from "zod";

const outputSchemas = [reportOutput, judgeOutput, debriefOutput, planOutput, roadmapOutput, revisionOutput];

function everyObjectRequiresItsProperties(schema: any): boolean {
  if (schema.type === "object" && !Object.keys(schema.properties ?? {}).every((key) => schema.required?.includes(key))) return false;
  return Object.values(schema).every((value) => Array.isArray(value) ? value.every(everyObjectRequiresItsProperties) : value && typeof value === "object" ? everyObjectRequiresItsProperties(value) : true);
}

test("all LLM output schemas satisfy OpenAI strict JSON Schema", () => {
  for (const schema of outputSchemas) expect(everyObjectRequiresItsProperties(z.toJSONSchema(schema))).toBe(true);
});
