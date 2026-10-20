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
