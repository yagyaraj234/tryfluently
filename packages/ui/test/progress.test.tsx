import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { CefrScale, FocusItemCard, ScoreHistory, SkillBar, SkillProgressCard } from "@fluently/ui";

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
    expect(
      cells.filter((cell) => cell.getAttribute("aria-current") === "true").map((cell) => cell.textContent),
    ).toEqual(["B1"]);
  });
});

describe("FocusItemCard", () => {
  test("an open Focus Item shows its kind, its label and the correct uses towards closing it", () => {
    const { container } = render(
      <FocusItemCard
        label="Present perfect with since and for"
        kind="grammar"
        status="open"
        hits={2}
        hitsToClose={3}
      />,
    );
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

describe("SkillProgressCard", () => {
  test("plots measurements oldest first on a fixed 0–100 scale and keeps full history", () => {
    const { container } = render(
      <SkillProgressCard
        skill="grammar"
        current={{ score: 58, level: "B2" }}
        unmeasured="Not yet measured"
        entries={[
          { id: "2", date: "15 Oct 2026", score: 58, level: "B2", source: "lesson" },
          { id: "1", date: "1 Oct 2026", score: 50, level: "B1", source: "assessment" },
        ]}
      />,
    );
    expect(screen.getByText("+8 points since first score")).toBeDefined();
    expect(
      screen.getByRole("img", { name: "Grammar scores, oldest to newest: 50, 58. Scale 0 to 100." }),
    ).toBeDefined();
    const points = container
      .querySelector("polyline")!
      .getAttribute("points")!
      .split(" ")
      .map((point) => point.split(",").map(Number));
    expect(points[0]).toEqual([4, 36]);
    expect(points[1]![0]).toBe(236);
    expect(points[1]![1]).toBeCloseTo(30.88);
    expect(container.querySelector("details")?.open).toBe(false);
    expect(screen.getByRole("table", { name: "Grammar history", hidden: true })).toBeDefined();
  });

  test.each([0, 1])("%i measurements show a starting point without inventing a trend", (count) => {
    render(
      <SkillProgressCard
        skill="vocabulary"
        current={{ score: 0, level: "A1" }}
        unmeasured="Not yet measured"
        entries={count ? [{ id: "1", date: "1 Oct 2026", score: 0, level: "A1", source: "assessment" }] : []}
      />,
    );
    expect(screen.getByText("Your starting point")).toBeDefined();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByRole("meter").getAttribute("aria-valuenow")).toBe("0");
  });

  test.each([40, 50])("flat and falling scores stay accurate (%i)", (score) => {
    render(
      <SkillProgressCard
        skill="fluency"
        current={{ score, level: "B1" }}
        unmeasured="Not yet measured"
        entries={[
          { id: "2", date: "15 Oct 2026", score, level: "B1", source: "lesson" },
          { id: "1", date: "1 Oct 2026", score: 50, level: "B1", source: "assessment" },
        ]}
      />,
    );
    expect(
      screen.getByText(score === 50 ? "No change since first score" : "-10 points since first score"),
    ).toBeDefined();
  });

  test("unmeasured skill shows guidance without a score or trend", () => {
    render(<SkillProgressCard skill="fluency" current={null} entries={[]} unmeasured="Take a Voice Assessment." />);
    expect(screen.getByText("No fluency score yet")).toBeDefined();
    expect(screen.getByText("Take a Voice Assessment.")).toBeDefined();
    expect(screen.queryByRole("meter")).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
  });
});
