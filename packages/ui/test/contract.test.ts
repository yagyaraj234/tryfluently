import { describe, expect, test } from "bun:test";
import { dirname } from "node:path";
import { compile } from "@tailwindcss/node";
import { ESLint } from "eslint";

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

  test("celebration motion is enabled only when reduced motion is not requested", async () => {
    const css = await compileStyles(["motion-safe:animate-celebrate"]);
    expect(css).toContain("@media (prefers-reduced-motion: no-preference)");
    expect(css).toContain("--duration-celebrate");
    expect(css).toContain("@keyframes celebrate");
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
  test("expose the barrel, the two stylesheets and the apps lint config", () => {
    for (const entry of ["@impromptu/ui", "@impromptu/ui/tokens.css", "@impromptu/ui/styles.css", "@impromptu/ui/eslint"]) {
      expect(() => Bun.resolveSync(entry, import.meta.dir)).not.toThrow();
    }
  });

  test("block deep imports", () => {
    expect(() => Bun.resolveSync("@impromptu/ui/src/Screen.tsx", import.meta.dir)).toThrow();
    expect(() => Bun.resolveSync("@impromptu/ui/src/index.ts", import.meta.dir)).toThrow();
  });
});

/** Lint `code` as if it were a file at `filePath`, returning the rule ids that fired. */
async function lintWith(eslint: ESLint, code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result!.messages.map((m) => m.ruleId ?? m.message);
}

describe("apps lint config", async () => {
  const { default: config } = await import("@impromptu/ui/eslint");
  const eslint = new ESLint({ cwd: import.meta.dir, overrideConfigFile: true, overrideConfig: config });
  const lintApp = (code: string, filePath = "app/route.tsx") => lintWith(eslint, code, filePath);

  test("every script file is covered", async () => {
    for (const file of ["app/a.js", "app/a.mjs", "app/a.ts", "app/a.mts", "app/a.cts"]) {
      expect({ file, rules: await lintApp(`import "./a.css";`, file) }).toEqual({ file, rules: ["no-restricted-imports"] });
    }
  });

  test("className and style on any element or component fail", async () => {
    expect(await lintApp(`export const A = () => <div className="p-4" />;`)).toEqual(["no-restricted-syntax"]);
    expect(await lintApp(`export const A = () => <Text style={{ color: "red" }} />;`)).toEqual(["no-restricted-syntax"]);
    expect(await lintApp(`const n: number = 1;\nexport const A = () => <Text size="body">{n}</Text>;`)).toEqual([]);
  });

  test("CSS imports fail, except the ui stylesheet", async () => {
    expect(await lintApp(`import "./app.css";`)).toEqual(["no-restricted-imports"]);
    expect(await lintApp(`import css from "some-lib/dist/theme.css?url";`)).toEqual(["no-restricted-imports"]);
    expect(await lintApp(`import "@impromptu/ui/tokens.css";`)).toEqual(["no-restricted-imports"]);
    expect(await lintApp(`import "@impromptu/ui/styles.css";`)).toEqual([]);
    expect(await lintApp(`import appCss from "@impromptu/ui/styles.css?url";`)).toEqual([]);
  });
});

describe("ui package lint config", () => {
  const eslint = new ESLint({ cwd: dirname(import.meta.dir) });
  const lintUi = (code: string) => lintWith(eslint, code, "src/Fixture.tsx");
  const lintClasses = (classes: string) => lintUi(`import { cva } from "class-variance-authority";\nexport const fixture = cva("${classes}");`);
  const RESTRICTED = "better-tailwindcss/no-restricted-classes";

  test("token classes, data-attribute variants and the surface classes pass", async () => {
    expect(await lintClasses("bg-primary p-4 text-body shadow-card focus-visible:focus-ring")).toEqual([]);
    expect(await lintClasses("data-open:bg-primary-soft data-disabled:text-muted dark:bg-paper")).toEqual([]);
    expect(await lintClasses("surface-loud surface-quiet")).toEqual([]);
  });

  test("arbitrary values fail, Base UI's own variables pass", async () => {
    expect(await lintClasses("w-[10px]")).toEqual([RESTRICTED]);
    expect(await lintClasses("w-(--my-width)")).toEqual([RESTRICTED]);
    expect(await lintClasses("origin-(--transform-origin) max-h-(--available-height) w-(--anchor-width)")).toEqual([]);
  });

  test("classes outside the tokens fail", async () => {
    expect(await lintClasses("bg-blue-500")).toEqual(["better-tailwindcss/no-unknown-classes"]);
  });

  test("opacity suffixes, plain-number durations and z-indexes fail", async () => {
    expect(await lintClasses("bg-primary/50")).toEqual([RESTRICTED]);
    expect(await lintClasses("z-10")).toEqual([RESTRICTED]);
    expect(await lintClasses("hover:duration-150")).toEqual([RESTRICTED]);
    // Stacked variants, negatives and the important modifier don't sneak past.
    for (const cls of ["desktop:hover:z-10", "-z-10", "z-10!", "!z-10", "group-hover/item:z-10", "bg-primary/50!"]) {
      expect({ cls, rules: await lintClasses(cls) }).toEqual({ cls, rules: [RESTRICTED] });
    }
    expect(await lintClasses("z-overlay duration-ui ease-press desktop:z-sticky")).toEqual([]);
  });

  test("border width is always 2", async () => {
    for (const cls of ["border", "border-3", "border-t", "focus:border-x-4", "data-open:hover:border", "divide-x"]) {
      expect({ cls, rules: await lintClasses(cls) }).toEqual({ cls, rules: [RESTRICTED] });
    }
    expect(await lintClasses("border-2 border-b-2 border-line border-solid divide-y-2 border-2!")).toEqual([]);
  });

  test("router, API, database and state-library imports fail", async () => {
    for (const lib of ["@tanstack/react-router", "@tanstack/react-query", "@impromptu/api", "@impromptu/db", "zustand"]) {
      expect({ lib, rules: await lintUi(`import { x } from "${lib}";`) }).toEqual({ lib, rules: ["no-restricted-imports"] });
    }
    expect(await lintUi(`import { Dialog } from "@base-ui/react/dialog";`)).toEqual([]);
  });

  test("network, media and storage globals fail", async () => {
    expect(await lintUi(`export const load = () => fetch("/api");`)).toEqual(["no-restricted-globals"]);
    expect(await lintUi(`export const read = () => localStorage.getItem("theme");`)).toEqual(["no-restricted-globals"]);
    expect(await lintUi(`export const load = () => window.fetch("/api");`)).toEqual(["no-restricted-syntax"]);
    expect(await lintUi(`export const read = () => globalThis.localStorage;`)).toEqual(["no-restricted-syntax"]);
    expect(await lintUi(`export const fetchLike = (fetch: () => void) => fetch();`)).toEqual([]);
  });
});
