import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { CefrScale, ReportStrengths, ReportWeakness, SkillBar } from "@impromptu/ui";

describe("SkillBar", () => {
  test("is a meter named after the skill, with its score and CEFR Level as text", () => {
    render(<SkillBar skill="grammar" score={62} level="B1" />);
    const meter = screen.getByRole("meter", { name: "Grammar" });
    expect(meter.getAttribute("aria-valuenow")).toBe("62");
    expect(meter.getAttribute("aria-valuetext")).toBe("62 out of 100, B1");
    expect(meter.textContent).toContain("62 · B1");
  });

  test("takes only the three skills and the six CEFR Levels", () => {
    // @ts-expect-error not a skill
    <SkillBar skill="speaking" score={1} level="B1" />;
    // @ts-expect-error not a CEFR Level
    <SkillBar skill="grammar" score={1} level="B3" />;
  });
});

describe("CefrScale", () => {
  test("lists A1 to C2 and marks the current Level", () => {
    render(<CefrScale level="B2" />);
    const list = screen.getByRole("list", { name: "CEFR Level" });
    const cells = screen.getAllByRole("listitem");
    expect(cells.map((c) => c.textContent)).toEqual(["A1", "A2", "B1", "B2", "C1", "C2"]);
    expect(cells.filter((c) => c.getAttribute("aria-current")).map((c) => c.textContent)).toEqual(["B2"]);
    expect(list).toBeDefined();
  });
});

describe("ReportStrengths", () => {
  test("lists each strength", () => {
    render(<ReportStrengths strengths={["Clear structure", "Good range", "Polite tone"]} />);
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Clear structure", "Good range", "Polite tone"]);
  });
});

describe("ReportWeakness", () => {
  test("shows the weakness, what the Learner said and a better version", () => {
    render(<ReportWeakness label="Present perfect with since" quote="I work here since 2020." betterVersion="I've worked here since 2020." />);
    expect(screen.getByRole("heading", { name: "Present perfect with since" })).toBeDefined();
    expect(screen.getByText("I work here since 2020.").closest("blockquote")).not.toBeNull();
    expect(screen.getByText("You said")).toBeDefined();
    expect(screen.getByText("Better")).toBeDefined();
    expect(screen.getByText("I've worked here since 2020.")).toBeDefined();
  });
});
