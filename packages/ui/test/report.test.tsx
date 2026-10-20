import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { ReportStrengths, ReportWeakness } from "@fluently/ui";

describe("ReportStrengths", () => {
  test("lists each strength", () => {
    render(<ReportStrengths strengths={["Clear structure", "Good range", "Polite tone"]} />);
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Clear structure",
      "Good range",
      "Polite tone",
    ]);
  });
});

describe("ReportWeakness", () => {
  test("shows the weakness, what the Learner said and a better version", () => {
    render(
      <ReportWeakness
        label="Present perfect with since"
        quote="I work here since 2020."
        betterVersion="I've worked here since 2020."
      />,
    );
    expect(screen.getByRole("heading", { name: "Present perfect with since" })).toBeDefined();
    expect(screen.getByText("I work here since 2020.").closest("blockquote")).not.toBeNull();
    expect(screen.getByText("You said")).toBeDefined();
    expect(screen.getByText("Better")).toBeDefined();
    expect(screen.getByText("I've worked here since 2020.")).toBeDefined();
  });
});
