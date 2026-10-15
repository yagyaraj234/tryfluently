import { describe, expect, test } from "bun:test";
import { dirname } from "node:path";
import { compile } from "@tailwindcss/node";

async function compileStyles(classes: string[]) {
  const path = Bun.resolveSync("@impromptu/ui/styles.css", import.meta.dir);
  const compiler = await compile(await Bun.file(path).text(), {
    base: dirname(path),
    onDependency: () => {},
  });
  return compiler.build(classes);
}

const hasRule = (css: string, cls: string) => new RegExp(`\\.${cls}\\s*\\{`).test(css);

describe("styles.css", () => {
  const tokenClasses = ["bg-primary", "p-4", "text-body", "shadow-card"];
  const offPalette = ["bg-blue-500", "p-7", "text-brand"];

  test("token classes produce CSS, palette and default classes produce none", async () => {
    const css = await compileStyles([...tokenClasses, ...offPalette]);
    for (const cls of tokenClasses) expect({ cls, generated: hasRule(css, cls) }).toEqual({ cls, generated: true });
    for (const cls of offPalette) expect({ cls, generated: hasRule(css, cls) }).toEqual({ cls, generated: false });
  });
});

describe("tokens.css theming", () => {
  const LIGHT_PAPER = "#ffffff";
  const DARK_PAPER = "#1b230c";

  async function paperFor(colorScheme: "light" | "dark", dataTheme?: "light" | "dark") {
    const { Window } = await import("happy-dom");
    const window = new Window({ settings: { device: { prefersColorScheme: colorScheme } } });
    const { document } = window;
    const style = document.createElement("style");
    style.textContent = await Bun.file(Bun.resolveSync("@impromptu/ui/tokens.css", import.meta.dir)).text();
    document.head.appendChild(style);
    if (dataTheme) document.documentElement.dataset.theme = dataTheme;
    const value = window.getComputedStyle(document.documentElement).getPropertyValue("--paper").trim();
    await window.happyDOM.close();
    return value;
  }

  test("follow the system setting when no theme is chosen", async () => {
    expect(await paperFor("light")).toBe(LIGHT_PAPER);
    expect(await paperFor("dark")).toBe(DARK_PAPER);
  });

  test("an explicit theme wins over the system setting either way", async () => {
    expect(await paperFor("dark", "light")).toBe(LIGHT_PAPER);
    expect(await paperFor("light", "dark")).toBe(DARK_PAPER);
  });
});

describe("package exports", () => {
  test("expose the barrel and the two stylesheets", () => {
    for (const entry of ["@impromptu/ui", "@impromptu/ui/tokens.css", "@impromptu/ui/styles.css"]) {
      expect(() => Bun.resolveSync(entry, import.meta.dir)).not.toThrow();
    }
  });

  test("block deep imports", () => {
    expect(() => Bun.resolveSync("@impromptu/ui/src/Screen.tsx", import.meta.dir)).toThrow();
    expect(() => Bun.resolveSync("@impromptu/ui/src/index.ts", import.meta.dir)).toThrow();
  });
});
