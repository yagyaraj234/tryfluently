import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { FillGapStep, RewriteStep, StepFeedback, StepHeader, VocabCardStep } from "@impromptu/ui";

const type = (name: string, value: string) => fireEvent.change(screen.getByRole("textbox", { name }), { target: { value } });
const check = () => fireEvent.click(screen.getByRole("button", { name: "Check" }));

describe("StepHeader", () => {
  test("labels the Step with its type and position, and asks the question as a heading", () => {
    render(<StepHeader type="Rewrite" position={4} total={7} question="Make it sound more natural" />);
    expect(screen.getByText("Rewrite · Step 4 of ~7")).toBeDefined();
    expect(screen.getByRole("heading", { name: "Make it sound more natural" })).toBeDefined();
  });

  test("shows progress as the Steps finished before this one", () => {
    render(<StepHeader type="Rewrite" position={4} total={7} question="Q" />);
    const bar = screen.getByRole("progressbar", { name: "Rewrite · Step 4 of ~7" });
    expect(bar.getAttribute("aria-valuenow")).toBe("3");
    expect(bar.getAttribute("aria-valuemax")).toBe("7");
  });
});

describe("RewriteStep", () => {
  const input = { sentence: "I am very very happy with the result.", aim: "Replace 'very very'." };

  test("quotes the original sentence and sends the Learner's rewrite, trimmed", () => {
    const onAnswer = mock();
    render(<RewriteStep {...input} onAnswer={onAnswer} />);
    expect(screen.getByText(input.sentence).closest("blockquote")).not.toBeNull();
    type("Your rewrite", "  I'm delighted with the result. ");
    check();
    expect(onAnswer).toHaveBeenCalledWith("I'm delighted with the result.");
  });

  test("doesn't send an empty answer", () => {
    const onAnswer = mock();
    render(<RewriteStep {...input} onAnswer={onAnswer} />);
    type("Your rewrite", "   ");
    check();
    expect(onAnswer).not.toHaveBeenCalled();
  });

  test("can't be sent again while the answer is being checked", () => {
    const onAnswer = mock();
    render(<RewriteStep {...input} onAnswer={onAnswer} pending />);
    type("Your rewrite", "Better.");
    check();
    expect(onAnswer).not.toHaveBeenCalled();
  });
});

describe("VocabCardStep", () => {
  const input = { word: "deadline", meaning: "the time by which something must be done", example: "The deadline is Friday." };

  test("shows the word, its meaning and an example, then sends the Learner's own sentence", () => {
    const onAnswer = mock();
    render(<VocabCardStep {...input} onAnswer={onAnswer} />);
    expect(screen.getByRole("heading", { name: "deadline" })).toBeDefined();
    expect(screen.getByText(input.meaning)).toBeDefined();
    expect(screen.getByText(input.example)).toBeDefined();
    type("Your sentence", "We missed the deadline.");
    check();
    expect(onAnswer).toHaveBeenCalledWith("We missed the deadline.");
  });
});

describe("FillGapStep", () => {
  test("with choices, the picked chip fills the gap in the sentence and is sent", () => {
    const onAnswer = mock();
    // The app passes the Step's input straight through, answer key included.
    const input = { sentence: "She ___ to work every day.", answer: "goes", choices: ["go", "goes", "going"] };
    const { container } = render(<FillGapStep {...input} onAnswer={onAnswer} />);
    expect(container.textContent).toContain("She blank to work every day.");
    fireEvent.click(screen.getByRole("radio", { name: "goes" }));
    expect(container.textContent).toContain("She goes to work every day.");
    check();
    expect(onAnswer).toHaveBeenCalledWith("goes");
  });

  test("without choices, the Learner types the missing word, and the answer key is never shown", () => {
    const onAnswer = mock();
    const input = { sentence: "They ___ football.", answer: "play" };
    const { container } = render(<FillGapStep {...input} onAnswer={onAnswer} />);
    expect(container.textContent).not.toContain("play");
    type("Your answer", " play ");
    check();
    expect(onAnswer).toHaveBeenCalledWith("play");
  });

  test("doesn't send without an answer", () => {
    const onAnswer = mock();
    render(<FillGapStep sentence="She ___ to work." choices={["go", "goes"]} onAnswer={onAnswer} />);
    check();
    expect(onAnswer).not.toHaveBeenCalled();
  });
});

describe("StepFeedback", () => {
  const feedback = { corrected: "She goes to work every day.", explanation: "Use -s with he, she and it." };

  test("announces the verdict as a word, with the Learner's answer, the corrected version and the explanation", () => {
    render(<StepFeedback verdict="almost" answer="She go to work." {...feedback} onNext={() => {}} />);
    const panel = screen.getByRole("status");
    expect(panel.textContent).toContain("Almost");
    expect(panel.textContent).toContain("She go to work.");
    expect(screen.getByText(feedback.corrected).tagName).toBe("STRONG");
    expect(panel.textContent).toContain(feedback.explanation);
  });

  test("each verdict has its own tint", () => {
    const tints = (["correct", "almost", "incorrect"] as const).map(
      (verdict) => render(<StepFeedback verdict={verdict} {...feedback} onNext={() => {}} />).container.firstElementChild!.className,
    );
    expect(new Set(tints).size).toBe(3);
  });

  test("moves on with the next button, labelled 'Next step' unless told otherwise", () => {
    const onNext = mock();
    render(<StepFeedback verdict="correct" {...feedback} onNext={onNext} />);
    fireEvent.click(screen.getByRole("button", { name: "Next step" }));
    expect(onNext).toHaveBeenCalledTimes(1);
    render(<StepFeedback verdict="correct" {...feedback} onNext={onNext} nextLabel="See results" />);
    expect(screen.getByRole("button", { name: "See results" })).toBeDefined();
  });
});
