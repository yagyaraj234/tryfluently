import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChatTurn, FillGapStep, RewriteStep, StepHeader } from "@impromptu/ui";

describe("StepHeader", () => {
  test("shows the label and the question as a heading", () => {
    render(<StepHeader label="Rewrite · Step 4 of ~7" question="Make it more polite." />);
    expect(screen.getByText("Rewrite · Step 4 of ~7")).toBeDefined();
    expect(screen.getByRole("heading", { name: "Make it more polite." })).toBeDefined();
  });
});

describe("FillGapStep", () => {
  const sentence = "I ___ here since 2020.";

  test("with choices, the Learner picks one and sends it", () => {
    const answers: string[] = [];
    render(<FillGapStep label="Fill the gap" sentence={sentence} choices={["work", "have worked"]} onAnswer={(a) => answers.push(a)} />);
    const send = screen.getByRole("button", { name: "Send answer" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "have worked" }));
    // The chosen words fill the gap.
    expect(screen.getByText("have worked", { selector: "mark" })).toBeDefined();
    fireEvent.click(send);
    expect(answers).toEqual(["have worked"]);
  });

  test("without choices, the Learner types the missing words", () => {
    const answers: string[] = [];
    render(<FillGapStep label="Fill the gap" sentence={sentence} onAnswer={(a) => answers.push(a)} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Your answer" }), { target: { value: "  have worked " } });
    fireEvent.click(screen.getByRole("button", { name: "Send answer" }));
    expect(answers).toEqual(["have worked"]);
  });

  test("once answered, it shows the answer and no verdict, and can't be answered again", () => {
    render(<FillGapStep label="Fill the gap" sentence={sentence} choices={["work", "have worked"]} answered="work" onAnswer={() => {}} />);
    expect(screen.getByText("work", { selector: "mark" })).toBeDefined();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(document.body.textContent).not.toMatch(/correct|incorrect|almost/i);
  });

  test("while sending, the button is disabled", () => {
    render(<FillGapStep label="Fill the gap" sentence={sentence} pending onAnswer={() => {}} />);
    expect((screen.getByRole("button", { name: "Send answer" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("RewriteStep", () => {
  test("quotes the sentence, asks for the aim and sends the Learner's version", () => {
    const answers: string[] = [];
    render(<RewriteStep label="Rewrite" sentence="Send me the file." aim="Make it more polite." onAnswer={(a) => answers.push(a)} />);
    expect(screen.getByRole("heading", { name: "Make it more polite." })).toBeDefined();
    expect(screen.getByText("Send me the file.").closest("blockquote")).not.toBeNull();
    const send = screen.getByRole("button", { name: "Send answer" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: "Your version" }), { target: { value: "Could you send me the file?" } });
    fireEvent.click(send);
    expect(answers).toEqual(["Could you send me the file?"]);
  });

  test("once answered, it shows the Learner's version instead of the answer box", () => {
    render(<RewriteStep label="Rewrite" sentence="Send me the file." aim="Polite" answered="Could you send it?" onAnswer={() => {}} />);
    expect(screen.getByText("Could you send it?")).toBeDefined();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
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
});
