import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChatComposer, ChatSkeleton, ChatThread, ChatTurn, ChatWriting } from "@impromptu/ui";

describe("ChatTurn", () => {
  test("marks a reply that is still streaming", () => {
    const { container } = render(
      <ChatTurn from="coach" streaming>
        Tell me about
      </ChatTurn>,
    );
    const turn = container.querySelector("p")!;
    expect(turn.getAttribute("aria-busy")).toBe("true");
    expect(container.querySelector('[class*="animate-blink"]')).toBeTruthy();
    expect(container.textContent).toBe("Coach: Tell me about");
  });

  test("a finished reply has no caret and isn't busy", () => {
    const { container } = render(<ChatTurn from="coach">Tell me about yourself.</ChatTurn>);
    expect(container.querySelector("p")!.hasAttribute("aria-busy")).toBe(false);
    expect(container.querySelector('[class*="animate-blink"]')).toBeNull();
  });
});

describe("ChatThread", () => {
  test("is a named log that pauses announcements while a reply streams", () => {
    const { rerender } = render(
      <ChatThread label="Roleplay with the interviewer">
        <ChatTurn from="coach">Hello.</ChatTurn>
      </ChatThread>,
    );
    const log = screen.getByRole("log", { name: "Roleplay with the interviewer" });
    expect(log.getAttribute("aria-live")).toBe("polite");

    rerender(
      <ChatThread label="Roleplay with the interviewer" busy>
        <ChatTurn from="coach" streaming>
          Hello
        </ChatTurn>
      </ChatThread>,
    );
    expect(log.getAttribute("aria-live")).toBe("off");
  });
});

describe("ChatWriting", () => {
  test("says who is writing, with skeletons hidden from assistive technology", () => {
    const { container } = render(<ChatWriting name="Interviewer" />);
    expect(screen.getByRole("status", { name: "Interviewer is writing" })).toBeTruthy();
    const skeletons = container.querySelectorAll('[aria-hidden="true"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});

describe("ChatSkeleton", () => {
  test("names what is loading", () => {
    render(<ChatSkeleton label="Loading your Roleplay" />);
    expect(screen.getByRole("status", { name: "Loading your Roleplay" })).toBeTruthy();
  });
});

describe("ChatComposer", () => {
  test("Enter sends a non-empty message", () => {
    const onSend = mock();
    render(<ChatComposer label="Your reply" value="Hello" onValueChange={() => {}} onSend={onSend} />);
    fireEvent.keyDown(screen.getByLabelText("Your reply"), { key: "Enter" });
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  test("Shift+Enter starts a new line instead of sending", () => {
    const onSend = mock();
    render(<ChatComposer label="Your reply" value="Hello" onValueChange={() => {}} onSend={onSend} />);
    fireEvent.keyDown(screen.getByLabelText("Your reply"), { key: "Enter", shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
  });

  test("oversized messages cannot be sent", () => {
    const onSend = mock();
    render(<ChatComposer label="Your reply" value={"x".repeat(2001)} onValueChange={() => {}} onSend={onSend} />);
    expect((screen.getByLabelText("Your reply") as HTMLTextAreaElement).maxLength).toBe(2000);
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(screen.getByLabelText("Your reply"), { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();
  });

  test("a blank or pending message can't be sent", () => {
    const onSend = mock();
    const { rerender } = render(
      <ChatComposer label="Your reply" value="  " onValueChange={() => {}} onSend={onSend} />,
    );
    const button = screen.getByRole("button", { name: "Send" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.keyDown(screen.getByLabelText("Your reply"), { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();

    rerender(<ChatComposer label="Your reply" value="Hello" onValueChange={() => {}} onSend={onSend} pending />);
    expect((screen.getByRole("button", { name: "Sending…" }) as HTMLButtonElement).disabled).toBe(true);
  });

  test("the Send button sends and explains the keyboard shortcuts", () => {
    const onSend = mock();
    render(<ChatComposer label="Your reply" value="Hello" onValueChange={() => {}} onSend={onSend} />);
    expect(screen.getByText(/Press Enter to send/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onSend).toHaveBeenCalledTimes(1);
  });
});
