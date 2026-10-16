import { describe, expect, mock, test } from "bun:test";
import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ArrowRight, X } from "@phosphor-icons/react";
import { Button, IconButton, TextLink } from "@impromptu/ui";

describe("Button", () => {
  test("renders a button named by its text, and the icon adds nothing to the name", () => {
    const onClick = mock();
    render(
      <Button icon={ArrowRight} onClick={onClick}>
        Next step
      </Button>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Next step" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test("with render={<a href>} renders a link that keeps the button's props, name and ref", () => {
    const onClick = mock();
    const ref = createRef<HTMLButtonElement>();
    render(
      <Button render={<a href="/lessons/1" />} onClick={onClick} aria-describedby="hint" ref={ref} icon={ArrowRight}>
        Start lesson
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Start lesson" });
    expect(link.getAttribute("href")).toBe("/lessons/1");
    expect(link.getAttribute("aria-describedby")).toBe("hint");
    expect(ref.current).toBe(link as unknown as HTMLButtonElement);
    fireEvent.click(link);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test("a disabled button ignores clicks", () => {
    const onClick = mock();
    render(
      <Button disabled onClick={onClick}>
        Save
      </Button>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onClick).not.toHaveBeenCalled();
  });

  test("takes no className or style", () => {
    // @ts-expect-error className is not a prop
    <Button className="x">a</Button>;
    // @ts-expect-error style is not a prop
    <Button style={{}}>a</Button>;
  });
});

describe("IconButton", () => {
  test("requires a label", () => {
    // @ts-expect-error label is required
    <IconButton icon={X} />;
  });

  test("is named by its label", () => {
    const onClick = mock();
    render(<IconButton icon={X} label="Close" onClick={onClick} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test("with render renders the passed element, named by the label", () => {
    render(<IconButton icon={X} label="Back to home" render={<a href="/" />} />);
    expect(screen.getByRole("link", { name: "Back to home" }).getAttribute("href")).toBe("/");
  });

  test("takes no className or style", () => {
    // @ts-expect-error className is not a prop
    <IconButton icon={X} label="Close" className="x" />;
    // @ts-expect-error style is not a prop
    <IconButton icon={X} label="Close" style={{}} />;
  });
});

describe("TextLink", () => {
  test("is a button by default, for actions like switching to typing", () => {
    const onClick = mock();
    render(<TextLink onClick={onClick}>Type instead</TextLink>);
    fireEvent.click(screen.getByRole("button", { name: "Type instead" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test("with render renders the passed element", () => {
    render(<TextLink render={<a href="/privacy" />}>Privacy</TextLink>);
    expect(screen.getByRole("link", { name: "Privacy" }).getAttribute("href")).toBe("/privacy");
  });

  test("takes no className or style", () => {
    // @ts-expect-error className is not a prop
    <TextLink className="x">a</TextLink>;
    // @ts-expect-error style is not a prop
    <TextLink style={{}}>a</TextLink>;
  });
});
