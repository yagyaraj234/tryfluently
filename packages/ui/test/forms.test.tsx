import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { ChoiceChips, Select, Switch, TextArea, TextField } from "@fluently/ui";

describe("TextField", () => {
  test("labels the input and links its description and error", () => {
    render(<TextField label="Name" description="Shown on your profile" error="Enter your name" />);
    const input = screen.getByRole("textbox", { name: "Name" });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const describedBy = input.getAttribute("aria-describedby")!.split(" ");
    const linked = describedBy.map((id) => document.getElementById(id)!.textContent);
    expect(linked).toContain("Shown on your profile");
    expect(linked).toContain("Enter your name");
    expect(screen.getByRole("alert").textContent).toBe("Enter your name");
  });

  test("is valid and quiet without an error", () => {
    render(<TextField label="Name" />);
    expect(screen.getByRole("textbox", { name: "Name" }).getAttribute("aria-invalid")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("works uncontrolled and reports changes", () => {
    const changes: string[] = [];
    render(<TextField label="Name" defaultValue="Ana" onValueChange={(v) => changes.push(v)} />);
    const input = screen.getByRole("textbox", { name: "Name" }) as HTMLInputElement;
    expect(input.value).toBe("Ana");
    fireEvent.change(input, { target: { value: "Anabel" } });
    expect(input.value).toBe("Anabel");
    expect(changes).toEqual(["Anabel"]);
  });

  test("respects a controlled value", () => {
    const changes: string[] = [];
    render(<TextField label="Name" value="Ana" onValueChange={(v) => changes.push(v)} />);
    const input = screen.getByRole("textbox", { name: "Name" }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Anabel" } });
    expect(changes).toEqual(["Anabel"]);
    expect(input.value).toBe("Ana");
  });

  test("passes ref to the input", () => {
    const ref = createRef<HTMLInputElement>();
    render(<TextField label="Name" ref={ref} />);
    expect(ref.current).toBe(screen.getByRole("textbox", { name: "Name" }) as HTMLInputElement);
  });

  test("requires a label and takes no className or style", () => {
    // @ts-expect-error label is required
    <TextField />;
    // @ts-expect-error className is not a prop
    <TextField label="Name" className="x" />;
    // @ts-expect-error style is not a prop
    <TextField label="Name" style={{}} />;
  });
});

describe("TextArea", () => {
  test("renders a labelled textarea with its description and error linked", () => {
    render(<TextArea label="Answer" description="One or two sentences" error="Too short" />);
    const box = screen.getByRole("textbox", { name: "Answer" });
    expect(box.tagName).toBe("TEXTAREA");
    expect(box.getAttribute("aria-invalid")).toBe("true");
    const linked = box
      .getAttribute("aria-describedby")!
      .split(" ")
      .map((id) => document.getElementById(id)!.textContent);
    expect(linked).toEqual(expect.arrayContaining(["One or two sentences", "Too short"]));
    expect(screen.getByRole("alert").textContent).toBe("Too short");
  });

  test("works uncontrolled and controlled", () => {
    const changes: string[] = [];
    render(
      <>
        <TextArea label="Free" defaultValue="a" onValueChange={(v) => changes.push(v)} />
        <TextArea label="Held" value="b" onValueChange={(v) => changes.push(v)} />
      </>,
    );
    const free = screen.getByRole("textbox", { name: "Free" }) as HTMLTextAreaElement;
    const held = screen.getByRole("textbox", { name: "Held" }) as HTMLTextAreaElement;
    fireEvent.change(free, { target: { value: "ab" } });
    fireEvent.change(held, { target: { value: "bc" } });
    expect(changes).toEqual(["ab", "bc"]);
    expect(free.value).toBe("ab");
    expect(held.value).toBe("b");
  });

  test("passes ref to the textarea", () => {
    const ref = createRef<HTMLTextAreaElement>();
    render(<TextArea label="Answer" ref={ref} />);
    expect(ref.current!.tagName).toBe("TEXTAREA");
  });

  test("requires a label and takes no className or style", () => {
    // @ts-expect-error label is required
    <TextArea />;
    // @ts-expect-error className is not a prop
    <TextArea label="Answer" className="x" />;
    // @ts-expect-error style is not a prop
    <TextArea label="Answer" style={{}} />;
  });
});

const themes = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

describe("ChoiceChips", () => {
  test.each(["chips", "segmented"] as const)(
    "%s layout keeps radio semantics and arrow-key selection",
    async (layout) => {
      const changes: string[] = [];
      render(
        <ChoiceChips
          layout={layout}
          label="Theme"
          options={themes}
          defaultValue="light"
          onValueChange={(v) => changes.push(v)}
        />,
      );
      screen.getByRole("radiogroup", { name: "Theme" });
      const light = screen.getByRole("radio", { name: "Light" });
      expect(light.getAttribute("aria-checked")).toBe("true");

      light.focus();
      fireEvent.keyDown(light, { key: "ArrowRight" });
      const dark = screen.getByRole("radio", { name: "Dark" });
      // Base UI moves focus in a microtask.
      await waitFor(() => expect(document.activeElement === dark).toBe(true));
      expect(dark.getAttribute("aria-checked")).toBe("true");
      expect(light.getAttribute("aria-checked")).toBe("false");
      expect(changes).toEqual(["dark"]);
    },
  );

  test("single mode respects a controlled value", () => {
    const changes: (string | null)[] = [];
    render(<ChoiceChips label="Theme" options={themes} value={null} onValueChange={(v) => changes.push(v)} />);
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(changes).toEqual(["dark"]);
    expect(screen.getByRole("radio", { name: "Dark" }).getAttribute("aria-checked")).toBe("false");
  });

  test("multiple mode is a labelled group of checkboxes", () => {
    const changes: string[][] = [];
    render(
      <ChoiceChips
        label="Goals"
        multiple
        options={[
          { value: "work", label: "Work" },
          { value: "travel", label: "Travel" },
        ]}
        defaultValue={["work"]}
        onValueChange={(v) => changes.push(v)}
      />,
    );
    screen.getByRole("group", { name: "Goals" });
    const work = screen.getByRole("checkbox", { name: "Work" });
    const travel = screen.getByRole("checkbox", { name: "Travel" });
    expect(work.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(travel);
    expect(travel.getAttribute("aria-checked")).toBe("true");
    expect(work.getAttribute("aria-checked")).toBe("true");
    expect(changes).toEqual([["work", "travel"]]);
  });

  test("multiple mode respects a controlled value", () => {
    const changes: string[][] = [];
    render(<ChoiceChips label="Goals" multiple options={themes} value={[]} onValueChange={(v) => changes.push(v)} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Dark" }));
    expect(changes).toEqual([["dark"]]);
    expect(screen.getByRole("checkbox", { name: "Dark" }).getAttribute("aria-checked")).toBe("false");
  });

  test("requires a label, matches value to mode, and takes no className or style", () => {
    // @ts-expect-error label is required
    <ChoiceChips options={themes} />;
    // @ts-expect-error single mode takes one value
    <ChoiceChips label="Theme" options={themes} value={["light"]} />;
    // @ts-expect-error multiple mode takes a list
    <ChoiceChips label="Goals" multiple options={themes} value="light" />;
    // @ts-expect-error className is not a prop
    <ChoiceChips label="Theme" options={themes} className="x" />;
    // @ts-expect-error style is not a prop
    <ChoiceChips label="Theme" options={themes} style={{}} />;
  });

  test("submits the picked values under its name in both modes", () => {
    const { container } = render(
      <form>
        <ChoiceChips label="Theme" name="theme" options={themes} defaultValue="dark" />
        <ChoiceChips label="Goals" name="goals" multiple options={themes} defaultValue={["light", "system"]} />
      </form>,
    );
    const data = new FormData(container.querySelector("form")!);
    expect(data.getAll("theme")).toEqual(["dark"]);
    expect(data.getAll("goals")).toEqual(["light", "system"]);
  });

  test("passes ref to the group", () => {
    const ref = createRef<HTMLDivElement>();
    render(<ChoiceChips label="Theme" options={themes} ref={ref} />);
    expect(ref.current === screen.getByRole("radiogroup", { name: "Theme" })).toBe(true);
  });
});

describe("Switch", () => {
  test("is a labelled switch that toggles on its own", () => {
    const changes: boolean[] = [];
    render(<Switch label="Sound effects" defaultChecked onCheckedChange={(c) => changes.push(c)} />);
    const toggle = screen.getByRole("switch", { name: "Sound effects" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(screen.getByText("Sound effects"));
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(changes).toEqual([false, true]);
  });

  test("respects a controlled value", () => {
    const changes: boolean[] = [];
    render(<Switch label="Sound effects" checked={false} onCheckedChange={(c) => changes.push(c)} />);
    const toggle = screen.getByRole("switch", { name: "Sound effects" });
    fireEvent.click(toggle);
    expect(changes).toEqual([true]);
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });

  test("passes ref to the switch", () => {
    const ref = createRef<HTMLElement>();
    render(<Switch label="Sound effects" ref={ref} />);
    expect(ref.current === screen.getByRole("switch", { name: "Sound effects" })).toBe(true);
  });

  test("requires a label and takes no className or style", () => {
    // @ts-expect-error label is required
    <Switch />;
    // @ts-expect-error className is not a prop
    <Switch label="Sound" className="x" />;
    // @ts-expect-error style is not a prop
    <Switch label="Sound" style={{}} />;
  });
});

/** A real mouse click on an option: Base UI only accepts clicks that started on the item. */
function pick(option: HTMLElement) {
  fireEvent.pointerDown(option, { pointerType: "mouse" });
  fireEvent.click(option);
}

describe("Select", () => {
  test("is a labelled control that picks an option on its own", async () => {
    const changes: string[] = [];
    render(<Select label="Theme" options={themes} defaultValue="light" onValueChange={(v) => changes.push(v)} />);
    const trigger = screen.getByRole("combobox", { name: "Theme" });
    expect(trigger.textContent).toContain("Light");

    fireEvent.click(trigger);
    pick(await screen.findByRole("option", { name: "Dark" }));
    expect(changes).toEqual(["dark"]);
    await waitFor(() => expect(trigger.textContent).toContain("Dark"));
  });

  test("respects a controlled value", async () => {
    const changes: string[] = [];
    render(<Select label="Theme" options={themes} value="light" onValueChange={(v) => changes.push(v)} />);
    const trigger = screen.getByRole("combobox", { name: "Theme" });
    fireEvent.click(trigger);
    pick(await screen.findByRole("option", { name: "Dark" }));
    expect(changes).toEqual(["dark"]);
    expect(trigger.textContent).toContain("Light");
  });

  test("passes ref to the trigger", () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Select label="Theme" options={themes} ref={ref} />);
    expect(ref.current === screen.getByRole("combobox", { name: "Theme" })).toBe(true);
  });

  test("requires a label and takes no className or style", () => {
    // @ts-expect-error label is required
    <Select options={themes} />;
    // @ts-expect-error className is not a prop
    <Select label="Theme" options={themes} className="x" />;
    // @ts-expect-error style is not a prop
    <Select label="Theme" options={themes} style={{}} />;
  });
});
