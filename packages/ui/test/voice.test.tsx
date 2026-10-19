import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { RecordButton, SpeakPromptStep, StepFeedback, VocabCardStep, type RecordingState } from "@impromptu/ui";

const button = (name: string | RegExp) => screen.getByRole("button", { name }) as HTMLButtonElement;
const click = (name: string | RegExp) => fireEvent.click(button(name));

describe("RecordButton", () => {
  test("starts a recording when idle and stops it while recording", () => {
    const onStart = mock();
    const onStop = mock();
    const { rerender } = render(<RecordButton state="idle" onStart={onStart} onStop={onStop} />);
    click("Start recording");
    expect(onStart).toHaveBeenCalledTimes(1);
    rerender(<RecordButton state="recording" onStart={onStart} onStop={onStop} />);
    click("Stop recording");
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  test("can't be pressed while the recording is processed", () => {
    const onStart = mock();
    render(<RecordButton state="processing" onStart={onStart} onStop={() => {}} />);
    click("Processing your recording");
    expect(onStart).not.toHaveBeenCalled();
    expect(button("Processing your recording").getAttribute("aria-disabled")).toBe("true");
  });

  test("recording looks live, idle doesn't", () => {
    const idle = render(<RecordButton state="idle" onStart={() => {}} onStop={() => {}} />).container.innerHTML;
    const live = render(<RecordButton state="recording" onStart={() => {}} onStop={() => {}} />).container.innerHTML;
    expect(idle).not.toContain("live");
    expect(live).toContain("live");
  });
});

describe("SpeakPromptStep", () => {
  const handlers = () => ({ onStart: mock(), onStop: mock(), onRetry: mock(), onAnswer: mock() });
  const speak = (recording: RecordingState, h = handlers()) =>
    render(<SpeakPromptStep targetSeconds={60} recording={recording} {...h} />);

  test("idle, it shows the target length and the record button", () => {
    const h = handlers();
    speak({ status: "idle" }, h);
    expect(screen.getByText("Aim for about 60 seconds")).toBeDefined();
    click("Start recording");
    expect(h.onStart).toHaveBeenCalled();
  });

  test("while recording, it shows the time so far against the target, and the input level", () => {
    const h = handlers();
    speak({ status: "recording", seconds: 12.4, level: 0.5 }, h);
    expect(screen.getByRole("status").textContent).toContain("Recording");
    expect(screen.getByText("0:12 / 1:00")).toBeDefined();
    const meter = screen.getByRole("meter", { name: "Microphone level" });
    expect(meter.getAttribute("aria-valuenow")).toBe("50");
    click("Stop recording");
    expect(h.onStop).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Type instead" })).toBeNull();
  });

  test("while processing, it says the answer is being turned into text", () => {
    speak({ status: "processing" });
    expect(screen.getByRole("status").textContent).toContain("Turning your answer into text");
  });

  test("shows the transcript once it's back", () => {
    speak({ status: "done", text: "I lead a team of five." });
    expect(document.body.textContent).toContain("You said");
    expect(screen.getByText("I lead a team of five.")).toBeDefined();
    expect(screen.queryByRole("button", { name: /recording/ })).toBeNull();
  });

  test("the Learner can type instead, and go back to recording", () => {
    const h = handlers();
    speak({ status: "idle" }, h);
    click("Type instead");
    fireEvent.change(screen.getByRole("textbox", { name: "Your answer" }), {
      target: { value: " My team is small. " },
    });
    click("Send answer");
    expect(h.onAnswer).toHaveBeenCalledWith("My team is small.");
    click("Record instead");
    expect(button("Start recording")).toBeDefined();
  });

  test("at the recorded-minutes cap, it explains and switches to text", () => {
    speak({ status: "unavailable", reason: "capped" });
    expect(document.body.textContent).toContain("You've used today's recorded minutes");
    expect(screen.getByRole("textbox", { name: "Your answer" })).toBeDefined();
    expect(screen.queryByRole("button", { name: /record/i })).toBeNull();
  });

  for (const [reason, explanation] of [
    ["denied", "Impromptu isn't allowed to use your microphone"],
    ["no-microphone", "We couldn't find a microphone"],
    ["unsupported", "This browser can't record"],
  ] as const) {
    test(`with no usable microphone (${reason}), it explains and switches to text`, () => {
      speak({ status: "unavailable", reason });
      expect(document.body.textContent).toContain(explanation);
      expect(screen.getByRole("textbox", { name: "Your answer" })).toBeDefined();
      expect(screen.queryByRole("button", { name: "Start recording" })).toBeNull();
    });
  }

  test("when the recording couldn't be transcribed, it offers a retry", () => {
    const h = handlers();
    speak({ status: "failed", reason: "failed" }, h);
    expect(screen.getByRole("alert").textContent).toContain("couldn't be turned into text");
    click("Try again");
    expect(h.onRetry).toHaveBeenCalled();
  });

  test("when nothing could be heard, it asks for another recording", () => {
    const h = handlers();
    speak({ status: "failed", reason: "silent" }, h);
    expect(screen.getByRole("alert").textContent).toContain("couldn't hear anything");
    click("Start recording");
    expect(h.onStart).toHaveBeenCalled();
  });

  test("once answered in text, it shows the answer read-only", () => {
    render(
      <SpeakPromptStep targetSeconds={30} recording={{ status: "idle" }} answered="Typed answer" {...handlers()} />,
    );
    expect(screen.getByText("Typed answer")).toBeDefined();
  });
});

describe("Hear it", () => {
  const vocab = {
    word: "deadline",
    meaning: "the time by which something must be done",
    example: "The deadline is Friday.",
  };

  test("a vocabCard plays the word's Reference Pronunciation", () => {
    const onHearIt = mock();
    render(<VocabCardStep {...vocab} onAnswer={() => {}} onHearIt={onHearIt} />);
    click("Hear it");
    expect(onHearIt).toHaveBeenCalledTimes(1);
  });

  test("without onHearIt there's no Hear it button", () => {
    render(<VocabCardStep {...vocab} onAnswer={() => {}} />);
    expect(screen.queryByRole("button", { name: "Hear it" })).toBeNull();
  });

  test("feedback plays the corrected version, before the next button", () => {
    const onHearIt = mock();
    render(
      <StepFeedback
        verdict="almost"
        corrected="She goes to work."
        explanation=""
        onNext={() => {}}
        onHearIt={onHearIt}
      />,
    );
    const buttons = screen.getAllByRole("button").map((b) => b.textContent);
    expect(buttons).toEqual(["Hear it", "Next step"]);
    click("Hear it");
    expect(onHearIt).toHaveBeenCalled();
  });
});

describe("recorded answers", () => {
  test("a vocabCard can be answered by recording, after choosing to", () => {
    const onStart = mock();
    render(
      <VocabCardStep
        word="deadline"
        meaning="m"
        example="e"
        onAnswer={() => {}}
        voice={{ recording: { status: "idle" }, onStart, onStop: () => {}, onRetry: () => {} }}
      />,
    );
    expect(screen.getByRole("textbox", { name: "Your sentence" })).toBeDefined();
    click("Record instead");
    click("Start recording");
    expect(onStart).toHaveBeenCalled();
  });

  test("feedback on a spoken answer quotes what the Learner said", () => {
    render(
      <StepFeedback
        verdict="correct"
        answer="I lead a team."
        spoken
        corrected="I lead a team."
        explanation=""
        onNext={() => {}}
      />,
    );
    expect(screen.getByRole("status").textContent).toContain("You said: I lead a team.");
  });
});
