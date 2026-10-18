# Impromptu Design System: Neo Pop · Lime Rush

The visual language for the Impromptu web app. Terms like Learner, Step, Roleplay and Debrief follow `GLOSSARY.md`. You can compare all colourways in the [direction explorer](https://claude.ai/artifact/VX2uvoorzcdc37dQYMGb9p) (option 3).

## Principles

1. **Loud outside, calm while practising.** Brand moments (home, Roadmap, Streak, XP, celebrations, the Assessment Report reveal) use the full lime **loud** surface. Practice (Lesson player, live Roleplay, Debrief) uses the white **quiet** surface: same type and outlines, no lime behind the content, so the Learner can concentrate while speaking.
2. **Built for the Gen Z audience, but credible.** Thick ink outlines, offset shadows and bright colour make the app feel like something people choose to use, not homework. It stays clean enough to trust with interview prep.
3. **Easy to read in a second language.** The base text size is 17px, lines are generous, and running text is limited to about 65 characters per line. Every verdict uses a word as well as a colour.
4. **Every colour has one meaning.** Violet is for actions, hot pink means a live microphone, and the three verdict colours mean correct, almost and incorrect. Nothing borrows another colour's meaning.

## Colour

Every value below is a CSS variable in `@impromptu/ui/tokens.css`. Tailwind exposes each colour only in the roles listed in the **Utility** column: `bg-*` for backgrounds, `text-*` for text and `border-*` for borders. A colour has no utility outside its roles, so `text-paper` or `bg-ink` don't exist.

### Brand and surfaces

| Token | Light | Dark | Utility | Use |
|---|---|---|---|---|
| `--brand` | `#C6F432` lime | `#121808` | (through `--surface`) | Loud surface background |
| `--paper` | `#FFFFFF` | `#1B230C` | `bg-paper` | Quiet surface, cards, panels |
| `--surface` | `--brand` or `--paper` | | `bg-surface` | The current surface (see [Surfaces](#surfaces)) |
| `--ink` | `#111111` | `#F1FFD1` | `text-ink` | Text, outlines, offset shadows |
| `--muted` | `#4A5130` | `#B3C48A` | `text-muted` | Secondary text, captions |
| `--line` | `#111111` | `#F1FFD1` | `border-line` | Borders (Neo Pop outlines are always ink) |
| `--subtle` | `#F2F5EA` | `#232D10` | `bg-subtle` | Input fills, empty tracks, skeletons |
| `--scrim` | ink at 50% | same | `bg-scrim` | Dims the page behind a Dialog or Sheet |

### Action

| Token | Light | Dark | Utility | Use |
|---|---|---|---|---|
| `--primary` | `#6A3DF0` violet | `#A98BFF` | `bg-primary`, `text-primary`, `border-primary` | Primary buttons, links, focus rings, active states |
| `--on-primary` | `#FFFFFF` | `#160A33` | `text-on-primary` | Text on primary |
| `--primary-soft` | `#E7E0FD` | `#2A2440` | `bg-primary-soft` | Selected backgrounds, soft chip fill |

### Live voice

Use these **only** while the microphone is recording or a Realtime call is connected.

| Token | Light | Dark | Utility | Use |
|---|---|---|---|---|
| `--live` | `#FF2E6E` | `#FF6B98` | `bg-live`, `border-live` | Pulsing dot, live border, recording ring |
| `--live-text` | `#D1105A` | `#FF6B98` | `text-live` | "LIVE" label and timer text (meets 4.5:1 on paper) |

### Verdicts

Every verdict is shown as a coloured word (Correct / Almost / Incorrect), never colour alone. Each tint is an opaque mix, `color-mix(in oklab, var(--correct) 15%, var(--paper))`, so it follows dark mode and never shows what's behind it.

| Token | Light | Dark | Utility | Tint token | Tint utility |
|---|---|---|---|---|---|
| `--correct` | `#08753D` | `#4FD18A` | `text-correct` | `--correct-tint` | `bg-correct-tint` |
| `--almost` | `#805800` | `#FFD24D` | `text-almost` | `--almost-tint` | `bg-almost-tint` |
| `--incorrect` | `#BE1E55` | `#FF7FA3` | `text-incorrect` | `--incorrect-tint` | `bg-incorrect-tint` |

Incorrect is a soft rose, not an alarm red, so that a mistake doesn't feel like a punishment.

### Skills (charts only)

| Token | Skill | Light | Dark | Utility |
|---|---|---|---|---|
| `--skill-fluency` | Fluency | `#6A3DF0` | `#A98BFF` | `bg-skill-fluency` |
| `--skill-grammar` | Grammar | `#1F6FEB` | `#6EA8FF` | `bg-skill-grammar` |
| `--skill-vocabulary` | Vocabulary | `#F0711A` | `#FF9A4D` | `bg-skill-vocabulary` |

### CEFR scale

The scale uses a single violet hue, getting darker from A1 to C2. Use ink text on A1–B1 and `--on-primary` text on B2–C2. The tokens are `--cefr-a1` to `--cefr-c2`, and the utilities `bg-cefr-a1` to `bg-cefr-c2`.

| | A1 | A2 | B1 | B2 | C1 | C2 |
|---|---|---|---|---|---|---|
| Light | `#E7E0FD` | `#CCBDFA` | `#AD94F6` | `#7955D7` | `#6A3DF0` | `#4B2EA2` |
| Dark | `#323433` | `#4B465F` | `#695C92` | `#8D76CE` | `#A98BFF` | `#C2B4EF` |

## Typography

- **Family:** Familjen Grotesk (Google Fonts, weights 400 and 700), falling back to `system-ui, sans-serif` (`--font-sans`, utility `font-sans`). Weights are `font-regular` and `font-bold`. It's used for display and body text alike, so the outlines and type read as one voice.
- **Numbers:** `font-variant-numeric: tabular-nums` (`Text tabular`) on XP, Streak, timers, scores and anything else that lines up.
- **Scale:** sizes are named by role and set in rem, so text grows with the browser's font size. Each size carries its own line height, weight and letter spacing. The utility is `text-<role>` and the `size` prop on `Text` and `Heading` takes the role name.

| Token | Size | Line height | Weight | Use |
|---|---|---|---|---|
| `--text-label` | 0.8125rem (13px) | 1.4 | 700, uppercase, +0.08em | Labels like "LIVE" and "STEP 4 OF ~7" |
| `--text-caption` | 0.9375rem (15px) | 1.5 | 400 | Captions, explanations |
| `--text-body` | 1.0625rem (17px) | 1.6 | 400 | Body and answers |
| `--text-title` | 1.3125rem (21px) | 1.35 | 700 | Step questions, card titles |
| `--text-heading` | 1.6875rem (27px) | 1.2 | 700 | Section headings |
| `--text-page` | 2.125rem (34px) | 1.1 | 700 | Page titles |
| `--text-hero` | 3.375rem (54px) | 1.0 | 700 | Streak and XP numbers, CEFR reveal |

Headings use `text-wrap: balance`. Running text sits in `Container width="prose"` (65ch).

## Shape, space and depth

| Token | Value | Utility | Use |
|---|---|---|---|
| `--border-width` | `2px` | `border-2` | Every card, button, input and chip; always `border-line` |
| `--radius-md` | `12px` | `rounded-md` | Cards, buttons, inputs |
| `--radius-sm` | `8px` | `rounded-sm` | CEFR cells, small tags |
| `--radius-pill` | `999px` | `rounded-pill` | Chips, verdict tags |
| `--shadow-pop` | `5px 5px 0 var(--ink)` | `shadow-pop` | Cards on loud surfaces (through `--card-shadow`) |
| `--shadow-press` | `3px 3px 0 var(--ink)` | `shadow-press` | Buttons, everywhere |
| `--card-shadow` | `--shadow-pop` or none | `shadow-card` | Cards, set by the surface |
| `--size-target` | `2.75rem` (44px) | `min-h-target`, `size-target` | The smallest touch target |
| `--space-1` … `--space-14` | 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 px (steps 1, 2, 3, 4, 5, 6, 8, 10, 14) | `p-4`, `gap-6` and so on | Use `gap` on flex and grid, not margins between siblings |
| `--layer-sticky` / `--layer-overlay` / `--layer-toast` | 10 / 20 / 30 | `z-sticky`, `z-overlay`, `z-toast` | The only stacking levels |
| `--width-content` | `40rem` (640px) | `max-w-content` | The Lesson column, dialogs, toasts |
| `--width-prose` | `65ch` | `max-w-prose` | Running text |
| `--breakpoint-desktop` | `64rem` | `desktop:` | The only breakpoint |

Only these steps exist: there is no spacing base, so `p-7` or `gap-[13px]` produce nothing.

### Surfaces

A `Screen` sets the surface once with `surface="loud"` or `surface="quiet"`, which adds the `.surface-loud` or `.surface-quiet` class. Cards and backgrounds follow it through two variables, with no per-component props:

| Surface | `--surface` | `--card-shadow` | Screens |
|---|---|---|---|
| Loud | `--brand` | `--shadow-pop` | Home, Roadmap, Streak, Report reveal |
| Quiet | `--paper` | none | Lesson player, Roleplay, Debrief |

`:root` is quiet, so dialogs, sheets, menus and toasts (which render outside the screen) always look quiet. Surfaces don't nest. On **quiet** surfaces, cards keep the 2px outline but drop the offset shadow. Buttons keep `--shadow-press` everywhere, because the offset shadow is what makes them look pressable.

## Motion

| Token | Value | Utility | Use |
|---|---|---|---|
| `--duration-press` / `--ease-press` | 80ms, `ease-out` | `duration-press`, `ease-press` | Button press |
| `--duration-ui` / `--ease-ui` | 160ms, `cubic-bezier(0.2, 0, 0, 1)` | `duration-ui`, `ease-ui` | Overlays, progress, small state changes |
| `--duration-pulse` | 1.6s | `animate-pulse` | Live dot, skeletons |
| `--duration-spin` | 0.8s | `animate-spin` | One turn of a `Spinner` |

- **Button press:** on `:active`, translate by `--press-offset` (3px, 3px) and set the shadow to 0, over `--duration-press`. It feels like a physical key.
- **Live dot:** a pulse ring every `--duration-pulse` while live.
- **Celebrations:** a single burst for a finished Lesson, a Streak milestone or a new CEFR Level, under 1.2s. These happen only on loud surfaces, never during practice. The shared `--duration-celebrate` token is 800ms; `animate-celebrate` runs once on the Lesson icon, the current CEFR cell and weekly Streak milestones.
- **Reduced motion:** `prefers-reduced-motion: reduce` turns off the pulse, the celebrations and the press translate. Components run motion only under `motion-safe:`.

## Components

Every component lives in `@impromptu/ui` and is imported from the package root. No component accepts `className` or `style`. Variant props (`variant`, `tone`, `size`) take role names, never colour names. Components that navigate take a `render` prop (for example a router link), which receives the component's props, classes and ref. Components that take an icon take a Phosphor icon component and render it themselves.

### Base components (locked)

These 26 components and their props are settled. Wrap the app once in `UIProvider`, which sets Phosphor's defaults (Bold, 1em, current colour), renders toasts and isolates the stacking context so overlays layer correctly.

| Group | Component | Built on | Key props |
|---|---|---|---|
| Layout | `Screen` | — | `surface: "loud" \| "quiet"`; renders `<main>` with side gutters |
| | `Stack` | — | `gap` (spacing step), `align` |
| | `Cluster` | — | `gap`, `justify`, `align`; wraps |
| | `Container` | — | `width: "content" \| "prose"`; centred |
| | `Split` | — | `main` and `side` slots; stacked below `desktop`, two thirds and one third at it |
| Type | `Text` | — | `size` (label…hero), `tone: "ink" \| "muted"`, `as`, `tabular` |
| | `Heading` | — | `level: 1 \| 2 \| 3` → page / heading / title; `size` overrides |
| Actions | `Button` | Base UI Button | `variant: "primary" \| "secondary"`, `fullWidth`, `icon`, `render`; one size, 44px minimum |
| | `IconButton` | Base UI Button | `icon`, required `label`, `render` |
| | `TextLink` | — | `render` |
| Forms | `TextField` | Field, Input | required `label`, `description`, `error` |
| | `TextArea` | Field | as `TextField` |
| | `ChoiceChips` | RadioGroup / CheckboxGroup | `label`, `options`, `multiple`, `value`, `onValueChange` |
| | `Select` | Select | `label`, `options`, `value`, `onValueChange` |
| | `Switch` | Switch | `label`, `checked`, `onCheckedChange` |
| Overlays | `Dialog` | Dialog | `open`, `onOpenChange`, `title`, `description`; modal |
| | `Sheet` | Dialog | as `Dialog`; bottom sheet below `desktop` |
| | `Menu` | Menu | `trigger`, and `items` each with `onSelect` or `render` |
| Feedback | Toasts (`toastManager`) | Toast | `toastManager.add({ title, description, actionProps })`, callable from anywhere, even outside React; rendered by `UIProvider` |
| | `ProgressBar` | Progress | `value`, `max`, `label` |
| | `Meter` | Meter | `value`, `max`, `label` |
| | `Spinner` | — | `label` |
| | `Skeleton` | — | `shape: "text" \| "block" \| "circle"`, `size` (a text size or spacing step) |
| Display | `Card` | — | `render` (makes the whole card a link); uses `shadow-card` |
| | `Chip` | — | `tone: "paper" \| "soft"`, `icon` |
| | `VerdictTag` | — | `verdict: "correct" \| "almost" \| "incorrect"`; the word is always shown |

Form controls work controlled or uncontrolled (`defaultValue`, `defaultChecked`). There's no destructive button variant: destructive actions ask for confirmation in a `Dialog`.

How the base components look:

- **Button:** `primary` is a violet fill with `--on-primary` text; `secondary` is a paper fill with ink text. Both have an ink outline, `--shadow-press` and a minimum height of 44px.
- **TextField / TextArea:** `--subtle` fill, ink outline, `--radius-md`. Focus: a 3px violet ring outside the outline (`focus-ring`).
- **Chip:** a pill with an ink outline and a paper (`tone="paper"`) or `--primary-soft` (`tone="soft"`) fill.
- **ChoiceChips:** large outlined pills; a picked chip fills with `--primary-soft`.
- **VerdictTag:** a pill with the verdict tint as fill and the verdict colour for the text, which is the word itself.

### Domain components (provisional)

These aren't built yet. They will live in `@impromptu/ui` too, but their names and props get confirmed by the screen tickets and their own spec.

| Component | Spec |
|---|---|
| **App bar** | The "Impromptu" wordmark (700, `title`). Streak and XP chips on the right: paper fill, ink outline, violet number. |
| **`StepFeedback`** | A verdict-tint background. It shows the `VerdictTag`, the corrected sentence in bold, a one-sentence explanation, and a "Hear it" secondary button followed by a "Next step" primary button. |
| **Live bar** | A 2px `--live` border with a pulsing dot, then the "LIVE" label in `text-live`, then the Roleplay kind and tone, then the remaining daily minutes (tabular), then a secondary "End" button. It sits at the top of the Roleplay screen. |
| **Recording button (speakPrompt)** | A large round button, 72px. Idle: violet. Recording: a `--live` ring pulsing, a waveform and a timer counting toward the 30–90s target. |
| **Skill bar** | An 8px track in `--subtle`, filled with the skill colour. The label sits on the left; the score and CEFR Level on the right (tabular). |
| **CEFR scale** | Six cells from the CEFR scale above. The current Level has a 2px ink outline offset by 1px. |
| **Streak card** | On a loud surface: the number in `hero`, a "day streak" label and a `Card` (so it gets `--shadow-pop`). It's the screen people screenshot, so it should look good cropped square. |

### Step types (quiet surface)

Every Step shows the same header: an uppercase `label` ("REWRITE · STEP 4 OF ~7") and the question in `title`. After that:

- **vocabCard:** a card with the word in `heading`, a "Hear it" button, the meaning and an example sentence. Below it, a `TextField` (or the recording button) for "Use it in your own sentence".
- **fillGap:** the sentence with the gap shown as an underlined slot. Choices appear as `ChoiceChips`, or as a single `TextField` if there are no choices.
- **rewrite:** the original sentence quoted in a `--subtle` panel, then a `TextArea`.
- **speakPrompt:** the question, the target length ("Aim for 30–90 seconds") and the recording button, with "Type instead" as a `TextLink`.
- **roleplayTurn:** no card chrome, just the interviewer's line as speech text, with the live bar fixed at the top. Nothing is graded on screen until the Debrief.

## Theming and implementation

Styling lives **only in `@impromptu/ui`**. Apps can't style themselves:

- **Apps assemble screens from components.** They never pass `className` or `style` (component props don't accept them, and lint rejects them on any element), and they have no CSS files. The only stylesheet an app loads is `@impromptu/ui/styles.css`. An app adopts the boundary with one line in its `eslint.config.js`: `export { default } from "@impromptu/ui/eslint";`.
- **A missing style is a change to the package.** If a screen needs a look no component offers, add the variant or component in `packages/ui`.
- **Tailwind v4 runs only on our tokens, inside the package.** `styles.css` imports Tailwind with `source(none)` (so apps are never scanned) and wipes the default theme (`--*: initial`). `bg-primary`, `p-4`, `text-body` and `shadow-card` work; `bg-blue-500`, `p-7`, `text-brand` and arbitrary values like `bg-[#fff]` don't exist. Lint in the package also rejects opacity suffixes (`/50`) and plain-number durations and z-indexes.
- **Base UI provides behaviour and accessibility** for interactive parts (Button, Field, Input, RadioGroup, CheckboxGroup, Select, Switch, Dialog, Menu, Progress, Meter and Toast), styled with our tokens. shadcn/ui is not used. Simple elements such as Card and Chip are plain elements styled with tokens.
- **Icons** are Phosphor, Bold weight, 1em, in the current text colour (set by `UIProvider`).
- **The package is app-agnostic:** no router imports, no data fetching, no browser storage and no app state. Data goes in through props and events come out through callbacks. Tokens are exported as plain CSS in `@impromptu/ui/tokens.css`, so things that don't use React or Tailwind (marketing pages, email) can use them too.

Tokens are defined once as CSS variables in `tokens.css`: hue primitives (`--violet-600` and so on, not exposed as utilities), then semantic tokens that point at them. The surface is switched with a class:

```css
:root {
  --paper: var(--white); --ink: var(--gray-950); --primary: var(--violet-600); /* … */
  --correct-tint: color-mix(in oklab, var(--correct) 15%, var(--paper));
}
/* dark values go in both blocks so the theme toggle wins in either direction */
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { /* dark values */ color-scheme: dark } }
:root[data-theme="dark"] { /* same dark values */ color-scheme: dark }

:root, .surface-quiet { --surface: var(--paper); --card-shadow: 0 0 #0000; } /* Lesson player, Roleplay, Debrief */
.surface-loud { --surface: var(--brand); --card-shadow: var(--shadow-pop); } /* home, Roadmap, Streak, Report reveal */
```

- **Theme:** follows the system setting by default, with a Light / Dark / System choice. The app stores it and renders `data-theme` on `<html>` on the server, so the first paint is right. `UIProvider` doesn't handle theme. Inside the package, the `dark:` variant matches both dark selectors.
- **Layout:** design for phones first. The Lesson player is a single column at any width, in `Container width="content"` (640px). `Screen` gives side gutters of 16px. `Split` turns into two columns at `desktop`.
- **Accessibility:** touch targets are at least 44px (`--size-target`); focus is always visible (`focus-ring`, a violet ring); body text meets 4.5:1 contrast and large text 3:1; verdicts and live state always carry words, not only colour; every `Screen` is a `main` landmark.


## v1 interface rules

The working [Design System guide](http://localhost:3001/design-system) renders the shipped components, not copies. It offers Light / Dark / System on a fixed quiet preview surface, recording states, forms, overlays and separate AppShell / PracticeShell examples. It needs no account or AI keys. `DESIGN.md` remains the written reference; the guide is the visual and interactive reference.

### Writing

- Use the terms in `GLOSSARY.md`, short sentences and familiar English. Address the Learner as “you”.
- Actions name their result: “Start the Written Assessment”, “Confirm”, “Write my Debrief”. Avoid technical status codes, provider names and implementation terms in normal flows.
- Errors say what happened, whether answers were saved, and what to do next. Keep useful input; offer a retry or text alternative where available.
- Treat mistakes as practice. Verdicts always include Correct / Almost / Incorrect; never imply a text answer measured fluency.
- State limits in the Learner's local time. Use concrete counts or dates where known; never promise completion times the product cannot guarantee.

### Responsive layouts

| Screens | Phone | Desktop (64rem and above) |
|---|---|---|
| Home | Today's Lesson, Roleplay, then Streak and XP | Main content and secondary status through Split |
| Roadmap / Unit | Ordered cards and Lessons in one column | Centred content column; preserve learning order |
| Sign-in / Goals / Assessment choice / confirmation | Single column with full-width main action | Centred prose column; keep forms together |
| Lesson / live Assessment / Roleplay | Quiet single column; controls wrap | Same focused content width; no side panels while practising |
| Assessment Report / Debrief | Sections in reading order | Centred prose/content column; retain quote and correction proximity |
| Progress / Settings | One section at a time | Centred content/prose column; avoid stretching tables or forms |

Long pasted text wraps inside its container. Navigation becomes a sidebar on desktop and bottom tabs on phone. Dialogs are centred; Sheets rise from the bottom on phone and centre on desktop. Overlays stay within the viewport and scroll when needed.

### Motion

Page changes are immediate; no page-wide movement or delayed access to content. Buttons use the 80ms press and overlays the 160ms UI transition. Lesson completion, CEFR reveals and weekly Streak milestones use the same 800ms one-shot celebration. Timers never animate each tick. Every movement uses `motion-safe:`; reduced motion preserves content, focus and feedback without movement.

### First Assessment Report email

The first completed Report is delivered as responsive HTML plus plain text. A lime heading introduces the overall CEFR Level; the body includes measured skills, strengths, quoted weaknesses, better versions and the first Unit. Written Assessments explicitly leave fluency unmeasured; partial Reports say so. One violet action opens Home, which confirms proposed Goals before offering the first Lesson. Use inline styles, system fonts and layout tables; no remote images, scripts, tracking pixels or dependency on app CSS. Untrusted Report text is escaped.

Haptics, share images, translations and marketing pages remain outside v1 as specified in #86.
