# Locking Tailwind v4 to design tokens

**Historical research (2026-10-15).** The shipped stylesheet is `packages/ui/src/styles.css`, imported by the web root route. Its `@source "./"` scans the UI package. The `apps/web` stylesheet setup below was a proposal; see [DESIGN.md](../../DESIGN.md) and the current CSS for the implemented boundary.

Research for [#53](https://github.com/yagyaraj234/impromptu-monorepo/issues/53), part of the UI map [#51](https://github.com/yagyaraj234/impromptu-monorepo/issues/51). Checked against Tailwind CSS **v4.3.3** (the latest release, [tailwindlabs/tailwindcss releases](https://github.com/tailwindlabs/tailwindcss/releases)) and eslint-plugin-better-tailwindcss **4.9.1**. The example `tokens.css` and lint config below were compiled and linted locally with those versions. The results are noted inline as "Verified".

## Answer in brief

1. Put `--*: initial` at the top of one `@theme` block in `packages/ui`. That wipes every default namespace, so only our tokens make utilities.
2. Keep raw light and dark values as plain CSS variables (`--primary`, `--ink`, ...) in `:root`, the dark media query and `:root[data-theme="dark"]`, exactly as `DESIGN.md` sketches. Map them into Tailwind with **`@theme inline`**, so `bg-primary` compiles to `var(--primary)` and follows dark mode and the `.surface-*` classes.
3. Use named spacing steps (`--spacing-1 ... --spacing-14`) and **no** `--spacing` base. Without the base, `p-7` does not exist.
4. Override `dark` with a block `@custom-variant` that matches `[data-theme="dark"]` plus a `prefers-color-scheme` fallback. It is rarely needed, because tokens already swap.
5. In `apps/web`, use `@import "tailwindcss" source(none)` with `@source` pointed at `packages/ui/src`. Even a stray class in a screen then generates no CSS.
6. Tailwind can't switch off arbitrary values (`bg-[#fff]` still compiles after the wipe). Lint has to ban them.
7. Lint with **eslint-plugin-better-tailwindcss** (`no-unknown-classes` + `no-restricted-classes`) on `packages/ui`, and core ESLint **`no-restricted-syntax`** banning `className`/`style` on `apps/*`.
8. Every component, including layout ones, lives in `packages/ui`, and the package owns its tokens and lint entry. Any future app reuses it with the same three-line stylesheet (section 4), and the `apps/*` lint glob covers that app automatically.

## 1. Wiping the default theme

- To clear one namespace, set it to `initial` with the asterisk syntax, e.g. `--color-*: initial`. That removes defaults like `bg-red-500` and leaves only your values. ([theme docs: Overriding the default theme](https://tailwindcss.com/docs/theme#overriding-the-default-theme))
- To clear **all** namespaces, use `--*: initial`. Then "none of the default utility classes that are driven by theme variables will be available". ([theme docs: Using a custom theme](https://tailwindcss.com/docs/theme#using-a-custom-theme))
- In the compiler, `--*: initial` calls `values.clear()` on the whole theme map, while `--color-*: initial` only clears that namespace. ([theme.ts `add()`](https://github.com/tailwindlabs/tailwindcss/blob/main/packages/tailwindcss/src/theme.ts))

**All vs selected namespaces.** Selected wipes (`--color-*`, `--spacing-*`, `--font-*`, ...) leave every other default namespace live, such as `--blur-*`, `--perspective-*`, `--aspect-*`, `--breakpoint-*`, `--container-*` and `--animate-*` ([namespace table](https://tailwindcss.com/docs/theme#theme-variable-namespaces)). Our rule is "only our tokens exist", so **wipe all** and add back what we use. Things to add back on purpose:

- **Breakpoints and containers.** `--breakpoint-*` drives `sm:` etc. and `--container-*` drives `@sm:` and `max-w-md` ([namespace table](https://tailwindcss.com/docs/theme#theme-variable-namespaces)). We need one desktop breakpoint and a 640px content width (`DESIGN.md`, Layout).
- **Font weights.** `font-bold` reads `--font-weight-bold` ([namespace table](https://tailwindcss.com/docs/theme#theme-variable-namespaces)). Verified: after the wipe it only exists if we define it.
- **Default font.** Preflight sets `html` to `--theme(--default-font-family, <system stack>)`, and the default theme defines `--default-font-family: --theme(--font-sans, initial)` ([preflight.css](https://github.com/tailwindlabs/tailwindcss/blob/main/packages/tailwindcss/preflight.css), [theme.css](https://github.com/tailwindlabs/tailwindcss/blob/main/packages/tailwindcss/theme.css)). The wipe removes that line, so set `--default-font-family` ourselves. Verified: without it the page falls back to the system stack.
- **Spacing.** See the next section.

**What the wipe does *not* constrain.** Some utilities accept bare values with no theme at all:

- `border-<n>` falls back to `${n}px` for any positive integer ([utilities.ts, border width](https://github.com/tailwindlabs/tailwindcss/blob/main/packages/tailwindcss/src/utilities.ts)). Verified: `border-2` compiles after the wipe.
- `z-<n>`, `opacity-<n>` and `grid-cols-<n>` have similar `handleBareValue` paths ([utilities.ts](https://github.com/tailwindlabs/tailwindcss/blob/main/packages/tailwindcss/src/utilities.ts)).
- Arbitrary values (`bg-[#bada55]`) and arbitrary properties (`[mask-type:luminance]`) "work for everything in the framework" ([adding custom styles](https://tailwindcss.com/docs/adding-custom-styles#using-arbitrary-values)). So does the variable shorthand `fill-(--my-brand-color)` ([same page](https://tailwindcss.com/docs/adding-custom-styles#using-arbitrary-values)). The docs offer no switch to disable them, and the candidate parser always parses the `[...]`/`(...)` forms ([candidate.ts](https://github.com/tailwindlabs/tailwindcss/blob/main/packages/tailwindcss/src/candidate.ts)). Verified: `bg-[#fff]` compiles after `--*: initial`. **Only lint can ban these.**

### Spacing: named steps, no multiplier

Spacing utilities first look up a named key (`--padding-4`, `--spacing-4`). Failing that, they handle a bare number as `--spacing(n)`, but only `if (theme.resolve(null, ['--spacing']))`. With no `--spacing` base they return `null` ([utilities.ts `spacingUtility`](https://github.com/tailwindlabs/tailwindcss/blob/main/packages/tailwindcss/src/utilities.ts)). The default theme sets `--spacing: 0.25rem` ([theme.css](https://github.com/tailwindlabs/tailwindcss/blob/main/packages/tailwindcss/theme.css)), which is why `p-7` normally works.

- `--spacing: 4px` (the docs' custom-theme example, [theme docs](https://tailwindcss.com/docs/theme#using-a-custom-theme)) keeps **every** integer multiple: `p-7` = 28px, `p-13` = 52px. That is a grid, not our 9-step scale.
- Named keys only (`--spacing-1: 4px; --spacing-2: 8px; ...`) mean only those steps exist. Verified: with `--spacing-4` defined and no base, `p-4` compiles to `var(--spacing-4)`, while `p-3` and `p-7` produce nothing.

**Recommendation:** use named keys. Name them by the multiple of 4 (`1 2 3 4 5 6 8 10 14` → 4…56px) so `p-4` still means 16px, as Tailwind users expect. The `--spacing()` CSS function and fractions like `w-1/2` need the base, so they are gone. Use flex and grid instead (`DESIGN.md` already says to use `gap`).

## 2. `@theme` vs `@theme inline` for tokens that change in dark mode

- Theme variables become CSS variables on `:root`, and utilities reference them, e.g. `.bg-x { background-color: var(--color-x) }` ([theme docs: Using your theme variables](https://tailwindcss.com/docs/theme#using-your-theme-variables)).
- When a theme variable references another variable, use `@theme inline`. Then "the utility class will use the theme variable *value* instead of referencing the actual theme variable". Without it, `var()` resolves where the theme variable is defined (`:root`), not on the element ([theme docs: Referencing other variables](https://tailwindcss.com/docs/theme#referencing-other-variables)).

Why this matters for us: `DESIGN.md` switches surfaces by redefining `--background` on `.surface-loud` / `.surface-quiet` lower in the tree.

- With plain `@theme { --color-background: var(--background) }`, `bg-background` → `var(--color-background)`, which was already resolved at `:root` to `var(--paper)`. The `.surface-loud` override would be ignored. This is the docs' `#parent`/`#child` example.
- With `@theme inline`, `bg-background` → `background-color: var(--background)`, resolved on the element. Verified in the compiled output; `bg-primary/50` also became `color-mix(in oklab, var(--primary) 50%, transparent)`.

Theme flipping on `<html>` alone would work either way, because the override sits on the same element. Surfaces are what force `inline`.

Side effect (verified): `@theme inline` variables are not emitted in `:root`, so custom CSS should use `var(--primary)`, not `var(--color-primary)`. Only used variables are emitted anyway unless you use `@theme static` ([theme docs: Generating all CSS variables](https://tailwindcss.com/docs/theme#generating-all-css-variables)).

**Pattern:** keep light and dark values out of `@theme`, in plain `:root` rules as `DESIGN.md` sketches. Then add one `@theme inline` block that maps `--color-*`, `--shadow-*` and friends onto them. Static tokens (type scale, radius, spacing, easing) can live in a plain `@theme` block.

## 3. Dark variant: `data-theme` plus a system fallback

- The docs override `dark` with an attribute selector: `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));` ([dark mode: Using a data attribute](https://tailwindcss.com/docs/dark-mode#using-a-data-attribute)).
- That replaces the default `prefers-color-scheme` behaviour ([dark mode: Toggling dark mode manually](https://tailwindcss.com/docs/dark-mode#toggling-dark-mode-manually)).
- The docs' three-way toggle runs JS in `<head>` that applies the class from `matchMedia` when nothing is stored ([dark mode: With system theme support](https://tailwindcss.com/docs/dark-mode#with-system-theme-support)).
- `@custom-variant` also has a block form with `@slot`, and its rules can nest inside `@media` ([adding custom styles: Adding custom variants](https://tailwindcss.com/docs/adding-custom-styles#adding-custom-variants)).

Our rule is "an attribute wins, otherwise follow the OS", in CSS only and with no JS needed for the System option:

```css
@custom-variant dark {
  &:where([data-theme="dark"], [data-theme="dark"] *) { @slot; }
  @media (prefers-color-scheme: dark) {
    &:where(:root:not([data-theme="light"]) *) { @slot; }
  }
}
```

Verified: `dark:text-ink` compiles to both rules, and the second sits inside the media query. With tokens that swap, screens and most components never need `dark:`. Keep the variant for the odd case (an illustration or a one-off asset swap) so `dark:` never falls back to the media-only default.

The toggle still needs a tiny inline `<head>` script that sets `data-theme` from storage before paint, to avoid a flash. "System" means removing the attribute.

## 4. `@source` scanning in the monorepo

- Tailwind scans from the current working directory. It skips `.gitignore`d files, `node_modules`, binaries, CSS and lockfiles ([detecting classes: Which files are scanned](https://tailwindcss.com/docs/detecting-classes-in-source-files#which-files-are-scanned), [Setting your base path](https://tailwindcss.com/docs/detecting-classes-in-source-files#setting-your-base-path)).
- `@source "<path>"` registers extra paths relative to the stylesheet ([Explicitly registering sources](https://tailwindcss.com/docs/detecting-classes-in-source-files#explicitly-registering-sources)).
- `@import "tailwindcss" source(none)` turns off automatic detection so only explicit `@source` paths count ([Disabling automatic detection](https://tailwindcss.com/docs/detecting-classes-in-source-files#disabling-automatic-detection)).
- Class names must be complete strings, because files are scanned as plain text ([Dynamic class names](https://tailwindcss.com/docs/detecting-classes-in-source-files#dynamic-class-names)). Variant maps in `packages/ui` must spell out full classes.
- Theme files can be shared as a plain CSS import from a monorepo package ([theme docs: Sharing across projects](https://tailwindcss.com/docs/theme#sharing-across-projects)).

For us, `apps/web/src/styles.css`:

```css
@import "tailwindcss" source(none);
@import "@impromptu/ui/tokens.css";
@source "../../../packages/ui/src";
```

`source(none)` plus a single `@source` is a structural guard. A utility class written in `apps/web` produces no CSS, so it visibly does nothing even before lint catches it. Verified with the same layout in a scratch project.

### Reuse in other apps

All components, including layout primitives (`Page`, `Stack`, `Card`, ...), live in `packages/ui`. No app keeps its own components. To keep the package portable:

- **The package owns its styling inputs.** Export `tokens.css` (and the Phosphor/Base UI wrappers) from `packages/ui`, e.g. via `"exports": { "./tokens.css": "./src/tokens.css", ".": "./src/index.ts" }`. Theme files are plain CSS imports, so any workspace app can import them ([theme docs: Sharing across projects](https://tailwindcss.com/docs/theme#sharing-across-projects)).
- **Each app adds the same three lines** (above), changing only the relative `@source` path. A new app then gets exactly the same utilities and nothing else.
- **No app-specific knowledge in the package.** Components take content and variant props, not routes or app state, so a second app (say an admin console) can assemble them as-is.
- **Lint is app-agnostic.** The `apps/*` glob in section 5 covers any new app with no config change, and the Tailwind lint entry lives in `packages/ui`, not in a particular app.

## 5. Lint

### Options evaluated

| Tool | Tailwind v4 | (a) arbitrary values | (b) classes not in theme | Notes |
|---|---|---|---|---|
| [eslint-plugin-better-tailwindcss](https://github.com/schoero/eslint-plugin-better-tailwindcss) 4.9.1 | Yes, rules have a `tw4` column. Peer `tailwindcss ^3.3.0 \|\| ^4.1.17`; ESLint 7–10 or Oxlint ^1.35 ([README](https://github.com/schoero/eslint-plugin-better-tailwindcss#readme), npm `peerDependencies`) | `no-restricted-classes` with a regex. The docs show `\[([^\[\]]*?)\](?!:)` for arbitrary values ([rule doc](https://github.com/schoero/eslint-plugin-better-tailwindcss/blob/main/docs/rules/no-restricted-classes.md)) | `no-unknown-classes`, given `entryPoint` set to the CSS config ([rule doc](https://github.com/schoero/eslint-plugin-better-tailwindcss/blob/main/docs/rules/no-unknown-classes.md)) | Also `no-concatenated-classes` (catches the dynamic names Tailwind can't scan), and it lints `cva`, `tv` and `twMerge` calls by default ([README](https://github.com/schoero/eslint-plugin-better-tailwindcss#readme)) |
| [eslint-plugin-tailwindcss](https://github.com/francoismassart/eslint-plugin-tailwindcss) 4.4.0 | Yes, "Made for Tailwind CSS v4". Requires `cssConfigPath`. Peer `tailwindcss ^4.0.0`, ESLint 9–10 ([README](https://github.com/francoismassart/eslint-plugin-tailwindcss#readme)) | `no-arbitrary-value`, with no options ([rule doc](https://github.com/francoismassart/eslint-plugin-tailwindcss/blob/master/docs/rules/no-arbitrary-value.md)) | `no-custom-classname` ([README rules table](https://github.com/francoismassart/eslint-plugin-tailwindcss#rules)) | No general regex ban, so bare-value escapes like `border-7` can't be banned |
| ESLint core [`no-restricted-syntax`](https://eslint.org/docs/latest/rules/no-restricted-syntax) | n/a | n/a | n/a | Bans any AST selector with a custom message. Covers (c) |
| [`react/forbid-dom-props`](https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/forbid-dom-props.md) | n/a | n/a | n/a | "Only applies to DOM Nodes… not Components", so it misses `<Button className>`. Weaker than the core rule for (c) |

The key point for (b): arbitrary classes are **known** classes as far as Tailwind is concerned, so an unknown-class rule never flags `bg-[#fff]`. You need (a) and (b) together. Verified: `no-unknown-classes` flagged `p-3`, `p-7` and `bg-blue-500`, but not `bg-[#fff]`; `no-restricted-classes` caught that one.

### Recommended config (verified with ESLint 9 + better-tailwindcss 4.9.1)

```js
// eslint.config.mjs (repo root)
import betterTailwind from "eslint-plugin-better-tailwindcss";

export default [
  {
    files: ["packages/ui/src/**/*.{ts,tsx}"],
    plugins: { "better-tailwindcss": betterTailwind },
    settings: { "better-tailwindcss": { entryPoint: "packages/ui/src/lint-entry.css" } },
    rules: {
      "better-tailwindcss/no-unknown-classes": "error",
      "better-tailwindcss/no-concatenated-classes": "error",
      "better-tailwindcss/no-restricted-classes": ["error", { restrict: [
        // (a) arbitrary values, arbitrary variants and the (--var) shorthand
        { pattern: "[\\[\\]()]", message: "No arbitrary values. Add a token to tokens.css." },
        // bare-value escapes the theme wipe can't stop; allow only the 2px outline
        { pattern: "^([\\w-]*:)?border(-[xytrbl])?-(?!2$)\\d+$", message: "Borders are 2px (DESIGN.md)." },
      ]}],
    },
  },
  {
    // (c) screens only assemble components, in every app
    files: ["apps/*/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", {
        selector: "JSXAttribute[name.name=/^(className|class|style)$/]",
        message: "Screens assemble @impromptu/ui components; no className or style in apps/web.",
      }],
    },
  },
];
```

Notes:

- The `[\[\]()]` ban also blocks value-matching variants like `data-[size=large]:`. That's fine with Base UI, because bare attribute variants such as `data-active:` work without brackets ([states docs: Data attributes](https://tailwindcss.com/docs/hover-focus-and-other-states#data-attributes)). Recurring ones can be registered with `@custom-variant` ([same section](https://tailwindcss.com/docs/hover-focus-and-other-states#data-attributes)).
- Banning `className` on every JSX element in `apps/web` also bans passing it to `@impromptu/ui` components. That matches "screens never style anything". Layout comes from layout components (`Stack`, `Page`, ...) in `packages/ui`.
- `entryPoint` must be a stylesheet that imports `tailwindcss` plus our tokens, so the plugin sees the wiped theme ([no-unknown-classes options](https://github.com/schoero/eslint-plugin-better-tailwindcss/blob/main/docs/rules/no-unknown-classes.md#entrypoint)). Use `packages/ui/src/lint-entry.css` (`@import "tailwindcss" source(none); @import "./tokens.css";`) so linting the package depends on no particular app.
- `apps/api` has no JSX, so the `apps/*` rule never fires there.
- The repo has no linter today (root `package.json` has only `turbo`, `typescript` and `@types/bun`). This adds ESLint 9, `eslint-plugin-better-tailwindcss` and a TS parser such as `@typescript-eslint/parser`.

## 6. Worked minimal `tokens.css`

`packages/ui/src/tokens.css`, trimmed to show each token kind once. The full value lists come from `DESIGN.md`. This exact file compiled cleanly with Tailwind 4.3.3. `p-14`, `md:p-4`, `max-w-content`, `animate-live-pulse` (with its `@keyframes` emitted), `text-xs`, `shadow-pop` and `rounded-pill` were generated, and `p-7` was not.

```css
/* 1. Static tokens: wipe every default, then define only ours */
@theme {
  --*: initial;

  /* type */
  --font-sans: "Familjen Grotesk", system-ui, sans-serif;
  --default-font-family: var(--font-sans);          /* preflight reads this */
  --font-weight-regular: 400;
  --font-weight-bold: 700;
  --text-xs: 13px;  --text-xs--line-height: 1.4;  --text-xs--font-weight: 700;  --text-xs--letter-spacing: 0.08em;
  --text-base: 17px; --text-base--line-height: 1.6;
  --text-hero: 54px; --text-hero--line-height: 1;  --text-hero--font-weight: 700;

  /* spacing: named steps only, no --spacing base, so p-7 does not exist */
  --spacing-1: 4px;  --spacing-2: 8px;  --spacing-3: 12px; --spacing-4: 16px; --spacing-5: 20px;
  --spacing-6: 24px; --spacing-8: 32px; --spacing-10: 40px; --spacing-14: 56px;

  /* radius */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-pill: 999px;

  /* layout */
  --breakpoint-md: 48rem;
  --container-content: 640px;                        /* max-w-content */

  /* motion */
  --ease-press: cubic-bezier(0.2, 0, 0, 1);
  --animate-live-pulse: live-pulse 1.6s ease-out infinite;
  @keyframes live-pulse { from { box-shadow: 0 0 0 0 var(--live); } to { box-shadow: 0 0 0 12px transparent; } }
}

/* 2. Semantic values that change with theme or surface: plain CSS, not @theme */
:root {
  --brand: #C6F432; --paper: #FFFFFF; --ink: #111111; --primary: #6A3DF0; --live: #FF2E6E;
  --background: var(--paper);
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { --brand: #121808; --paper: #1B230C; --ink: #F1FFD1; --primary: #A98BFF; --live: #FF6B98; color-scheme: dark; }
}
:root[data-theme="dark"] { --brand: #121808; --paper: #1B230C; --ink: #F1FFD1; --primary: #A98BFF; --live: #FF6B98; color-scheme: dark; }

.surface-loud  { --background: var(--brand); }
.surface-quiet { --background: var(--paper); }

/* 3. Expose semantics to Tailwind; inline so var() resolves on the element */
@theme inline {
  --color-background: var(--background);
  --color-paper: var(--paper);
  --color-ink: var(--ink);
  --color-primary: var(--primary);
  --color-live: var(--live);
  --shadow-pop: 5px 5px 0 var(--ink);
  --shadow-press: 3px 3px 0 var(--ink);
}

/* 4. dark: = data-theme, else the OS setting */
@custom-variant dark {
  &:where([data-theme="dark"], [data-theme="dark"] *) { @slot; }
  @media (prefers-color-scheme: dark) {
    &:where(:root:not([data-theme="light"]) *) { @slot; }
  }
}
```

Sources for the token shapes:

- `--text-*--line-height`, `--letter-spacing` and `--font-weight` sub-properties: [font-size docs](https://tailwindcss.com/docs/font-size#customizing-your-theme)
- `@keyframes` inside `@theme` next to `--animate-*`: [theme docs: Defining animation keyframes](https://tailwindcss.com/docs/theme#defining-animation-keyframes)
- Namespace names: [namespace table](https://tailwindcss.com/docs/theme#theme-variable-namespaces)

Verified output: `shadow-press` → `--tw-shadow: 3px 3px 0 var(--tw-shadow-color, var(--ink))`, `text-hero` sets size, line-height and weight, and `ease-press` sets `transition-timing-function`.

## Open points for #54

- **Primitive layer.** #51 settles on two layers (primitives plus semantic). Primitives such as `--lime-400: #C6F432` can sit in plain `:root` and be referenced by the semantic variables. Keep them **out** of `@theme`, so no `bg-lime-400` utility exists and screens can't skip the semantic layer.
- **Border width.** The lint regex above pins `border-*` to 2. Alternatively add `--border-width-*`-style tokens if a second width ever appears. (`border` reads the `--border-width` keys first: [utilities.ts](https://github.com/tailwindlabs/tailwindcss/blob/main/packages/tailwindcss/src/utilities.ts).)
- Bare-value escapes for `z-*`, `opacity-*` and `grid-cols-*` are not banned in the config above. Add `no-restricted-classes` patterns for them if they turn up.
