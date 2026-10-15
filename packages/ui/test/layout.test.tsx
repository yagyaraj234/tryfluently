import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { Cluster, Container, Split, Stack } from "@impromptu/ui";

describe("Stack", () => {
  test("renders its children", () => {
    render(
      <Stack gap={4} align="center">
        <p>One</p>
        <p>Two</p>
      </Stack>,
    );
    expect(screen.getByText("One")).toBeTruthy();
    expect(screen.getByText("Two")).toBeTruthy();
  });

  test("takes only spacing steps for gap, and no className or style", () => {
    // @ts-expect-error 7 is not a spacing step
    <Stack gap={7} />;
    // @ts-expect-error className is not a prop
    <Stack className="x" />;
    // @ts-expect-error style is not a prop
    <Stack style={{}} />;
  });
});

describe("Cluster", () => {
  test("renders its children", () => {
    render(
      <Cluster gap={2} justify="between" align="center">
        <span>Skip</span>
        <span>Next</span>
      </Cluster>,
    );
    expect(screen.getByText("Skip")).toBeTruthy();
    expect(screen.getByText("Next")).toBeTruthy();
  });

  test("takes only spacing steps for gap, and no className or style", () => {
    // @ts-expect-error 7 is not a spacing step
    <Cluster gap={7} />;
    // @ts-expect-error className is not a prop
    <Cluster className="x" />;
    // @ts-expect-error style is not a prop
    <Cluster style={{}} />;
  });
});

describe("Container", () => {
  test("renders its children", () => {
    render(<Container width="prose">Your Debrief is ready</Container>);
    expect(screen.getByText("Your Debrief is ready")).toBeTruthy();
  });

  test("takes only the content and prose widths, and no className or style", () => {
    // @ts-expect-error wide is not a width token
    <Container width="wide" />;
    // @ts-expect-error className is not a prop
    <Container className="x" />;
    // @ts-expect-error style is not a prop
    <Container style={{}} />;
  });
});

describe("Split", () => {
  test("renders the main slot before the side slot", () => {
    render(<Split main={<p>Lesson</p>} side={<p>Roadmap</p>} />);
    const main = screen.getByText("Lesson");
    const side = screen.getByText("Roadmap");
    expect(main.compareDocumentPosition(side) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test("needs both slots, and takes no className or style", () => {
    // @ts-expect-error side is required
    <Split main="a" />;
    // @ts-expect-error className is not a prop
    <Split main="a" side="b" className="x" />;
    // @ts-expect-error style is not a prop
    <Split main="a" side="b" style={{}} />;
  });
});
