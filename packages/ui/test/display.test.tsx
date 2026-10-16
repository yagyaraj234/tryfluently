import { describe, expect, test } from "bun:test";
import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { Fire } from "@phosphor-icons/react";
import { Card, Chip, VerdictTag } from "@impromptu/ui";

describe("Card", () => {
  test("renders its content", () => {
    render(<Card>Tenses</Card>);
    expect(screen.getByText("Tenses")).toBeDefined();
  });

  test("with render={<a href>} renders a single link containing its content, with our props and ref", () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <Card render={<a href="/units/tenses" />} aria-describedby="hint" ref={ref}>
        <h3>Tenses</h3>
        <p>3 of 5 Lessons</p>
      </Card>,
    );
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]!.getAttribute("href")).toBe("/units/tenses");
    expect(links[0]!.textContent).toBe("Tenses3 of 5 Lessons");
    expect(links[0]!.getAttribute("aria-describedby")).toBe("hint");
    expect(ref.current).toBe(links[0] as unknown as HTMLDivElement);
  });

  test("takes no className or style", () => {
    // @ts-expect-error className is not a prop
    <Card className="x">a</Card>;
    // @ts-expect-error style is not a prop
    <Card style={{}}>a</Card>;
  });
});

describe("Chip", () => {
  test("renders its label and its icon, and the icon adds nothing to the text", () => {
    const { container } = render(
      <Chip tone="soft" icon={Fire}>
        12 days
      </Chip>,
    );
    expect(screen.getByText("12 days")).toBeDefined();
    const icon = container.querySelector("svg")!;
    expect(icon.getAttribute("aria-hidden")).toBe("true");
    expect(container.textContent).toBe("12 days");
  });

  test("renders without an icon", () => {
    const { container } = render(<Chip>B1</Chip>);
    expect(container.textContent).toBe("B1");
    expect(container.querySelector("svg")).toBeNull();
  });

  test("needs a label, tone takes role names only, and no className or style", () => {
    // @ts-expect-error tone is a role name, not a colour
    <Chip tone="violet">a</Chip>;
    // @ts-expect-error a label is required, the icon is decorative
    <Chip icon={Fire} />;
    // @ts-expect-error className is not a prop
    <Chip className="x">a</Chip>;
    // @ts-expect-error style is not a prop
    <Chip style={{}}>a</Chip>;
  });
});

describe("VerdictTag", () => {
  test("always shows the verdict as a word, not colour alone", () => {
    const words = (["correct", "almost", "incorrect"] as const).map(
      (verdict) => render(<VerdictTag verdict={verdict} />).container.textContent,
    );
    expect(words).toEqual(["Correct", "Almost", "Incorrect"]);
  });

  test("takes only the three verdicts, and no children, className or style", () => {
    // @ts-expect-error not a verdict
    <VerdictTag verdict="wrong" />;
    // @ts-expect-error the word is built in
    <VerdictTag verdict="correct">Nice</VerdictTag>;
    // @ts-expect-error className is not a prop
    <VerdictTag verdict="correct" className="x" />;
    // @ts-expect-error style is not a prop
    <VerdictTag verdict="correct" style={{}} />;
  });
});
