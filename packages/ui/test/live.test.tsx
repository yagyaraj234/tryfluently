import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { LiveBar } from "@fluently/ui";

describe("LiveBar", () => {
  test("a live call shows LIVE, what it is, the time so far and the time left", () => {
    render(
      <LiveBar
        state="live"
        title="Voice Assessment"
        elapsed={192_000}
        left={408_000}
        muted={false}
        onMutedChange={() => {}}
        onEnd={() => {}}
      />,
    );
    expect(screen.getByRole("status").textContent).toBe("Live");
    expect(screen.getByText("Voice Assessment")).toBeDefined();
    expect(screen.getByText("3:12")).toBeDefined();
    expect(screen.getByText("6:48 left")).toBeDefined();
  });

  test("the time left can say what it counts down, like today's voice minutes", () => {
    render(
      <LiveBar
        state="live"
        title="Mock Interview"
        left={754_500}
        leftLabel="left today"
        muted={false}
        onMutedChange={() => {}}
        onEnd={() => {}}
      />,
    );
    expect(screen.getByText("12:35 left today")).toBeDefined();
  });

  test("says when it is still connecting or reconnecting, and leaves out times it isn't given", () => {
    const { rerender } = render(
      <LiveBar state="connecting" title="Voice Assessment" muted={false} onMutedChange={() => {}} onEnd={() => {}} />,
    );
    expect(screen.getByRole("status").textContent).toBe("Connecting…");
    expect(screen.queryByText(/left/)).toBeNull();
    rerender(
      <LiveBar state="reconnecting" title="Voice Assessment" muted={false} onMutedChange={() => {}} onEnd={() => {}} />,
    );
    expect(screen.getByRole("status").textContent).toBe("Reconnecting…");
  });

  test("mute is a toggle button, and End ends the call", () => {
    const onMutedChange = mock();
    const onEnd = mock();
    const { rerender } = render(
      <LiveBar state="live" title="Voice Assessment" muted={false} onMutedChange={onMutedChange} onEnd={onEnd} />,
    );
    const mute = screen.getByRole("button", { name: "Mute" });
    expect(mute.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(mute);
    expect(onMutedChange).toHaveBeenLastCalledWith(true);

    rerender(<LiveBar state="live" title="Voice Assessment" muted onMutedChange={onMutedChange} onEnd={onEnd} />);
    expect(screen.getByRole("button", { name: "Mute" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Mute" }));
    expect(onMutedChange).toHaveBeenLastCalledWith(false);

    fireEvent.click(screen.getByRole("button", { name: "End" }));
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  test("End can be relabelled", () => {
    render(
      <LiveBar
        state="live"
        title="Client Call"
        endLabel="End call"
        muted={false}
        onMutedChange={() => {}}
        onEnd={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "End call" })).toBeDefined();
  });
});
