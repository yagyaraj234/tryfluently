# Base UI with Tailwind v4 and TanStack Start

Research for [#52](https://github.com/yagyaraj234/impromptu-monorepo/issues/52). Checked 2026-10-15 against primary sources only. Points marked **(inference)** are our reading of the sources, not something the sources say outright.

## Recommendation

Use `@base-ui/react@^1.9.0` in `packages/ui`. Style every part with Tailwind classes through `className`, using Tailwind's `data-*` variants for state (`data-open:`, `data-checked:`, `data-starting-style:`) and the `(--var)` shorthand for Base UI's CSS variables (`origin-(--transform-origin)`, `max-h-(--available-height)`). Use a `className` function only when a class depends on state that has no data attribute. Set up three things globally: an `isolation: isolate` wrapper inside `<body>`, `position: relative` on `<body>`, and one `<Toast.Provider>` at the app root. Keep design tokens and the dark-mode switch on `<html>`, not on the isolation wrapper, because portals render outside it. TanStack Start needs no Base UI-specific setup. Avoid the known SSR mismatches (Meter/Progress locale, Avatar fallback) and declare React as a peer dependency of `packages/ui` so the server bundle has only one copy of React.

## 1. Package and version

- The package is **`@base-ui/react`**. It used to be published as `@base-ui-components/react`, which is now deprecated with the message "Package was renamed to @base-ui/react" (npm registry: `npm view @base-ui-components/react deprecated`; [base-ui.com/react/handbook/styling.md](https://base-ui.com/react/handbook/styling.md)).
- The current stable release is **v1.9.0**, released 2026-10-09. It is npm `latest` ([npm](https://www.npmjs.com/package/@base-ui/react); [v1.9.0 release notes](https://base-ui.com/react/overview/releases/v1-9-0)). v1.0.0 shipped on 2025-12-11 ([v1.0.0 notes](https://base-ui.com/react/overview/releases/v1-0-0)), and a minor release has followed about every month since (npm `time` field).
- Peer dependencies are `react` and `react-dom` `^17 || ^18 || ^19`. `date-fns`, `@date-fns/tz` and `@types/react` are optional peers. Runtime dependencies are `@floating-ui/react-dom`, `@floating-ui/utils`, `@base-ui/utils` and `use-sync-external-store` (`npm view @base-ui/react peerDependencies peerDependenciesMeta dependencies`).
- Install with `bun add @base-ui/react`. Everything ships in one package and it is tree-shakable ([quick start](https://base-ui.com/react/overview/quick-start)).
- Each component has its own import path, for example `import { Dialog } from '@base-ui/react/dialog'` (package `exports` map; [styling handbook](https://base-ui.com/react/handbook/styling)).
- The team is "the creators of Radix, Material UI, and Floating UI" ([about](https://base-ui.com/react/overview/about)).

## 2. Component list (v1.9.0)

From [base-ui.com/llms.txt](https://base-ui.com/llms.txt), cross-checked against the package `exports` map:

| Group | Components |
|---|---|
| Overlays | Dialog, Alert Dialog, Drawer (swipe to dismiss), Popover, Tooltip, Preview Card, Toast |
| Menus | Menu, Context Menu, Menubar, Navigation Menu |
| Inputs and forms | Form, Field, Fieldset, Input, Button, Checkbox, Checkbox Group, Radio Group (plus `radio`), Switch, Slider, Number Field, OTP Field, Select, Combobox, Autocomplete, Toggle, Toggle Group |
| Disclosure and layout | Accordion, Collapsible, Tabs, Toolbar, Separator, Scroll Area |
| Display | Avatar, Meter, Progress |
| Utilities | `CSPProvider`, `DirectionProvider`, `mergeProps`, `useRender` |

The docs list 37 components. There is no documented date picker or calendar. The optional `date-fns` peer and `internals/temporal-*` exports point to date components in progress, but nothing public uses them yet **(inference)**.

## 3. How parts expose state

Every part that renders an element accepts three style hooks ([styling handbook](https://base-ui.com/react/handbook/styling)):

1. **Data attributes** for state, such as `[data-checked]`, `[data-open]`, `[data-disabled]`, `[data-highlighted]`, `[data-side="top"]`, `[data-starting-style]` and `[data-ending-style]`. Each component's API reference lists them all.
2. **CSS variables** for dynamic numbers, for example `--available-height`, `--anchor-width` and `--transform-origin` on Popover's Positioner, and `--nested-dialogs` on Dialog.Popup ([popover](https://base-ui.com/react/components/popover), [dialog](https://base-ui.com/react/components/dialog)).
3. **`className` and `style`**, each taking either a value or a function of the part's state: `className={(state) => state.checked ? 'a' : 'b'}` ([styling handbook](https://base-ui.com/react/handbook/styling)). The prop type is `string | ((state) => string | undefined)` (Dialog API reference).

Since v1.9.0, the attribute and variable names are also exported as TypeScript types and enums, for example `MenuItemDataAttributes.highlighted` and `PopoverPositionerCssVariables` ([v1.9.0 notes, #5243](https://github.com/mui/base-ui/pull/5243); [styling handbook, CSS-in-JS](https://base-ui.com/react/handbook/styling)).

### Animation states

Popups get `data-starting-style` while they animate in and `data-ending-style` while they animate out. The docs pair these with CSS transitions, for example `transition-opacity data-starting-style:opacity-0 data-ending-style:opacity-0` ([dialog demo](https://base-ui.com/react/components/dialog); [animation handbook](https://base-ui.com/react/handbook/animation)).

## 4. Styling with Tailwind v4 and our tokens

The Base UI docs say their Tailwind examples are written for v4 ([llms.txt](https://base-ui.com/llms.txt)). Their recommended pattern is "Apply Tailwind CSS classes to each part via the `className` prop" ([styling handbook](https://base-ui.com/react/handbook/styling)).

**Data attribute variants.** Tailwind v4 matches a bare attribute with `data-active:` and a value with `data-[size=large]:` ([tailwindcss.com, data attributes](https://tailwindcss.com/docs/hover-focus-and-other-states#data-attributes)). Base UI's own demos use the bare form: `data-highlighted:bg-…`, `data-ending-style:opacity-0`, `hover:not-data-disabled:bg-…` ([styling handbook](https://base-ui.com/react/handbook/styling); [dialog](https://base-ui.com/react/components/dialog)). If a value selector repeats often, `@custom-variant` can give it a short name, for example `@custom-variant side-top (&[data-side="top"]);` ([tailwindcss.com, custom variants](https://tailwindcss.com/docs/hover-focus-and-other-states#custom-variants)).

**CSS variables.** `fill-(--my-brand-color)` is shorthand for `fill-[var(--my-brand-color)]` ([tailwindcss.com, adding custom styles](https://tailwindcss.com/docs/adding-custom-styles)). Base UI demos use the same form with their variables: `origin-(--transform-origin)` ([styling handbook](https://base-ui.com/react/handbook/styling)).

**Token-only theme.** `@theme { --*: initial; … }` removes every default theme variable, so "you'll only be able to use utility classes matching your custom theme variables". Theme variables compile to CSS variables on `:root` ([tailwindcss.com/docs/theme, using a custom theme](https://tailwindcss.com/docs/theme#using-a-custom-theme)). Consequences for us **(inference)**:
- Base UI demo markup uses default-theme classes such as `bg-neutral-950`, `text-sm` and `rounded-md`. Once the theme is wiped, those classes generate nothing, so copied demo code must be rewritten with our token names.
- `--*: initial` also removes `--spacing`. Utilities like `p-4` and `w-96` work only if we define `--spacing`, as the Tailwind example does.
- Data variants and `(--var)` arbitrary values don't depend on the theme, so they keep working.

**Choosing between data attributes and `className` functions (inference).** Use data-attribute variants by default. They are plain strings, work in SSR markup, and keep class lists static. Use a `className` function only for state with no matching attribute, or to switch between whole token sets.

**The `render` prop.** `render` swaps the rendered element or composes it with our own component: `<Menu.Trigger render={<MyButton />} />`. The custom component must forward `ref` and spread the props it receives onto its DOM node. Render props can nest, for example Tooltip.Trigger → Dialog.Trigger → Menu.Trigger → MyButton. A function form `render={(props, state) => …}` is also available ([composition handbook](https://base-ui.com/react/handbook/composition)).

**Building `packages/ui` components.** `useRender` gives our own components the same `render` prop. `mergeProps` merges props: `className` values are concatenated, `style` objects are merged, event handlers are chained, and for every other key the rightmost value wins ([useRender](https://base-ui.com/react/utils/use-render); [mergeProps](https://base-ui.com/react/utils/merge-props)).

## 5. Portals, z-index and theming: Dialog, Popover, Toast

### Shared

- Popups render through `<X.Portal>`, which by default appends a `<div>` to `<body>`. Portal props are `container` (an element, ShadowRoot or ref), `keepMounted`, `className`, `style` and `render` ([dialog API: Portal](https://base-ui.com/react/components/dialog)).
- **Global isolation root.** Base UI's quick start says to wrap the app in a root element with `isolation: isolate`. "This style creates a separate stacking context for your application's `.root` element. This way, popups always appear above the page contents, and any `z-index` property in your styles won't interfere with them" ([quick start, Portals](https://base-ui.com/react/overview/quick-start)). With this in place, we don't need a z-index scale for overlays.
- **iOS 26+ Safari.** Backdrops should use `position: absolute`, and `body { position: relative; }` must be set globally ([quick start, iOS 26+ Safari](https://base-ui.com/react/overview/quick-start)). The Dialog demo applies this with `supports-[-webkit-touch-callout:none]:absolute` on the backdrop ([dialog](https://base-ui.com/react/components/dialog)).
- **Theming in portals (inference).** Portals render as siblings of the isolation root, not inside it. Tokens and the dark-mode class or `data-theme` must therefore sit on `<html>` or `:root`. Tailwind already emits theme variables on `:root` ([tailwindcss.com/docs/theme](https://tailwindcss.com/docs/theme#using-your-theme-variables)). Anything we put only on the wrapper div won't reach popups.

### Dialog

Parts: `Root`, `Trigger`, `Portal`, `Backdrop`, `Popup`, `Title`, `Description`, `Close` and `Viewport`. `modal` defaults to `true`, which traps focus, locks page scroll and blocks outside pointer events. `'trap-focus'` traps focus only. With `modal` on, render `<Dialog.Close>` inside the popup so touch screen readers can leave. Backdrop exposes `data-open`, `data-closed`, `data-starting-style` and `data-ending-style`. Popup adds `data-nested` and `data-nested-dialog-open`, plus the `--nested-dialogs` variable for stacked-dialog effects. `initialFocus` and `finalFocus` control focus. Nested dialogs render a backdrop only if it has `forceRender` ([dialog API reference](https://base-ui.com/react/components/dialog)). Alert Dialog and Drawer follow the same model ([llms.txt](https://base-ui.com/llms.txt)).

### Popover

Parts: `Root`, `Trigger`, `Portal`, `Backdrop`, `Positioner`, `Popup`, `Arrow`, `Title`, `Description`, `Close` and `Viewport`. `modal` defaults to `false`. Positioner props include `side` (default `bottom`), `align` (default `center`), `sideOffset`, `collisionAvoidance` and `positionMethod` (`absolute` by default, or `fixed`). Positioner and Popup expose `data-side`, `data-align`, `data-open`, `data-closed` and `data-anchor-hidden`. Positioner CSS variables: `--anchor-width`, `--anchor-height`, `--available-width`, `--available-height`, `--positioner-width`, `--positioner-height` and `--transform-origin`. The Trigger has `data-popup-open` and `data-pressed` ([popover API reference](https://base-ui.com/react/components/popover)). Menu, Select, Tooltip and the other anchored popups use the same Positioner and Popup model ([styling handbook, Menu example](https://base-ui.com/react/handbook/styling)).

### Toast

Anatomy: `Toast.Provider` → `Toast.Portal` → `Toast.Viewport` → `Toast.Root` → `Toast.Content` → `Title`, `Description`, `Action` and `Close`. `Toast.Positioner` and `Toast.Arrow` add anchored toasts.
- Wrap the whole app in one `<Toast.Provider>` so every toast renders in the same viewport. Provider props are `limit` (default 3) and `timeout` (default 5000 ms, `0` means no auto-dismiss).
- `Toast.createToastManager()`, passed as `toastManager`, lets code outside React add toasts. `Toast.useToastManager()` is the in-tree hook. Both expose `add`, `close`, `update` and `promise`.
- Stacking is done with CSS, not portal order. The docs use `z-index: calc(1000 - var(--toast-index))`. Root also exposes `--toast-height`, `--toast-offset-y` and `--toast-swipe-movement-x/y`, and the Viewport exposes `--toast-frontmost-height`.
- State attributes: `data-expanded`, `data-limited`, `data-behind` (on Content), `data-swiping`, `data-swipe-direction` and `data-type`. `data-type` comes from the type passed to `add()`, so it can select a token set, for example `data-[type=error]:bg-…`.
- F6 jumps to the toast landmark region.

All of the above is from the [toast docs](https://base-ui.com/react/components/toast) (Anatomy, General usage, Global manager, Stacking and animations, API reference).

## 6. SSR and hydration in TanStack Start

- Every module in `@base-ui/react` carries a `'use client'` directive (869 files in the v1.9.0 tarball, `npm pack @base-ui/react@1.9.0`). TanStack Start does not use React Server Components here, so the directive does nothing for us. Components server-render like any other client component **(inference)**.
- Base UI fixes SSR problems release by release, for example "Fix ARIA attributes during SSR (#4179)", "Fix autofocus in SSR environments (#3871)", "Add `suppressHydrationWarning` to hidden inputs (#4482)" and "Exclude the prehydration script from client bundles (#5003)" (`CHANGELOG.md` in the package). **Stay current on minor versions.**
- Known open SSR issues worth avoiding:
  - [mui/base-ui#4616](https://github.com/mui/base-ui/issues/4616): Meter and Progress `aria-valuetext` mismatches because of runtime-locale `Intl.NumberFormat`. Pass an explicit `locale` or a format function **(inference)**.
  - [#4468](https://github.com/mui/base-ui/issues/4468): Avatar fallback flashes for cached images during hydration.
  - [#5597](https://github.com/mui/base-ui/issues/5597): Radio SSR markup is missing `aria-labelledby` and has `tabindex="-1"`.
  - [#5821](https://github.com/mui/base-ui/issues/5821): `hiddenUntilFound` panels render plain `hidden` in server HTML.
  - [#3570](https://github.com/mui/base-ui/issues/3570): Navigation Menu hover events before hydration are not replayed.
- Some components (Tabs, Slider, Switch and others) can render a small inline pre-hydration `<script>`, and ScrollArea and Select (`alignItemWithTrigger`) inject an inline `<style>`. Under a strict CSP, wrap the app in `<CSPProvider nonce={…}>`, or use `disableStyleElements` and add the `.base-ui-disable-scrollbar` CSS ourselves ([CSP provider](https://base-ui.com/react/utils/csp-provider); changelog entries #4530 and #5003).
- **Monorepo pitfall.** "Cannot read properties of null (reading 'useSyncExternalStore')" in a production SSR build was diagnosed as multiple copies of React in the server bundle ([mui/base-ui#5291](https://github.com/mui/base-ui/issues/5291)). For `packages/ui`, list `react`, `react-dom` and `@base-ui/react` so that only `apps/web` resolves React: React as a peer dependency, not a regular dependency **(inference)**.
- General TanStack Start hydration rules apply. Mismatches usually come from `Intl` locale or time zone, `Date.now()`, random IDs, responsive-only logic and user preferences. The fixes, in order of preference: make server and client output match, wrap unstable UI in `<ClientOnly>` from `@tanstack/react-router`, or set a route's `ssr: false` or `'data-only'`. Use `suppressHydrationWarning` sparingly ([TanStack Start: hydration errors](https://tanstack.com/start/latest/docs/framework/react/guide/hydration-errors)). Portaled popups aren't in the server HTML while closed (`keepMounted` defaults to `false`), so closed overlays can't cause mismatches **(inference from the Portal API)**.
- Tailwind v4 in Start: install `tailwindcss` and `@tailwindcss/vite`, add `tailwindcss()` to the Vite plugins, write `@import 'tailwindcss' source('../');` in `src/styles/app.css`, then add `import appCss from '../styles/app.css?url'` with `head: () => ({ links: [{ rel: 'stylesheet', href: appCss }] })` in `__root.tsx` ([TanStack Start: Tailwind integration](https://tanstack.com/start/latest/docs/framework/react/guide/tailwind-integration)). Because `packages/ui` lives outside `apps/web`, the `source()` path or an `@source` directive must cover it, or its classes won't be generated **(inference)**.

## 7. Global setup checklist

```tsx
// apps/web/src/routes/__root.tsx (shell)
<html lang="en" className={theme /* tokens and dark mode live here, not on .root */}>
  <body /* body { position: relative } in app.css */>
    <div className="isolate">{/* Tailwind `isolate` = isolation: isolate */}
      <Toast.Provider>
        {children}
        <Toast.Portal><Toast.Viewport className="…" />…</Toast.Portal>
      </Toast.Provider>
    </div>
  </body>
</html>
```

Optional: `CSPProvider` once we ship a CSP, and `DirectionProvider` only if we support RTL ([direction provider](https://base-ui.com/react/utils/direction-provider)).

Sources: [base-ui.com/llms.txt](https://base-ui.com/llms.txt) · [quick start](https://base-ui.com/react/overview/quick-start) · [styling](https://base-ui.com/react/handbook/styling) · [composition](https://base-ui.com/react/handbook/composition) · [dialog](https://base-ui.com/react/components/dialog) · [popover](https://base-ui.com/react/components/popover) · [toast](https://base-ui.com/react/components/toast) · [CSP provider](https://base-ui.com/react/utils/csp-provider) · [npm @base-ui/react](https://www.npmjs.com/package/@base-ui/react) · [github.com/mui/base-ui](https://github.com/mui/base-ui) · [tailwindcss.com/docs/theme](https://tailwindcss.com/docs/theme) · [tailwind state variants](https://tailwindcss.com/docs/hover-focus-and-other-states) · [TanStack Start Tailwind](https://tanstack.com/start/latest/docs/framework/react/guide/tailwind-integration) · [TanStack Start hydration](https://tanstack.com/start/latest/docs/framework/react/guide/hydration-errors)
