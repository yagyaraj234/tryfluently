import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChatTurn, FillGapStep, RewriteStep, StepFeedback, StepHeader, VocabCardStep } from "@fluently/ui";

const type = (name: string, value: string) =>
  fireEvent.change(screen.getByRole("textbox", { name }), { target: { value } });
const sendButton = () => screen.getByRole("button", { name: "Send answer" }) as HTMLButtonElement;
const send = () => fireEvent.click(sendButton());

describe("StepHeader", () => {
  test("in a Lesson, labels the Step with its type and position, and asks the question as a heading", () => {
    render(<StepHeader type="Rewrite" progress={{ position: 4, total: 7 }} question="Make it sound more natural" />);
    expect(screen.getByText("Rewrite · Step 4 of ~7")).toBeDefined();
    expect(screen.getByRole("heading", { name: "Make it sound more natural" })).toBeDefined();
  });

  test("shows progress as the Steps finished before this one", () => {
    render(<StepHeader type="Rewrite" progress={{ position: 4, total: 7 }} question="Q" />);
    const bar = screen.getByRole("progressbar", { name: "Rewrite · Step 4 of ~7" });
    expect(bar.getAttribute("aria-valuenow")).toBe("3");
    expect(bar.getAttribute("aria-valuemax")).toBe("7");
  });

  test("without progress, shows only the type and the question", () => {
    render(<StepHeader type="Fill the gap" question="Complete the sentence." />);
    expect(screen.getByText("Fill the gap")).toBeDefined();
    expect(screen.getByRole("heading", { name: "Complete the sentence." })).toBeDefined();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});

describe("RewriteStep", () => {
  const input = { sentence: "I am very very happy with the result.", aim: "Replace 'very very'." };

  test("quotes the original sentence and sends the Learner's version, trimmed", () => {
    const onAnswer = mock();
    render(<RewriteStep {...input} onAnswer={onAnswer} />);
    expect(screen.getByText(input.sentence).closest("blockquote")).not.toBeNull();
    expect(sendButton().disabled).toBe(true);
    type("Your version", "  I'm delighted with the result. ");
    send();
    expect(onAnswer).toHaveBeenCalledWith("I'm delighted with the result.");
  });

  test("doesn't send an empty answer", () => {
    const onAnswer = mock();
    render(<RewriteStep {...input} onAnswer={onAnswer} />);
    type("Your version", "   ");
    send();
    expect(onAnswer).not.toHaveBeenCalled();
  });

  test("can't be sent again while the answer is being sent", () => {
    const onAnswer = mock();
    render(<RewriteStep {...input} onAnswer={onAnswer} pending />);
    type("Your version", "Better.");
    send();
    expect(onAnswer).not.toHaveBeenCalled();
  });

  test("once answered, it shows the Learner's version instead of the answer box", () => {
    render(<RewriteStep {...input} answered="Could you send it?" onAnswer={() => {}} />);
    expect(screen.getByText("Could you send it?")).toBeDefined();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("VocabCardStep", () => {
  const input = {
    word: "deadline",
    meaning: "the time by which something must be done",
    example: "The deadline is Friday.",
  };

  test("shows the word, its meaning and an example, then sends the Learner's own sentence", () => {
    const onAnswer = mock();
    render(<VocabCardStep {...input} onAnswer={onAnswer} />);
    expect(screen.getByRole("heading", { name: "deadline" })).toBeDefined();
    expect(screen.getByText(input.meaning)).toBeDefined();
    expect(screen.getByText(input.example)).toBeDefined();
    type("Your sentence", "We missed the deadline.");
    send();
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
    expect(sendButton().disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "goes" }));
    expect(screen.getByText("goes", { selector: "mark" })).toBeDefined();
    send();
    expect(onAnswer).toHaveBeenCalledWith("goes");
  });

  test("without choices, the Learner types the missing words, and the answer key is never shown", () => {
    const onAnswer = mock();
    const input = { sentence: "They ___ football.", answer: "play" };
    const { container } = render(<FillGapStep {...input} onAnswer={onAnswer} />);
    expect(container.textContent).not.toContain("play");
    type("Your answer", " play ");
    send();
    expect(onAnswer).toHaveBeenCalledWith("play");
  });

  test("once answered, it shows the answer and no verdict, and can't be answered again", () => {
    render(
      <FillGapStep
        sentence="I ___ here since 2020."
        choices={["work", "have worked"]}
        answered="work"
        onAnswer={() => {}}
      />,
    );
    expect(screen.getByText("work", { selector: "mark" })).toBeDefined();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(document.body.textContent).not.toMatch(/correct|incorrect|almost/i);
  });

  test("while sending, the button is disabled", () => {
    render(<FillGapStep sentence="I ___ here." pending onAnswer={() => {}} />);
    type("Your answer", "work");
    expect(sendButton().disabled).toBe(true);
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
      (verdict) =>
        render(<StepFeedback verdict={verdict} {...feedback} onNext={() => {}} />).container.firstElementChild!
          .className,
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

describe("ChatTurn", () => {
  test("says who is speaking, for screen readers too", () => {
    const { container } = render(
      <>
        <ChatTurn from="coach">What do you do?</ChatTurn>
        <ChatTurn from="learner">I'm a nurse.</ChatTurn>
      </>,
    );
    expect(container.textContent).toBe("Coach: What do you do?You: I'm a nurse.");
  });

  test("names the character the coach plays in a Roleplay", () => {
    const { container } = render(
      <ChatTurn from="coach" name="Interviewer">
        Tell me about yourself.
      </ChatTurn>,
    );
    expect(container.textContent).toBe("Interviewer: Tell me about yourself.");
  });
});
