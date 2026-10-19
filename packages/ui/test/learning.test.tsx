import { expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  ChoiceChips,
  CoachCall,
  FillGapsStep,
  ReorderStep,
  RoadmapNode,
  RoadmapUnit,
  TeachingPage,
  VoiceOrb,
  type VoicePhase,
} from "@impromptu/ui";

test("voice phase changes preserve running loops while updating amplitude and status", () => {
  const { container, rerender } = render(<VoiceOrb phase="connecting" label="Connecting" />);
  const paths = [...container.querySelectorAll("path")];
  const durations = paths.map((path) => path.style.animationDuration);
  for (const phase of ["ready", "listening", "thinking", "speaking"] satisfies VoicePhase[]) {
    rerender(<VoiceOrb phase={phase} label={phase} />);
    expect(screen.getByRole("status").textContent).toBe(phase);
    const current = [...container.querySelectorAll("path")];
    current.forEach((path, i) => expect(path).toBe(paths[i]!));
    expect(current.map((path) => path.style.animationDuration)).toEqual(durations);
  }
  expect(container.querySelector("g")?.style.transform).toBe("scaleY(1)");
});

test("multiple blanks require every answer and allow changing a filled blank", () => {
  const onAnswer = mock();
  render(<FillGapsStep sentence="I ___; she ___." choices={["work", "works"]} onAnswer={onAnswer} />);
  const submit = screen.getByRole("button", { name: "Send answer" }) as HTMLButtonElement;
  expect(submit.disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "work" }));
  expect(submit.disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "works" }));
  fireEvent.click(submit);
  expect(onAnswer).toHaveBeenCalledWith('["work","works"]');
  fireEvent.click(screen.getByRole("button", { name: "Blank 1: work" }));
  fireEvent.click(screen.getByRole("button", { name: "works" }));
  fireEvent.click(submit);
  expect(onAnswer).toHaveBeenLastCalledWith('["works","works"]');
});

test("reorder supports accessible buttons and submits item identities in the new order", () => {
  const onAnswer = mock();
  render(<ReorderStep items={["you", "Thank"]} onAnswer={onAnswer} />);
  fireEvent.click(screen.getByRole("button", { name: "Move Thank up" }));
  expect(screen.getByRole("status").textContent).toContain("position 1");
  expect(document.activeElement?.getAttribute("aria-label")).toBe("Move Thank down");
  fireEvent.click(screen.getByRole("button", { name: "Send answer" }));
  expect(onAnswer).toHaveBeenCalledWith("[1,0]");
});

test("teaching advances deliberately and choice cards retain checkbox semantics", () => {
  const onNext = mock();
  render(<TeachingPage title="Polite requests" body="Make room for the other person to respond." onNext={onNext} />);
  fireEvent.click(screen.getByRole("button", { name: "Check my understanding" }));
  expect(onNext).toHaveBeenCalledTimes(1);
  render(
    <ChoiceChips
      layout="cards"
      multiple
      label="Goals"
      value={[]}
      options={[{ value: "work", label: "Work", description: "Clearer calls" }]}
    />,
  );
  expect(screen.getByRole("checkbox", { name: /Work.*Clearer calls/ })).toBeDefined();
});

test("coach call shows real state/captions and exposes mute and end controls", () => {
  const mute = mock(),
    end = mock();
  render(
    <CoachCall
      state="speaking"
      connection="live"
      muted={false}
      onMutedChange={mute}
      onEnd={end}
      speaker="coach"
      caption="Tell me about yourself."
    />,
  );
  expect(screen.getByText("Your coach is speaking")).toBeDefined();
  expect(screen.getByText("Tell me about yourself.")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Mute microphone" }));
  expect(mute).toHaveBeenCalledWith(true);
  fireEvent.click(screen.getByRole("button", { name: "End conversation" }));
  expect(end).toHaveBeenCalledTimes(1);
});

test("Roadmap icons open existing Lessons and start planned ones without a separate action button", () => {
  const start = mock();
  render(
    <ol>
      <RoadmapNode state="active" title="Useful words" onClick={start} />
      <RoadmapNode state="complete" title="Clear sentences" render={<a href="/lessons/one" />} />
      <RoadmapNode state="locked" title="Explain your ideas" onClick={start} />
    </ol>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Open Useful words" }));
  expect(start).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("link", { name: "Review Clear sentences" }).getAttribute("href")).toBe("/lessons/one");
  expect(screen.queryByRole("button", { name: "Open Explain your ideas" })).toBeNull();
  expect(screen.queryByText("Resume Lesson")).toBeNull();
});

test("Unit headers show a compact objective without synthetic completion or duration counts", () => {
  render(
    <RoadmapUnit number={1} title="Tell your story" description="Describe a real project clearly" detail="Active">
      <RoadmapNode state="locked" title="Choose precise verbs" />
    </RoadmapUnit>,
  );
  expect(screen.getByRole("heading", { name: "1. Tell your story" })).toBeDefined();
  expect(screen.getByText("Describe a real project clearly").getAttribute("title")).toBe(
    "Describe a real project clearly",
  );
  expect(document.body.textContent).not.toMatch(/minutes|Lessons completed/);
});
