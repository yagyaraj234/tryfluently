# Fluently Design System

One visual language for everything Fluently ships: the public landing page, sign-in and sign-up, and the signed-in app. There's one theme, one stylesheet and one set of components. Terms like Learner, Step, Roleplay and Debrief follow `GLOSSARY.md`.

## Principles

1. **One look, everywhere.** A warm grey canvas, white cards with a hairline and a soft shadow, pill buttons and cobalt as the one accent. A first-time visitor on the landing page sees the same product they'll use after signing up.
2. **Calm, so the Learner can concentrate.** Practice screens (Lesson player, live Roleplay, Debrief) use the same theme as everything else. Cobalt brand panels, glows and floating chips are for brand moments (the landing page, auth, celebrations), never for the content being practised.
3. **Easy to read in a second language.** The base text size is 17px, lines are generous, and running text is limited to about 65 characters per line. Every verdict uses a word as well as a colour.
4. **Every colour has one meaning.** Cobalt is for actions, hot pink means a live microphone, and the three verdict colours mean correct, almost and incorrect. Nothing borrows another colour's meaning.

## How styling works

- **Tailwind CSS v4 does all the styling.** Components use utility classes directly, including breakpoints (`sm:`, `md:`, `lg:`), states (`hover:`, `data-checked:`, `group-open:`) and dark mode (`dark:`). There are no hand-written CSS classes and no inline `style` props.
- **There is one stylesheet:** `packages/ui/src/styles.css`, exported as `@fluently/ui/styles.css`. It holds only what utilities can't: the theme tokens (`@theme`), their dark values, keyframes, and a few base rules (page background and font, the focus ring, scroll margin under the sticky nav). If something can be a utility, it is one.
- **Styling lives only in `@fluently/ui`.** Apps assemble screens from components and never pass `className` or `style` (component props don't accept them, and lint rejects them in apps). Apps have no CSS files; the only stylesheet they load is `@fluently/ui/styles.css`. An app adopts the boundary with one line in its `eslint.config.js`: `export { default } from "@fluently/ui/eslint";`.
- **A missing style is a change to the package.** If a screen needs a look no component offers, add the variant or component in `packages/ui`.
- **Tailwind's own scales stay; only colours and shadows are ours.** Spacing (`p-7`, `gap-3.5`), radius, the default text sizes, containers and breakpoints are Tailwind's defaults. Tailwind's colour palette and shadows are wiped (`--color-*: initial`), so `bg-blue-500` and `shadow-lg` don't exist; every colour and shadow comes from the theme below.
- **Lint keeps it honest** (`packages/ui/eslint.config.js`): unknown classes fail; arbitrary values are allowed for one-off layout (`max-w-[40ch]`) but never with a raw colour (`bg-[#fff]` fails; `var(--color-ink)` passes); durations and z-indexes use the named tokens; borders are `border` (1px) or `border-2`.

## Colour

Each colour is a Tailwind theme colour (`--color-<name>`), so it works with every colour utility: `bg-`, `text-`, `border-`, `ring-`, `from-`/`to-`, `fill-`, `stroke-`, and opacity modifiers like `bg-on-brand/15`.

### Canvas and surfaces

| Token         | Light               | Dark         | Use                                                |
| ------------- | ------------------- | ------------ | -------------------------------------------------- |
| `canvas`      | `#F5F5F4` warm grey | `#121211`    | The page background (`bg-canvas`)                  |
| `paper`       | `#FFFFFF`           | `#262625`    | Cards, dialogs, menus, toasts, inputs              |
| `subtle`      | `#F5F4F1`           | `#1B1B1A`    | Inset panels, tracks, skeletons, the product frame |
| `ink`         | `#0E0E0F`           | `#F3F2EF`    | Text                                               |
| `muted`       | `#66655F`           | `#A3A29B`    | Secondary text, captions                           |
| `line`        | ink at 9%           | white at 10% | Hairlines around cards and panels; empty tracks    |
| `line-strong` | `#8F8E88`           | `#7A7973`    | Borders of form controls (3:1 against paper)       |
| `scrim`       | black at 50%        | same         | Dims the page behind a Dialog or Sheet             |

`canvas` isn't called `page` because `text-page` is a type size, and a colour with the same name would also set the text colour.

### Action

| Token          | Light            | Dark          | Use                                                 |
| -------------- | ---------------- | ------------- | --------------------------------------------------- |
| `primary`      | `#2F3BD6` cobalt | `#8CC4FF` sky | Primary buttons, links, focus ring, selected states |
| `on-primary`   | `#FFFFFF`        | `#0B1240`     | Text on primary                                     |
| `primary-soft` | `#E3EAFF`        | `#1D2550`     | Selected backgrounds, soft chips and pills          |

### Brand panels

Cobalt panels (the auth story panel, the Roleplay preview, the closing call to action) stay cobalt in both themes, so white text always reads. They're built from a gradient plus blurred glows: `bg-linear-160 from-brand-mid to-brand`, with `bg-brand-hi/85 blur-3xl` blobs behind the content.

| Token             | Value (both themes)   | Use                                                                |
| ----------------- | --------------------- | ------------------------------------------------------------------ |
| `brand`           | `#2F3BD6`             | Panel fill                                                         |
| `brand-mid`       | `#4466E0`             | Gradient start                                                     |
| `brand-deep`      | `#181C8C`             | Deep corner glow                                                   |
| `brand-hi`        | `#8CC4FF`             | Sky glow, filled meter segments                                    |
| `on-brand`        | `#FFFFFF`             | Text and glass on a panel (`bg-on-brand/12`, `border-on-brand/24`) |
| `white` / `black` | `#FFFFFF` / `#0E0E0F` | Pills that sit on a panel (`Button variant="inverse"`)             |

### Live voice

Use these **only** while the microphone is recording or a Realtime call is connected.

| Token       | Light     | Dark      | Use                                                |
| ----------- | --------- | --------- | -------------------------------------------------- |
| `live`      | `#FF2E6E` | `#FF6B98` | Pulsing dot, live border, recording ring           |
| `live-text` | `#D1105A` | `#FF6B98` | "LIVE" label and timer text (meets 4.5:1 on paper) |

### Verdicts

Every verdict is shown as a coloured word (Correct / Almost / Incorrect), never colour alone. Each tint is an opaque mix with paper, so it follows dark mode.

| Token       | Light     | Dark      | Tint             |
| ----------- | --------- | --------- | ---------------- |
| `correct`   | `#08753D` | `#4FD18A` | `correct-tint`   |
| `almost`    | `#805800` | `#FFD24D` | `almost-tint`    |
| `incorrect` | `#BE1E55` | `#FF7FA3` | `incorrect-tint` |

Incorrect is a soft rose, not an alarm red, so that a mistake doesn't feel like a punishment.

### Skills (charts only)

| Token              | Light     | Dark      |
| ------------------ | --------- | --------- |
| `skill-fluency`    | `#6A3DF0` | `#A98BFF` |
| `skill-grammar`    | `#1F6FEB` | `#6EA8FF` |
| `skill-vocabulary` | `#F0711A` | `#FF9A4D` |

### CEFR scale

A single violet hue, darker from A1 to C2 (`cefr-a1` to `cefr-c2`). Use ink text on A1–B1 and `on-primary` text on B2–C2.

|       | A1        | A2        | B1        | B2        | C1        | C2        |
| ----- | --------- | --------- | --------- | --------- | --------- | --------- |
| Light | `#E7E0FD` | `#CCBDFA` | `#AD94F6` | `#7955D7` | `#6A3DF0` | `#4B2EA2` |
| Dark  | `#323433` | `#4B465F` | `#695C92` | `#8D76CE` | `#A98BFF` | `#C2B4EF` |

## Typography

- **Family:** Inter (Google Fonts, variable 400–700), falling back to `system-ui, sans-serif`. One font for display and body text, so there is one font request.
- **Weights:** Tailwind's `font-normal` (400), `font-medium` (500, nav links), `font-semibold` (600, buttons, pills, labels) and `font-bold` (700, headings). Headings are bold; small UI text is semibold, so the page doesn't read as bold everywhere.
- **Tracking tightens as type grows:** `tracking-tighter` on the hero headline and wordmark, `tracking-tight` on section headings and card titles.
- **Numbers:** `tabular-nums` (`Text tabular`) on XP, Streak, timers, scores and anything else that lines up.

Product copy uses the **type roles**, through `Text size` and `Heading`. Each role carries its own line height, weight and tracking:

| Role           | Size             | Line height | Weight                  | Use                                   |
| -------------- | ---------------- | ----------- | ----------------------- | ------------------------------------- |
| `text-label`   | 0.8125rem (13px) | 1.4         | 600, uppercase, +0.08em | Labels like "LIVE" and "STEP 4 OF ~7" |
| `text-caption` | 0.9375rem (15px) | 1.5         | 400                     | Captions, explanations                |
| `text-body`    | 1.0625rem (17px) | 1.6         | 400                     | Body and answers                      |
| `text-title`   | 1.3125rem (21px) | 1.35        | 700                     | Step questions, card titles           |
| `text-heading` | 1.6875rem (27px) | 1.2         | 700                     | Section headings                      |
| `text-page`    | 2.125rem (34px)  | 1.1         | 700                     | Page titles                           |
| `text-hero`    | 3.375rem (54px)  | 1.0         | 700                     | Streak and XP numbers, CEFR reveal    |

Display type on the landing page and auth panels uses Tailwind's scale and steps up at breakpoints instead of fluid `clamp()` sizes: the hero is `text-5xl sm:text-6xl lg:text-7xl`, section headings `text-4xl sm:text-5xl`. Headings use `text-balance`, paragraphs `text-pretty`. Running text sits in `Container width="prose"` (65ch). Nothing is smaller than 12px (`text-xs`).

## Shape, space and depth

| What           | Utilities                                                                                                                                                                                                                 | Use                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Hairline       | `border border-line`                                                                                                                                                                                                      | Every card, panel, chip and nav                                                                |
| Form border    | `border border-line-strong`                                                                                                                                                                                               | Inputs, selects, switches, choice chips                                                        |
| Emphasis       | `border-2`, `inset-ring-2`                                                                                                                                                                                                | Spinner, the gap slot, the CEFR target cell                                                    |
| Radius         | `rounded-lg` (8px) small tags · `rounded-xl` (12px) inputs, list rows · `rounded-2xl` (16px) bubbles, FAQ items · `rounded-3xl` (24px) cards · `rounded-4xl` (32px) panels, frames · `rounded-full` buttons, chips, pills |                                                                                                |
| `shadow-card`  | two soft layers plus a 1px inner highlight                                                                                                                                                                                | Cards, secondary buttons, overlays                                                             |
| `shadow-lift`  | a deeper `shadow-card`                                                                                                                                                                                                    | Landing cards on hover, with `hover:-translate-y-0.5`                                          |
| `shadow-frame` | a long, low shadow                                                                                                                                                                                                        | The product frame under the hero                                                               |
| `shadow-float` | black at 35%                                                                                                                                                                                                              | Pills sitting on a cobalt panel                                                                |
| `shadow-glow`  | tinted with `shadow-primary/55`                                                                                                                                                                                           | The one call to action on a page, with a `ring-2 ring-primary ring-offset-2`                   |
| Spacing        | Tailwind's 4px scale (`p-4`, `gap-3.5`, `pt-14`)                                                                                                                                                                          | Use `gap` on flex and grid, not margins between siblings                                       |
| Touch target   | `min-h-11` / `size-11` (44px)                                                                                                                                                                                             | The smallest touch target                                                                      |
| Layers         | `z-behind` (−1) · `z-sticky` (10) · `z-overlay` (20) · `z-toast` (30)                                                                                                                                                     | The only stacking levels. `z-behind` sits decoration behind content inside an `isolate` parent |
| Widths         | `max-w-content` (40rem) · `max-w-prose` (65ch) · `max-w-page` (67.5rem) · `w-sidebar` (15rem)                                                                                                                             | The Lesson column and dialogs · running text · the landing page · the app sidebar              |

## Responsive layout

Design for phones first, then add breakpoints with Tailwind's defaults:

| Prefix | Min width | Typical change                                                                                                                     |
| ------ | --------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| (none) | 0         | One column, 16px side gutters (`px-4`)                                                                                             |
| `sm:`  | 40rem     | Nav links appear; larger display type; looser section padding                                                                      |
| `md:`  | 48rem     | Landing grids go to two or three columns; auth shows the full story panel beside the form                                          |
| `lg:`  | 64rem     | App navigation becomes a sidebar with the logo; Home's rail docks to the right; `Split` goes two thirds / one third; Sheets centre |

Use `max-*:` variants (`max-sm:w-full`) only when a phone-only style is simpler than undoing it at a breakpoint.

| Screens                                  | Phone                                                                          | `lg` (64rem) and above                                                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Landing                                  | One column; product frame stacks; nav shows the wordmark and "Start free"      | Two-column features; three-column steps and cards (from `md`)                                                                               |
| Sign-in / sign-up                        | The cobalt panel shrinks to the wordmark and headline above the form           | Story panel with steps beside the form (from `md`)                                                                                          |
| Home                                     | Continue learning, Up next, then the rail as one white panel                   | `Dashboard`: the main column, and a full-height white rail flush against the right edge with the profile card, This week and the stat tiles |
| Roadmap                                  | Numbered Unit cards in one column                                              | The same cards two to a row at `Container width="page"`, in Roadmap order                                                                   |
| Unit                                     | The Unit's header card with its main action, then its finished Lessons as rows | Centred content column                                                                                                                      |
| Goals / Assessment choice / confirmation | Single column with full-width main action                                      | Centred prose column; keep forms together                                                                                                   |
| Lesson / live Assessment / Roleplay      | Single column; controls wrap; a Lesson's Step sits on a paper card             | Same focused content width; no side panels while practising                                                                                 |
| Assessment Report / Debrief              | Sections in reading order                                                      | Centred prose or content column; keep quote and correction together                                                                         |
| Progress / Settings                      | One section at a time                                                          | Centred content or prose column; don't stretch tables or forms                                                                              |

Long pasted text wraps inside its container (`wrap-anywhere` on `body`). App navigation is bottom tabs on phone and a sidebar at `lg`. Dialogs are centred; Sheets rise from the bottom on phone and centre at `lg`. Overlays stay within the viewport and scroll when needed.

## Motion

| Token                                                          | Value                                   | Use                                                                |
| -------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------ |
| `duration-press`, `ease-press`                                 | 160ms, `cubic-bezier(0.23, 1, 0.32, 1)` | Button press (`active:scale-97`), card lift, FAQ open              |
| `duration-ui`, `ease-ui`                                       | 160ms, `cubic-bezier(0.2, 0, 0, 1)`     | Overlays, progress, small state changes                            |
| `animate-pulse`                                                | 1.6s                                    | Live dot, recording ring, skeletons                                |
| `animate-spin`                                                 | 0.8s per turn                           | `Spinner`                                                          |
| `animate-celebrate`                                            | 800ms, once                             | Lesson complete, current CEFR cell, Streak milestones              |
| `animate-rise`                                                 | 520ms fade up                           | The landing hero, staggered with `[animation-delay:60ms]` steps    |
| `animate-draw`, `animate-bob`, `animate-wave`, `animate-blink` |                                         | The hero underline, floating chips, the waveform, the typing caret |

- **Press:** buttons shrink to 97% on `:active`. It feels like a physical key without moving the layout.
- **Celebrations** happen at brand moments, never during practice, and last under 1.2s.
- **Page changes are immediate:** no page-wide movement or delayed access to content. Timers never animate each tick.
- **Reduced motion:** every animation and transition runs under `motion-safe:`. With reduced motion the content, focus and feedback are all still there, without movement. Glass blurs drop under `reduce-transparency:`.

## Components

Every component lives in `@fluently/ui` and is imported from the package root. No component accepts `className` or `style`. Variant props (`variant`, `tone`, `size`) take role names, never colour names. Components that navigate take a `render` prop (for example a router link), which receives the component's props, classes and ref. Components that take an icon take a Phosphor icon component and render it themselves. Wrap the app once in `UIProvider`, which sets Phosphor's defaults (Bold, 1em, current colour), renders toasts and isolates the stacking context so overlays layer correctly.

### Base components

| Group    | Component               | Built on                   | Key props                                                                                                                                                    |
| -------- | ----------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Layout   | `Screen`                | —                          | Renders `<main>` on the canvas with side gutters                                                                                                             |
|          | `Stack`                 | —                          | `gap` (spacing step), `align`                                                                                                                                |
|          | `Cluster`               | —                          | `gap`, `justify`, `align`; wraps                                                                                                                             |
|          | `Container`             | —                          | `width: "content" \| "prose" \| "page"`; centred. `page` is for dashboards with a side column                                                                |
|          | `Grid`                  | —                          | `columns: "responsive" \| 2` (one column on phones, two from `sm`; or always two); `ordered` renders a list                                                  |
|          | `Split`                 | —                          | `main` and `side` slots; stacked below `lg`, two thirds and one third at it                                                                                  |
|          | `Dashboard`             | —                          | `main` and `rail` slots, for Home inside `AppShell`; the rail is a white panel below the main column on phones and a full-height column on the right at `lg` |
| Type     | `Text`                  | —                          | `size` (label…hero), `tone: "ink" \| "muted"`, `as`, `tabular`                                                                                               |
|          | `Heading`               | —                          | `level: 1 \| 2 \| 3` → page / heading / title; `size` overrides                                                                                              |
| Actions  | `Button`                | Base UI Button             | `variant: "primary" \| "secondary" \| "inverse"`, `size: "md" \| "sm"`, `glow`, `fullWidth`, `icon`, `render`                                                |
|          | `IconButton`            | Base UI Button             | `icon`, required `label`, `render`                                                                                                                           |
|          | `TextLink`              | —                          | `render`                                                                                                                                                     |
| Forms    | `TextField`             | Field, Input               | required `label`, `description`, `error`                                                                                                                     |
|          | `TextArea`              | Field                      | as `TextField`                                                                                                                                               |
|          | `ChoiceChips`           | RadioGroup / CheckboxGroup | `label`, `options`, `multiple`, `value`, `onValueChange`                                                                                                     |
|          | `Select`                | Select                     | `label`, `options`, `value`, `onValueChange`                                                                                                                 |
|          | `Switch`                | Switch                     | `label`, `checked`, `onCheckedChange`                                                                                                                        |
| Overlays | `Dialog`                | Dialog                     | `open`, `onOpenChange`, `title`, `description`; modal                                                                                                        |
|          | `Sheet`                 | Dialog                     | as `Dialog`; bottom sheet below `lg`                                                                                                                         |
|          | `Menu`                  | Menu                       | `trigger`, and `items` each with `onSelect` or `render`                                                                                                      |
| Feedback | Toasts (`toastManager`) | Toast                      | `toastManager.add({ title, description, actionProps })`, callable from anywhere; rendered by `UIProvider`                                                    |
|          | `ProgressBar`           | Progress                   | `value`, `max`, `label`                                                                                                                                      |
|          | `Meter`                 | Meter                      | `value`, `max`, `label`                                                                                                                                      |
|          | `Spinner`               | —                          | `label`                                                                                                                                                      |
|          | `Skeleton`              | —                          | `shape: "text" \| "block" \| "circle"`, `size`                                                                                                               |
| Display  | `Card`                  | —                          | `render` (makes the whole card a link), `size: "md" \| "sm"` (`sm` is the denser dashboard card)                                                             |
|          | `CardList`              | —                          | Rows on one card, split by hairlines                                                                                                                         |
|          | `Chip`                  | —                          | `tone: "paper" \| "soft"`, `icon`                                                                                                                            |
|          | `VerdictTag`            | —                          | `verdict: "correct" \| "almost" \| "incorrect"`; the word is always shown                                                                                    |

Form controls work controlled or uncontrolled (`defaultValue`, `defaultChecked`). There's no destructive button variant: destructive actions ask for confirmation in a `Dialog`.

How they look:

- **Button:** a pill, semibold, at least 44px tall. `primary` is cobalt with `on-primary` text; `secondary` is paper with a hairline and `shadow-card`; `inverse` is white on a cobalt panel. `size="sm"` is the nav size. `glow` adds the ring and cobalt glow for a page's one main call to action.
- **Card:** paper, `rounded-3xl`, hairline, `shadow-card`. The same classes (`cardClasses`) build the landing page's cards, so they can't drift.
- **TextField / TextArea / Select:** paper fill, `line-strong` border, `rounded-xl`. Focus shows the global 2px cobalt ring, offset by 2px.
- **ChoiceChips:** outlined pills; a picked chip fills with `primary-soft` and takes a cobalt border.
- **VerdictTag:** a pill with the verdict tint as fill and the verdict colour for the word.

### Domain components

The shipped domain components include `AppShell`, `PracticeShell`, `UnitCard`, `ProfileCard`, `WeekStrip`, `StatTile`, `StepFeedback`, `LiveBar`, `RecordButton`, `SkillBar`, `CefrScale`, `StreakCard`, `LessonComplete`, `Report` and `Debrief`. The table records their visual intent; use the exports in `packages/ui/src/index.ts` for current props.

| Component            | Spec                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **App bar**          | A sticky top bar: the page's `h1` in `title` on the left (from the route's `staticData.title`), Streak and XP chips on the right, a hairline below. Pages with their own heading, like a Unit, leave the title out.                                                                                                                                                                               |
| **Sidebar**          | The landing page's lowercase cobalt "fluently" logo, a muted "MENU" label, then compact `caption` rows with an icon. The current row fills with `primary-soft` and turns cobalt.                                                                                                                                                                                                                 |
| **Rail tiles**       | On Home's white rail, the profile card, week strip and stat tiles are `subtle` tiles with a hairline and `rounded-2xl` (`railTileClasses`), like cards in a tray.                                                                                                                                                                                                                                 |
| **Practice bar**     | The close button, and beside it what's being practised (a Lesson's Unit) in muted `caption`. It sticks to the top.                                                                                                                                                                                                                                                                                |
| **Unit card**        | A dense card (`Card size="sm"`): the icon tile, the title in semibold `body` with "UNIT 3 · GRAMMAR" below, the status tag, and the objective in two lines. The active Unit adds a thick bar with "2 Lessons done" and "58% to the objective" under it. `cover` adds a cobalt brand cover with the Unit's icon, standing in for a thumbnail. With an action (Resume), only the title is the link. |
| **Profile card**     | A cobalt avatar with the initial, the name, the CEFR Level of each measured skill as small cobalt pills (a link to Progress), and Streak · XP · Units mastered with icons on a white strip.                                                                                                                                                                                                       |
| **Week strip**       | "This week" with "4/7 days", then seven day pills, Monday to Sunday, each with the weekday and date. Practised days fill cobalt, earlier days are white, later days are muted, and today has an offset cobalt ring. Screen readers hear "practised" and "today".                                                                                                                                  |
| **Stat tile**        | A rail tile: a white icon tile, a number in `title`, and a muted label that reads on from it ("2 Lessons done").                                                                                                                                                                                                                                                                                  |
| **`StepFeedback`**   | A verdict-tint background with the `VerdictTag`, the corrected sentence in bold, a one-sentence explanation, a "Hear it" secondary button and a "Next step" primary button.                                                                                                                                                                                                                       |
| **Live bar**         | A `live` border with a pulsing dot, the "LIVE" label in `text-live-text`, the Roleplay kind and tone, the remaining minutes (tabular) and a secondary "End" button. It sticks to the top of the Roleplay screen.                                                                                                                                                                                  |
| **Recording button** | A 72px round button (`size-18`). Idle: cobalt with the glow. Recording: paper with a pulsing `live` ring. Processing: a spinner on `subtle`.                                                                                                                                                                                                                                                      |
| **Skill bar**        | An 8px `subtle` track filled with the skill colour; the label on the left, score and CEFR Level on the right (tabular).                                                                                                                                                                                                                                                                           |
| **CEFR scale**       | Six cells from the CEFR scale. The current Level has a 2px ink outline and celebrates once.                                                                                                                                                                                                                                                                                                       |
| **Streak card**      | The number in `hero`, a "day streak" label, in a `Card`. It should look good cropped square, since people screenshot it.                                                                                                                                                                                                                                                                          |
| **Lesson complete**  | A card with the celebrating icon, the XP gained, the Streak card and the next actions.                                                                                                                                                                                                                                                                                                            |
| **Chat**             | `ChatThread` is a scrolling conversation log that follows new turns unless the Learner has scrolled back. `ChatTurn` shows a blinking caret while text streams. `ChatWriting` is the skeleton bubble while the coach's reply is on its way, and `ChatComposer` sends on Enter while Shift+Enter starts a new line.                                                                                |

### Step types

Every Step shows the same header: an uppercase `label` ("REWRITE · STEP 4 OF ~7") and the question in `title`. After that:

- **vocabCard:** a card with the word in `heading`, a "Hear it" button, the meaning and an example sentence, then a `TextField` (or the recording button) for "Use it in your own sentence".
- **fillGap:** the sentence with the gap shown as an underlined slot. Choices appear as `ChoiceChips`, or a single `TextField` if there are none.
- **rewrite:** the original sentence quoted in a `subtle` panel, then a `TextArea`.
- **speakPrompt:** the question, the target length ("Aim for 30–90 seconds") and the recording button, with "Type instead" as a `TextLink`.
- **roleplayTurn:** no card chrome, just the interviewer's line, with the live bar at the top. Nothing is graded on screen until the Debrief.

### Landing page and auth

The landing page (`/`) and sign-in / sign-up are built from the same package: `Marketing.tsx` (`MarketingShell`, `MarketingHero`, `ProductFrame`, `Feature`, `FeatureTrio`, `HowItWorks`, `Faq`, `FinalCta`, `AuthLayout`) and `MarketingMocks.tsx` (product illustrations). They use the same tokens, `Button`, `Card` classes, `Heading` and form components as the app.

- **Static first:** these components take no state and run no effects. Every section is complete in the server-rendered HTML, and the FAQ is native `<details>` (it animates open with `details-content:` where the browser supports it). Motion is CSS only, and the page reads the same without it.
- **Copy is data:** the page's words live in `apps/web/src/content/landing.ts`. The page, the JSON-LD, `/llms.txt` and the sitemap are built from it, so crawlers and the page agree.
- **Illustrations** use example content (names, scores, streaks) and are exposed as `role="img"` with a description.
- **Decoration** (the dot grid behind the hero, glows on cobalt panels) is made of `aria-hidden` elements with utilities, placed with `z-behind` inside an `isolate` parent.

## Theming

- **Light and dark:** the theme follows the system setting by default, with a Light / Dark / System choice. The app stores it and renders `data-theme` on `<html>` on the server, so the first paint is right. `UIProvider` doesn't handle theme.
- **How dark works:** dark values are declared once in `styles.css`, under `:root` with `@variant dark`. The `dark` variant matches `prefers-color-scheme: dark` unless `data-theme="light"`, and always matches `data-theme="dark"`, so an explicit choice wins in either direction. Components use `dark:` the same way, though most never need it: the colour tokens already switch.
- **Accessibility:** touch targets are at least 44px; focus is always visible (a 2px cobalt outline on `:focus-visible`, set once in `styles.css`); body text meets 4.5:1 contrast and large text 3:1; form control borders meet 3:1; verdicts and live state always carry words, not only colour; every `Screen` is a `main` landmark; the landing page has a skip link.
- **Icons** are Phosphor, Bold weight, 1em, in the current text colour (set by `UIProvider`).
- **Base UI provides behaviour and accessibility** for interactive parts (Button, Field, Input, RadioGroup, CheckboxGroup, Select, Switch, Dialog, Menu, Progress, Meter and Toast). shadcn/ui is not used.
- **The package is app-agnostic:** no router imports, no data fetching, no browser storage and no app state. Data goes in through props and events come out through callbacks.

The working [Design System guide](http://localhost:3001/design-system) renders the shipped components and live tokens, with Light / Dark / System controls, recording states, forms, overlays and AppShell / PracticeShell previews. It needs no account or AI keys. `DESIGN.md` is the written reference; the guide is the visual one.

## Writing

- Use the terms in `GLOSSARY.md`, short sentences and familiar English. Address the Learner as "you".
- Actions name their result: "Start the Written Assessment", "Confirm", "Write my Debrief". Avoid technical status codes, provider names and implementation terms in normal flows.
- Errors say what happened, whether answers were saved, and what to do next. Keep useful input; offer a retry or text alternative where available.
- Treat mistakes as practice. Verdicts always include Correct / Almost / Incorrect; never imply a text answer measured fluency.
- State limits in the Learner's local time. Use concrete counts or dates where known; never promise completion times the product can't guarantee.

## First Assessment Report email

The first completed Report is delivered as responsive HTML plus plain text. A heading introduces the overall CEFR Level; the body includes measured skills, strengths, quoted weaknesses, better versions and the first Unit. Written Assessments explicitly leave fluency unmeasured; partial Reports say so. One cobalt action opens Home, which confirms proposed Goals before offering the first Lesson. Email clients don't run Tailwind, so the email uses inline styles, system fonts and layout tables, with no remote images, scripts or tracking pixels, and doesn't depend on the app's CSS. Untrusted Report text is escaped.

Haptics, share images and translations remain outside v1 as specified in #86.
