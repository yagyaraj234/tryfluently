import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { Star } from "@phosphor-icons/react";
import { Heading, Screen, Text, UIProvider } from "@impromptu/ui";

describe("UIProvider", () => {
  test("renders the app inside it", () => {
    render(
      <UIProvider>
        <Screen>Home</Screen>
      </UIProvider>,
    );
    expect(screen.getByRole("main").textContent).toBe("Home");
  });

  test("makes icons Bold at 1em unless told otherwise", () => {
    const inside = render(
      <UIProvider>
        <Star />
      </UIProvider>,
    ).container.querySelector("svg")!.outerHTML;
    const boldAt1em = render(<Star weight="bold" size="1em" />).container.querySelector("svg")!.outerHTML;
    const plain = render(<Star />).container.querySelector("svg")!.outerHTML;
    expect(inside).toBe(boldAt1em);
    expect(inside).not.toBe(plain);
  });
});

describe("Screen", () => {
  test("renders its content inside a main landmark", () => {
    render(<Screen>Hello</Screen>);
    expect(screen.getByRole("main").textContent).toBe("Hello");
  });

  test("takes no className or style", () => {
    // @ts-expect-error className is not a prop
    <Screen className="x" />;
    // @ts-expect-error style is not a prop
    <Screen style={{}} />;
  });
});

describe("Text", () => {
  test("renders a paragraph by default", () => {
    render(<Text>Aim for 30 to 90 seconds</Text>);
    expect(screen.getByText("Aim for 30 to 90 seconds").tagName).toBe("P");
  });

  test("renders the element passed as `as`", () => {
    render(
      <Text as="span" size="label" tone="muted" tabular>
        Step 4
      </Text>,
    );
    expect(screen.getByText("Step 4").tagName).toBe("SPAN");
  });

  test("takes no className or style", () => {
    // @ts-expect-error className is not a prop
    <Text className="x">a</Text>;
    // @ts-expect-error style is not a prop
    <Text style={{}}>a</Text>;
  });
});

describe("Heading", () => {
  test.each([
    [1, "page"],
    [2, "heading"],
    [3, "title"],
  ] as const)("level %i renders its h element and looks like size %s by default", (level, size) => {
    render(
      <>
        <Heading level={level}>Default</Heading>
        <Heading level={level} size={size}>
          Default
        </Heading>
      </>,
    );
    const [plain, explicit] = screen.getAllByRole("heading", { level });
    expect(plain!.tagName).toBe(`H${level}`);
    expect(plain!.outerHTML).toBe(explicit!.outerHTML);
  });

  test("size overrides the level's default look", () => {
    render(
      <>
        <Heading level={2}>Default</Heading>
        <Heading level={2} size="hero">
          Default
        </Heading>
      </>,
    );
    const [plain, hero] = screen.getAllByRole("heading", { level: 2 });
    expect(plain!.outerHTML).not.toBe(hero!.outerHTML);
  });

  test("takes no className or style", () => {
    // @ts-expect-error className is not a prop
    <Heading level={1} className="x">
      a
    </Heading>;
    // @ts-expect-error style is not a prop
    <Heading level={1} style={{}}>
      a
    </Heading>;
  });
});
