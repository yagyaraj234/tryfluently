import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PageBlock, PageDots, type PageQuestion, type PageResult } from "@impromptu/ui";

afterEach(cleanup);

const show = (question: PageQuestion, result?: PageResult, onSubmit = mock()) => {
  render(<PageBlock question={question} result={result} pending={false} onSubmit={onSubmit} />);
  return onSubmit;
};
const check = () => screen.getByRole("button", { name: "Check answer" }) as HTMLButtonElement;

test("fill the gap sends the trimmed typed answer", () => {
  const onSubmit = show({ block: "fillGap", prompt: "She ___ to work." });
  expect(check().disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Your answer"), { target: { value: " goes " } });
  fireEvent.click(check());
  expect(onSubmit).toHaveBeenCalledWith("goes");
});

test("a wrong answer shows the verdict, the correct answer and why", () => {
  show(
    { block: "fillGap", prompt: "She ___ to work." },
    { block: "fillGap", answer: "go", verdict: "incorrect", correctAnswer: "goes", explanation: "Add -es." },
  );
  expect(screen.getByText("Incorrect")).toBeTruthy();
  expect(screen.getByText("goes")).toBeTruthy();
  expect(screen.getByText("Add -es.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Check answer" })).toBeNull();
});

test("multiple choice sends the option index", () => {
  const onSubmit = show({ block: "multipleChoice", prompt: "Pick.", options: ["go", "goes"] });
  fireEvent.click(screen.getByRole("radio", { name: "goes" }));
  fireEvent.click(check());
  expect(onSubmit).toHaveBeenCalledWith(1);
});

test("match pairs needs every row and sends the pairs", () => {
  const onSubmit = show({ block: "matchPairs", prompt: "Match.", left: ["I", "she"], right: ["go", "goes"] });
  fireEvent.click(screen.getAllByRole("radio", { name: "go" })[0]!);
  expect(check().disabled).toBe(true);
  fireEvent.click(screen.getAllByRole("radio", { name: "goes" })[1]!);
  fireEvent.click(check());
  expect(onSubmit).toHaveBeenCalledWith([
    { left: "I", right: "go" },
    { left: "she", right: "goes" },
  ]);
});

test("reorder builds the order by tapping, and a placed piece can be taken back", () => {
  const onSubmit = show({ block: "reorder", prompt: "Order.", items: ["home", "She", "goes"] });
  for (const piece of ["She", "goes", "home"]) fireEvent.click(screen.getByRole("button", { name: piece }));
  fireEvent.click(screen.getByRole("button", { name: /3\. home/ }));
  expect(check().disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "home" }));
  fireEvent.click(check());
  expect(onSubmit).toHaveBeenCalledWith(["She", "goes", "home"]);
});

test("a vocab card hides its meaning until Show meaning is pressed, and shows it once saved", () => {
  const onSubmit = show({ block: "vocabCard", term: "commute" });
  expect(screen.queryByText("daily trip to work")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Show meaning" }));
  expect(onSubmit).toHaveBeenCalledWith("seen");
  cleanup();
  show(
    { block: "vocabCard", term: "commute" },
    {
      block: "vocabCard",
      answer: "seen",
      verdict: "correct",
      correctAnswer: "daily trip to work",
      explanation: "A trip.",
    },
  );
  expect(screen.getByText("daily trip to work")).toBeTruthy();
});

test("a saved speaking answer shows its text and no verdict", () => {
  show(
    { block: "speakPrompt", prompt: "Say it." },
    { block: "speakPrompt", answer: "Mine.", verdict: null, correctAnswer: null, explanation: null },
  );
  expect(screen.getByText("Your answer is saved.")).toBeTruthy();
  expect((screen.getByLabelText("Your answer") as HTMLTextAreaElement).value).toBe("Mine.");
});

test("a rewrite shows a checking state, then the verdict, corrected version and why", () => {
  render(<PageBlock question={{ block: "rewrite", prompt: "Rewrite." }} pending onSubmit={mock()} />);
  expect(screen.getAllByText("Checking your answer").length).toBeGreaterThan(0);
  cleanup();
  show(
    { block: "rewrite", prompt: "Rewrite." },
    { block: "rewrite", answer: "I goes.", verdict: "almost", correctAnswer: "I go.", explanation: "Use go." },
  );
  expect(screen.getByText("Almost")).toBeTruthy();
  expect(screen.getByText("I go.")).toBeTruthy();
  expect(screen.getByText("Use go.")).toBeTruthy();
});

test("a rewrite that could not be checked keeps the answer and offers Try again", () => {
  const onSubmit = show(
    { block: "rewrite", prompt: "Rewrite." },
    { block: "rewrite", answer: "I goes.", verdict: null, correctAnswer: null, explanation: null },
  );
  expect((screen.getByLabelText("Your version") as HTMLTextAreaElement).value).toBe("I goes.");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(onSubmit).toHaveBeenCalledWith("I goes.");
});

test("progress dots name the current Page", () => {
  render(<PageDots current={1} total={4} />);
  expect(screen.getByRole("list", { name: "Page 2 of 4" })).toBeTruthy();
});
