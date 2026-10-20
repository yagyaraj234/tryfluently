import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { StreakCard, UnitCard, UnitStatusTag } from "@fluently/ui";

describe("StreakCard", () => {
  test("reads as the Streak in days", () => {
    expect(render(<StreakCard days={12} />).container.textContent).toBe("12 day streak");
    expect(screen.getByText("12")).toBeDefined();
  });

  test("takes only the days", () => {
    // @ts-expect-error className is not a prop
    <StreakCard days={1} className="x" />;
    // @ts-expect-error the label is built in
    <StreakCard days={1}>Nice</StreakCard>;
  });
});

describe("UnitStatusTag", () => {
  test("every status is a different word, so it never relies on colour alone", () => {
    const words = (["planned", "active", "mastered", "skipped"] as const).map(
      (status) => render(<UnitStatusTag status={status} />).container.textContent,
    );
    expect(words).toEqual(["Planned", "Active", "Mastered", "Skipped"]);
  });

  test("every status looks different too", () => {
    const looks = (["planned", "active", "mastered", "skipped"] as const).map(
      (status) => render(<UnitStatusTag status={status} />).container.firstElementChild!.className,
    );
    expect(new Set(looks).size).toBe(4);
  });

  test("takes only the four statuses", () => {
    // @ts-expect-error not a Unit status
    <UnitStatusTag status="done" />;
  });
});

describe("UnitCard", () => {
  test("shows the title as a heading, the objective and the status word", () => {
    render(<UnitCard title="Tenses" objective="Talk about past projects with the right tense" status="active" />);
    expect(screen.getByRole("heading", { name: "Tenses" })).toBeDefined();
    expect(screen.getByText("Talk about past projects with the right tense")).toBeDefined();
    expect(screen.getByText("Active")).toBeDefined();
  });

  test("with render={<a href>} the whole card is one link", () => {
    render(<UnitCard title="Tenses" objective="Use tenses" status="planned" render={<a href="/units/1" />} />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]!.getAttribute("href")).toBe("/units/1");
    expect(links[0]!.textContent).toContain("Tenses");
    expect(links[0]!.textContent).toContain("Planned");
  });

  test("takes no className or style", () => {
    // @ts-expect-error className is not a prop
    <UnitCard title="a" objective="b" status="active" className="x" />;
    // @ts-expect-error style is not a prop
    <UnitCard title="a" objective="b" status="active" style={{}} />;
  });
});
