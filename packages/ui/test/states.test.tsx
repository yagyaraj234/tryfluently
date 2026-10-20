import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { MapTrifold } from "@phosphor-icons/react";
import { Button, EmptyState, ErrorState, LoadingState, OfflineBanner } from "@fluently/ui";

describe("EmptyState", () => {
  test("shows a heading, the explanation and the action", () => {
    const onClick = mock();
    render(
      <EmptyState
        icon={MapTrifold}
        title="No Roadmap yet"
        description="Take an Assessment and we'll plan your Units."
        action={<Button onClick={onClick}>Start an Assessment</Button>}
      />,
    );
    expect(screen.getByRole("heading", { name: "No Roadmap yet" })).toBeTruthy();
    expect(screen.getByText("Take an Assessment and we'll plan your Units.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Start an Assessment" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test("needs only a title", () => {
    const { container } = render(<EmptyState title="Nothing here yet" />);
    expect(container.textContent).toBe("Nothing here yet");
    // @ts-expect-error a title is required
    <EmptyState />;
  });
});

describe("LoadingState", () => {
  test("is a status that says what is loading, such as the next Step", () => {
    render(<LoadingState title="Your next Step is being prepared" description="This takes a few seconds." />);
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("Your next Step is being prepared" + "This takes a few seconds.");
  });
});

describe("ErrorState", () => {
  test("is an alert with a retry that fires onRetry", () => {
    const onRetry = mock();
    render(<ErrorState title="We couldn't build your Roadmap" onRetry={onRetry} />);
    expect(screen.getByRole("alert").textContent).toContain("We couldn't build your Roadmap");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test("has a default title and a custom retry label", () => {
    render(<ErrorState onRetry={() => {}} retryLabel="Retry the Report" />);
    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry the Report" })).toBeTruthy();
  });

  test("can offer another way forward beside the retry, such as typing instead", () => {
    const onType = mock();
    render(
      <ErrorState
        title="Allow your microphone"
        onRetry={() => {}}
        action={<Button onClick={onType}>Type instead</Button>}
      />,
    );
    const buttons = screen.getAllByRole("button").map((b) => b.textContent);
    expect(buttons).toEqual(["Try again", "Type instead"]);
    fireEvent.click(screen.getByRole("button", { name: "Type instead" }));
    expect(onType).toHaveBeenCalledTimes(1);
  });

  test("needs onRetry", () => {
    // @ts-expect-error a retry is required
    <ErrorState title="x" />;
  });
});

describe("OfflineBanner", () => {
  test("is a status saying the Learner is offline", () => {
    render(<OfflineBanner />);
    expect(screen.getByRole("status").textContent).toMatch(/^You're offline/);
  });
});
