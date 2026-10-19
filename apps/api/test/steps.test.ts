import { expect, test } from "bun:test";
import type { UIMessage } from "ai";
import { takeAnswer } from "../src/steps";

function answer(type: string, input: unknown, value: string) {
  const part = { type: `tool-${type}`, toolCallId: "step", state: "input-available", input };
  const stored = [{ id: "coach", role: "assistant", parts: [part] }] as UIMessage[];
  return takeAnswer(stored, { ...stored[0], parts: [{ ...part, output: { answer: value } }] });
}

test("multiple blanks reject malformed, missing and empty answers before grading", () => {
  for (const value of ["not-json", '["work"]', '["work",""]', '["work",42]']) {
    expect(answer("fillGaps", { sentence: "I ___; she ___.", answers: ["work", "works"] }, value)).toMatchObject({
      status: 400,
    });
  }
});

test("reorder rejects duplicate, missing, fractional and out-of-range indices", () => {
  const input = { items: ["you", "Thank"], order: [1, 0] };
  for (const value of ["[0,0]", "[1]", "[1,2]", "[0.5,1]"])
    expect(answer("reorder", input, value)).toMatchObject({ status: 400 });
  expect(answer("reorder", input, "[0,1]")).toMatchObject({
    answered: { grade: { correct: false, expected: "Thank you" } },
  });
  expect(answer("reorder", input, "[1,0]")).toMatchObject({ answered: { grade: { correct: true } } });
});
