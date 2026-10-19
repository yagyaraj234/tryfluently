import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Meter, Notice, ProgressBar, Skeleton, Spinner, UIProvider, toastManager } from "@impromptu/ui";

describe("Toast", () => {
  afterEach(() => act(() => toastManager.close()));

  test("a toast added through the manager, outside any component, shows under UIProvider and its action fires", async () => {
    render(<UIProvider />);
    const onUndo = mock();
    act(() => {
      toastManager.add({
        title: "Saved",
        description: "Your answer was saved.",
        actionProps: { children: "Undo", onClick: onUndo },
      });
    });
    expect(await screen.findByText("Saved")).toBeTruthy();
    expect(screen.getByText("Your answer was saved.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });
});

describe("ProgressBar", () => {
  test("is a progressbar named by its label, with its value and max", () => {
    render(<ProgressBar label="Lesson progress" value={3} max={7} />);
    const bar = screen.getByRole("progressbar", { name: "Lesson progress" });
    expect(bar.getAttribute("aria-valuenow")).toBe("3");
    expect(bar.getAttribute("aria-valuemax")).toBe("7");
  });
});

describe("Meter", () => {
  test("is a meter named by its label, with its value and max", () => {
    render(<Meter label="Fluency" value={62} max={80} />);
    const meter = screen.getByRole("meter", { name: "Fluency" });
    expect(meter.getAttribute("aria-valuenow")).toBe("62");
    expect(meter.getAttribute("aria-valuemax")).toBe("80");
  });
});

describe("Spinner", () => {
  test("is a status named by its label", () => {
    render(<Spinner label="Loading your Lesson" />);
    expect(screen.getByRole("status", { name: "Loading your Lesson" })).toBeTruthy();
  });
});

describe("Skeleton", () => {
  test("is hidden from assistive technology", () => {
    render(
      <div data-testid="skeletons">
        <Skeleton shape="text" size="title" />
        <Skeleton shape="block" size={14} />
        <Skeleton shape="circle" size={10} />
      </div>,
    );
    const skeletons = [...screen.getByTestId("skeletons").children];
    expect(skeletons.map((s) => s.getAttribute("aria-hidden"))).toEqual(["true", "true", "true"]);
  });

  test("takes token names only", () => {
    // @ts-expect-error a size is a spacing step
    <Skeleton shape="block" size={7} />;
    // @ts-expect-error a text skeleton takes a text size
    <Skeleton shape="text" size={4} />;
  });
});

describe("Notice", () => {
  test("an error is announced straight away as an alert", () => {
    render(<Notice tone="error">Wrong email or password.</Notice>);
    expect(screen.getByRole("alert").textContent).toBe("Wrong email or password.");
  });

  test("information is announced politely as a status", () => {
    render(<Notice tone="info">You can retake the Assessment on 22 October.</Notice>);
    expect(screen.getByRole("status").textContent).toBe("You can retake the Assessment on 22 October.");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("takes no className or style", () => {
    // @ts-expect-error className is not a prop
    <Notice tone="info" className="x">
      Hi
    </Notice>;
    // @ts-expect-error style is not a prop
    <Notice tone="info" style={{}}>
      Hi
    </Notice>;
  });
});
