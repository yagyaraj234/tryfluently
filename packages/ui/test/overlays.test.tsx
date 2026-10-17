import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DotsThree } from "@phosphor-icons/react";
import { Button, Dialog, IconButton, Menu, Sheet } from "@impromptu/ui";

describe("Dialog", () => {
  function renderDialog(onOpenChange = mock()) {
    render(
      <>
        <Button>Outside</Button>
        <Dialog open onOpenChange={onOpenChange} title="Delete this lesson?" description="Your answers will be lost.">
          <Button>Delete</Button>
        </Dialog>
      </>,
    );
    return onOpenChange;
  }

  test("is named by its title and described by its description", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog", { name: "Delete this lesson?" });
    expect(document.getElementById(dialog.getAttribute("aria-describedby")!)!.textContent).toBe(
      "Your answers will be lost.",
    );
  });

  test("traps focus: focus moves inside and the page behind is hidden from assistive tech", async () => {
    renderDialog();
    const dialog = screen.getByRole("dialog", { name: "Delete this lesson?" });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    expect(screen.queryByRole("button", { name: "Outside" })).toBeNull();
  });

  test("Escape asks to close with onOpenChange(false)", () => {
    const onOpenChange = renderDialog();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange.mock.calls[0]![0]).toBe(false);
  });

  test("the built-in close button asks to close", () => {
    const onOpenChange = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onOpenChange.mock.calls[0]![0]).toBe(false);
  });

  test("renders nothing while closed", () => {
    render(<Dialog open={false} onOpenChange={() => {}} title="Hidden" />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("takes no className or style", () => {
    // @ts-expect-error className is not a prop
    <Dialog open onOpenChange={() => {}} title="a" className="x" />;
    // @ts-expect-error style is not a prop
    <Dialog open onOpenChange={() => {}} title="a" style={{}} />;
  });
});

describe("Sheet", () => {
  test("behaves like Dialog: named by its title, traps focus, closes on Escape and the close button", async () => {
    const onOpenChange = mock();
    render(
      <>
        <Button>Outside</Button>
        <Sheet open onOpenChange={onOpenChange} title="Choose a theme" description="Light, Dark or System.">
          <Button>System</Button>
        </Sheet>
      </>,
    );
    const sheet = screen.getByRole("dialog", { name: "Choose a theme" });
    expect(document.getElementById(sheet.getAttribute("aria-describedby")!)!.textContent).toBe("Light, Dark or System.");
    await waitFor(() => expect(sheet.contains(document.activeElement)).toBe(true));
    expect(screen.queryByRole("button", { name: "Outside" })).toBeNull();

    fireEvent.keyDown(sheet, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onOpenChange.mock.calls.map((call) => call[0])).toEqual([false, false]);
  });

  test("takes no className or style", () => {
    // @ts-expect-error className is not a prop
    <Sheet open onOpenChange={() => {}} title="a" className="x" />;
    // @ts-expect-error style is not a prop
    <Sheet open onOpenChange={() => {}} title="a" style={{}} />;
  });
});

describe("Menu", () => {
  async function openMenu(onSelect = mock()) {
    render(
      <Menu
        trigger={<IconButton icon={DotsThree} label="More" />}
        items={[
          { label: "Rename", onSelect },
          { label: "Settings", render: <a href="/settings" /> },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    await screen.findByRole("menu");
    return onSelect;
  }

  test("the trigger opens a menu of items", async () => {
    await openMenu();
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Rename", "Settings"]);
  });

  test("an item fires onSelect", async () => {
    const onSelect = await openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  test("a render item renders the passed element as a menu item", async () => {
    await openMenu();
    const item = screen.getByRole("menuitem", { name: "Settings" });
    expect(item.tagName).toBe("A");
    expect(item.getAttribute("href")).toBe("/settings");
  });

  test("each item takes onSelect or render, not both or neither", () => {
    const trigger = <Button>Open</Button>;
    // @ts-expect-error an item needs onSelect or render
    <Menu trigger={trigger} items={[{ label: "Nothing" }]} />;
    // @ts-expect-error not both
    <Menu trigger={trigger} items={[{ label: "Both", onSelect: () => {}, render: <a href="/" /> }]} />;
  });

  test("takes no className or style", () => {
    // @ts-expect-error className is not a prop
    <Menu trigger={<Button>Open</Button>} items={[]} className="x" />;
    // @ts-expect-error style is not a prop
    <Menu trigger={<Button>Open</Button>} items={[]} style={{}} />;
  });
});
