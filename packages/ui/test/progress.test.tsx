import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { CefrScale, FocusItemCard, ScoreHistory, SkillBar } from "@impromptu/ui";

describe("SkillBar", () => {
  test("is a meter named by the skill, out of 100, that reads as the score and CEFR Level", () => {
    render(<SkillBar skill="grammar" score={62} level="B2" />);
    const meter = screen.getByRole("meter", { name: "Grammar" });
    expect(meter.getAttribute("aria-valuenow")).toBe("62");
    expect(meter.getAttribute("aria-valuemax")).toBe("100");
    expect(meter.getAttribute("aria-valuetext")).toBe("62, B2");
    expect(meter.contains(screen.getByText("62 · B2"))).toBe(true);
  });

  test("takes only the three skills and the six CEFR Levels", () => {
    // @ts-expect-error not a skill
    <SkillBar skill="pronunciation" score={1} level="A1" />;
    // @ts-expect-error not a CEFR Level
    <SkillBar skill="fluency" score={1} level="D1" />;
  });
});

describe("CefrScale", () => {
  test("lists A1 to C2 under its label and marks only the current Level", () => {
    render(<CefrScale label="Grammar CEFR Level" level="B1" />);
    const scale = screen.getByRole("list", { name: "Grammar CEFR Level" });
    const cells = [...scale.querySelectorAll("li")];
    expect(cells.map((cell) => cell.textContent)).toEqual(["A1", "A2", "B1", "B2", "C1", "C2"]);
    expect(cells.filter((cell) => cell.getAttribute("aria-current") === "true").map((cell) => cell.textContent)).toEqual(["B1"]);
  });
});

describe("FocusItemCard", () => {
  test("an open Focus Item shows its kind, its label and the correct uses towards closing it", () => {
    const { container } = render(<FocusItemCard label="Present perfect with since and for" kind="grammar" status="open" hits={2} hitsToClose={3} />);
    expect(screen.getByText("Present perfect with since and for")).toBeDefined();
    expect(screen.getByText("Grammar")).toBeDefined();
    const bar = screen.getByRole("progressbar", { name: "2 of 3 correct uses to close it" });
    expect(bar.getAttribute("aria-valuenow")).toBe("2");
    expect(bar.getAttribute("aria-valuemax")).toBe("3");
    expect(container.textContent).not.toContain("Closed");
  });

  test("a closed Focus Item says so, with no progress towards closing", () => {
    render(<FocusItemCard label="in charge of" kind="phrase" status="closed" hits={3} hitsToClose={3} />);
    expect(screen.getByText("Phrase")).toBeDefined();
    expect(screen.getByText("Closed")).toBeDefined();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});

describe("ScoreHistory", () => {
  test("is a table named by its label: one row per score, with its date, score, CEFR Level and source as a word", () => {
    render(
      <ScoreHistory
        label="Grammar history"
        entries={[
          { id: "1", date: "16 Oct 2026", score: 58, level: "B2", source: "lesson" },
          { id: "2", date: "9 Oct 2026", score: 50, level: "B1", source: "assessment" },
        ]}
      />,
    );
    const table = screen.getByRole("table", { name: "Grammar history" });
    const rows = [...table.querySelectorAll("tr")].map((row) => [...row.children].map((cell) => cell.textContent));
    expect(rows).toEqual([
      ["Date", "Score", "From"],
      ["16 Oct 2026", "58 · B2", "Lesson"],
      ["9 Oct 2026", "50 · B1", "Assessment"],
    ]);
  });
});
