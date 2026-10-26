import { expect, test } from "bun:test";
import { questionProblem } from "../src/lesson-blocks";

const gap = (prompt: string, answer: string) => ({ block: "fillGap", prompt, answer, explanation: "because" }) as const;

test("a fill-gap answer that only sits inside another word is fine", () => {
  expect(questionProblem(gap("This ___ my book.", "is"))).toBeUndefined();
});

test("a fill-gap answer that shows up as a whole word or phrase is still rejected", () => {
  expect(questionProblem(gap("It ___ is here.", "is"))).toBe("answer is in the prompt");
  expect(questionProblem(gap("She ___ up. Wake up!", "wake up"))).toBe("answer is in the prompt");
});

test("a fill-gap prompt must have exactly one gap", () => {
  expect(questionProblem(gap("I ___ now. Last week, I ___ it.", "maintain; resolved"))).toBe(
    "fillGap prompt must have exactly one gap",
  );
});

test("a vocab card whose answer repeats the term is rejected", () => {
  const card = (answer: string) =>
    ({ block: "vocabCard", term: "My experience includes...", answer, explanation: "x" }) as const;
  expect(questionProblem(card("my experience includes..."))).toBe("vocabCard answer repeats the term");
  expect(questionProblem(card("Introduces your background"))).toBeUndefined();
});
