import { describe, expect, test } from "bun:test";
import { dirname } from "node:path";
import { compile, optimize } from "@tailwindcss/node";
import { ESLint } from "eslint";

async function compileStyles(classes: string[]) {
  const path = Bun.resolveSync("@impromptu/ui/styles.css", import.meta.dir);
  const compiler = await compile(await Bun.file(path).text(), {
    base: dirname(path),
    onDependency: () => {},
  });
  return compiler.build(classes);
}

/** happy-dom ignores @layer, so unwrap the blocks. Source order already matches layer order here. */
function unlayer(css: string) {
  let out = css.replace(/@layer [\w, ]+;/g, "");
  for (let i = out.indexOf("@layer"); i !== -1; i = out.indexOf("@layer")) {
    const open = out.indexOf("{", i);
    let depth = 1;
    let j = open + 1;
    for (; depth; j++) depth += out[j] === "{" ? 1 : out[j] === "}" ? -1 : 0;
    out = out.slice(0, i) + out.slice(open + 1, j - 1) + out.slice(j);
  }
  return out;
}

const hasRule = (css: string, cls: string) => new RegExp(`\\.${cls}\\s*\\{`).test(css);

describe("styles.css", () => {
  const tokenClasses = ["bg-primary", "p-7", "text-body", "shadow-card", "rounded-3xl", "grid-cols-2"];
  const offPalette = ["bg-blue-500", "text-red-600", "shadow-lg"];

  test("theme colours and Tailwind's scales produce CSS, Tailwind's palette and shadows produce none", async () => {
    const css = await compileStyles([...tokenClasses, ...offPalette]);
    for (const cls of tokenClasses) expect({ cls, generated: hasRule(css, cls) }).toEqual({ cls, generated: true });
    for (const cls of offPalette) expect({ cls, generated: hasRule(css, cls) }).toEqual({ cls, generated: false });
  });

  test("type roles only set type: no colour shares a role's name", async () => {
    const roles = ["label", "caption", "body", "title", "heading", "page", "hero"];
    const css = await compileStyles(roles.map((r) => `text-${r}`));
    expect(css).not.toMatch(/\.text-[a-z]+ \{[^}]*\bcolor:/);
  });

  test("celebration motion is enabled only when reduced motion is not requested", async () => {
    const css = await compileStyles(["motion-safe:animate-celebrate"]);
    expect(css).toContain("@media (prefers-reduced-motion: no-preference)");
    expect(css).toContain("--animate-celebrate");
    expect(css).toContain("@keyframes celebrate");
  });
});

describe("theming", () => {
  const LIGHT_PAPER = "#fff"; // minified, as shipped
  const DARK_PAPER = "#262625";
  // Flattened the way the app's build ships it, since happy-dom reads neither nesting nor layers.
  const css = compileStyles(["bg-paper"]).then((source) => unlayer(optimize(source).code));

  async function paperFor(colorScheme: "light" | "dark", dataTheme?: "light" | "dark") {
    const { Window } = await import("happy-dom");
    const window = new Window({ settings: { device: { prefersColorScheme: colorScheme } } });
    const { document } = window;
    const style = document.createElement("style");
    style.textContent = await css;
    document.head.appendChild(style);
    if (dataTheme) document.documentElement.dataset.theme = dataTheme;
    const value = window.getComputedStyle(document.documentElement).getPropertyValue("--color-paper").trim();
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
  test("expose the barrel, the one stylesheet and the apps lint config", () => {
    for (const entry of ["@impromptu/ui", "@impromptu/ui/styles.css", "@impromptu/ui/eslint"]) {
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
    expect(await lintApp(`import "@impromptu/ui/styles.css";`)).toEqual([]);
    expect(await lintApp(`import appCss from "@impromptu/ui/styles.css?url";`)).toEqual([]);
  });
});

describe("ui package lint config", () => {
  const eslint = new ESLint({ cwd: dirname(import.meta.dir) });
  const lintUi = (code: string) => lintWith(eslint, code, "src/Fixture.tsx");
  const lintClasses = (classes: string) => lintUi(`import { cva } from "class-variance-authority";\nexport const fixture = cva("${classes}");`);
  const RESTRICTED = "better-tailwindcss/no-restricted-classes";

  test("theme classes, Tailwind's scales, variants and opacity modifiers pass", async () => {
    expect(await lintClasses("bg-primary p-7 text-body shadow-card rounded-3xl md:grid-cols-2 lg:p-14")).toEqual([]);
    expect(await lintClasses("data-open:bg-primary-soft data-disabled:text-muted dark:bg-paper bg-on-brand/15")).toEqual([]);
  });

  test("arbitrary values pass, unless they hold a raw colour", async () => {
    expect(await lintClasses("max-w-[40ch] origin-(--transform-origin) bg-[radial-gradient(circle,var(--color-ink)_1px,transparent_2px)]")).toEqual([]);
    for (const cls of ["bg-[#fff]", "text-[rgb(0_0_0)]", "shadow-[0_0_0_1px_oklch(0.5_0.1_200)]"]) {
      expect({ cls, rules: await lintClasses(cls) }).toEqual({ cls, rules: [RESTRICTED] });
    }
  });

  test("classes outside the tokens fail", async () => {
    expect(await lintClasses("bg-blue-500")).toEqual(["better-tailwindcss/no-unknown-classes"]);
  });

  test("plain-number durations and z-indexes fail", async () => {
    expect(await lintClasses("z-10")).toEqual([RESTRICTED]);
    expect(await lintClasses("hover:duration-150")).toEqual([RESTRICTED]);
    // Stacked variants, negatives and the important modifier don't sneak past.
    for (const cls of ["lg:hover:z-10", "-z-10", "z-10!", "!z-10", "group-hover/item:z-10"]) {
      expect({ cls, rules: await lintClasses(cls) }).toEqual({ cls, rules: [RESTRICTED] });
    }
    expect(await lintClasses("z-overlay z-behind duration-ui ease-press lg:z-sticky")).toEqual([]);
  });

  test("borders are 1px or 2px", async () => {
    for (const cls of ["border-3", "border-t-4", "focus:border-x-4", "divide-x-8"]) {
      expect({ cls, rules: await lintClasses(cls) }).toEqual({ cls, rules: [RESTRICTED] });
    }
    expect(await lintClasses("border border-t border-2 border-b-2 border-0 border-line divide-y border-2!")).toEqual([]);
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
