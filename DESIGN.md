# Impromptu Design System: Neo Pop · Lime Rush

The visual language for the Impromptu web app. Terms like Learner, Step, Roleplay and Debrief follow `GLOSSARY.md`. You can compare all colourways in the [direction explorer](https://claude.ai/artifact/VX2uvoorzcdc37dQYMGb9p) (option 3).

## Principles

1. **Loud outside, calm while practising.** Brand moments (home, Roadmap, Streak, XP, celebrations, the Assessment Report reveal) use the full lime **loud** surface. Practice (Lesson player, live Roleplay, Debrief) uses the white **quiet** surface: same type and outlines, no lime behind the content, so the Learner can concentrate while speaking.
2. **Built for the Gen Z audience, but credible.** Thick ink outlines, offset shadows and bright colour make the app feel like something people choose to use, not homework. It stays clean enough to trust with interview prep.
3. **Easy to read in a second language.** The base text size is 17px, lines are generous, and running text is limited to about 65 characters per line. Every verdict uses a word as well as a colour.
4. **Every colour has one meaning.** Violet is for actions, hot pink means a live microphone, and the three verdict colours mean correct, almost and incorrect. Nothing borrows another colour's meaning.

## Colour

### Brand and surfaces

| Token | Light | Dark | Use |
|---|---|---|---|
| `--brand` | `#C6F432` lime | `#121808` | Loud surface background |
| `--paper` | `#FFFFFF` | `#1B230C` | Quiet surface, cards, panels |
| `--ink` | `#111111` | `#F1FFD1` | Text, outlines, offset shadows |
| `--muted` | `#4A5130` | `#B3C48A` | Secondary text, captions |
| `--line` | `#111111` | `#F1FFD1` | Borders (Neo Pop outlines are always ink) |
| `--subtle` | `#F2F5EA` | `#232D10` | Input fills, empty tracks, quiet chip fills |

### Action

| Token | Light | Dark | Use |
|---|---|---|---|
| `--primary` | `#6A3DF0` violet | `#A98BFF` | Primary buttons, links, focus rings, active states |
| `--on-primary` | `#FFFFFF` | `#160A33` | Text on primary |
| `--primary-soft` | `#E7E0FD` | `#2A2440` | Selected backgrounds, XP chip fill |

### Live voice

Use these **only** while the microphone is recording or a Realtime call is connected.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--live` | `#FF2E6E` | `#FF6B98` | Pulsing dot, live border, recording ring |
| `--live-text` | `#D1105A` | `#FF6B98` | "LIVE" label and timer text (meets 4.5:1 on paper) |

### Verdicts

Every verdict is shown as a coloured word (Correct / Almost / Incorrect), never colour alone. The tint is the verdict colour at 15% over `--paper`.

| Token | Light | Dark |
|---|---|---|
| `--correct` | `#138A4C` | `#4FD18A` |
| `--almost` | `#9A6A00` | `#FFD24D` |
| `--incorrect` | `#C8215A` | `#FF7FA3` |

Incorrect is a soft rose, not an alarm red, so that a mistake doesn't feel like a punishment.

### Skills (charts only)

| Skill | Light | Dark |
|---|---|---|
| Fluency | `#6A3DF0` | `#A98BFF` |
| Grammar | `#1F6FEB` | `#6EA8FF` |
| Vocabulary | `#F0711A` | `#FF9A4D` |

### CEFR scale

The scale uses a single violet hue, getting darker from A1 to C2. Use ink text on A1–B1 and `--on-primary` text on B2–C2.

| | A1 | A2 | B1 | B2 | C1 | C2 |
|---|---|---|---|---|---|---|
| Light | `#E7E0FD` | `#CCBDFA` | `#AD94F6` | `#8864F3` | `#6A3DF0` | `#4B2EA2` |
| Dark | `#323433` | `#4B465F` | `#695C92` | `#8D76CE` | `#A98BFF` | `#C2B4EF` |

## Typography

- **Family:** Familjen Grotesk (Google Fonts, weights 400 and 700), falling back to `system-ui, sans-serif`. It's used for display and body text alike, so the outlines and type read as one voice.
- **Numbers:** `font-variant-numeric: tabular-nums` on XP, Streak, timers, scores and anything else that lines up.
- **Scale** (1.25 ratio, base 17px):

| Token | Size | Line height | Weight | Use |
|---|---|---|---|---|
| `--text-xs` | 13px | 1.4 | 700, uppercase, +0.08em | Labels like "LIVE" and "STEP 4 OF ~7" |
| `--text-sm` | 15px | 1.5 | 400 | Captions, explanations |
| `--text-base` | 17px | 1.6 | 400 | Body and answers |
| `--text-lg` | 21px | 1.35 | 700 | Step questions, card titles |
| `--text-xl` | 27px | 1.2 | 700 | Section headings |
| `--text-2xl` | 34px | 1.1 | 700 | Page titles |
| `--text-hero` | 54px | 1.0 | 700 | Streak and XP numbers, CEFR reveal |

Headings use `text-wrap: balance`. Running text has `max-width: 65ch`.

## Shape, space and depth

| Token | Value | Use |
|---|---|---|
| `--border` | `2px solid var(--line)` | Every card, button, input and chip on a loud surface |
| `--radius` | `12px` | Cards, buttons, inputs |
| `--radius-sm` | `8px` | CEFR cells, small tags |
| `--radius-pill` | `999px` | Chips, verdict tags |
| `--shadow-pop` | `5px 5px 0 var(--ink)` | Cards on loud surfaces |
| `--shadow-press` | `3px 3px 0 var(--ink)` | Buttons, everywhere |
| Spacing | 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 px | Use `gap` on flex and grid, not margins between siblings |

On **quiet** surfaces, cards keep the 2px outline but drop `--shadow-pop`. Buttons keep `--shadow-press` everywhere, because the offset shadow is what makes them look pressable.

## Motion

- **Button press:** on `:active`, translate by `(3px, 3px)` and set the shadow to 0, over 80ms. It feels like a physical key.
- **Live dot:** a pulse ring every 1.6s while live.
- **Celebrations:** a single burst for a finished Lesson, a Streak milestone or a new CEFR Level, under 1.2s. These happen only on loud surfaces, never during practice.
- **Reduced motion:** `prefers-reduced-motion: reduce` turns off the pulse, the celebrations and the press translate.

## Components

| Component | Spec |
|---|---|
| **App bar** | The "Impromptu" wordmark (700, `--text-lg`). Streak and XP chips on the right: paper fill, ink outline, violet number. |
| **Primary button** | Violet fill, `--on-primary` text, ink outline, `--shadow-press`, minimum height 44px. |
| **Secondary button** | Paper fill, ink text and outline, `--shadow-press`. |
| **Input / answer box** | `--subtle` fill, ink outline, `--radius`. Focus: a 3px violet ring outside the outline. |
| **Chip** | A pill, ink outline, paper or `--primary-soft` fill. |
| **Verdict tag** | A pill with the verdict tint as fill and the verdict colour for the text, which is the word itself. |
| **Feedback panel** | A verdict-tint background. It shows the verdict word, the corrected sentence in bold, a one-sentence explanation, and a "Hear it" secondary button followed by a "Next step" primary button. |
| **Live bar** | A 2px `--live` border with a pulsing dot, then the "LIVE" label in `--live-text`, then the Roleplay kind and tone, then the remaining daily minutes (tabular), then a secondary "End" button. It sits at the top of the Roleplay screen. |
| **Recording button (speakPrompt)** | A large round button, 72px. Idle: violet. Recording: a `--live` ring pulsing, a waveform and a timer counting toward the 30–90s target. |
| **Skill bar** | An 8px track in `--subtle`, filled with the skill colour. The label sits on the left; the score and CEFR Level on the right (tabular). |
| **CEFR scale** | Six cells from the CEFR scale above. The current Level has a 2px ink outline offset by 1px. |
| **Streak card** | On a loud surface: the number in `--text-hero`, a "day streak" label and a `--shadow-pop` card. It's the screen people screenshot, so it should look good cropped square. |

### Step types (quiet surface)

Every Step shows the same header: an uppercase `--text-xs` label ("REWRITE · STEP 4 OF ~7") and the question in `--text-lg`. After that:

- **vocabCard:** a card with the word in `--text-xl`, a "Hear it" button, the meaning and an example sentence. Below it, an answer box (or the recording button) for "Use it in your own sentence".
- **fillGap:** the sentence with the gap shown as an underlined slot. Choices appear as large outlined chips, or as a single input if there are no choices.
- **rewrite:** the original sentence quoted in a `--subtle` panel, then an answer box.
- **speakPrompt:** the question, the target length ("Aim for 30–90 seconds") and the recording button, with "Type instead" as a text link.
- **roleplayTurn:** no card chrome, just the interviewer's line as speech text, with the live bar fixed at the top. Nothing is graded on screen until the Debrief.

## Theming and implementation

Styling is **token-only**:

- **Tailwind v4 runs only on our tokens.** The default theme is wiped (`@theme { --*: initial }`). `bg-primary` and `p-4` work; `bg-blue-500` and arbitrary values like `bg-[#fff]` don't exist.
- **Screens never style anything themselves.** They assemble components from the UI package, and utility classes appear only inside that package. A lint rule enforces both rules.
- **Base UI provides behaviour and accessibility** for interactive parts (Dialog, Popover, Select, Tabs, Toast and so on), styled with our tokens. shadcn/ui is not used. Simple elements such as Button and Card are plain elements styled with tokens.
- **Icons** are Phosphor at Bold weight, coloured with tokens.
- **Every component lives in the shared `@impromptu/ui` package** (`packages/ui`), including the domain components (Step cards, the live bar, the Debrief, the Streak card), so any future app can reuse them. The package is app-agnostic: no router imports, no data fetching and no app state. Data goes in through props and events come out through callbacks. Tokens are exported as `@impromptu/ui/tokens.css`, so apps that don't use React can use them too.

Tokens are defined once as CSS variables, and the surface is switched with a class. This sketch shows the idea; the final token architecture is decided on the UI map:

```css
:root {
  --brand:#C6F432; --paper:#FFFFFF; --ink:#111111; --muted:#4A5130; --subtle:#F2F5EA;
  --primary:#6A3DF0; --on-primary:#FFFFFF; --primary-soft:#E7E0FD;
  --live:#FF2E6E; --live-text:#D1105A;
  --correct:#138A4C; --almost:#9A6A00; --incorrect:#C8215A;
  --background:var(--paper);
}
/* dark values go in both blocks so the theme toggle wins in either direction */
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { /* dark values */ color-scheme: dark } }
:root[data-theme="dark"] { /* same dark values */ color-scheme: dark }

.surface-loud { --background: var(--brand); }   /* home, Roadmap, Streak, Report reveal */
.surface-quiet { --background: var(--paper); }  /* Lesson player, Roleplay, Debrief */
```

- **Theme:** follows the system setting by default, with a Light / Dark / System toggle that sets `data-theme` on `<html>`.
- **Layout:** design for phones first. The Lesson player is a single column at any width, with a maximum content width of 640px. Side gutters are at least 16px.
- **Accessibility:** touch targets are at least 44px; focus is always visible (a violet ring); body text meets 4.5:1 contrast and large text 3:1; verdicts and live state always carry words, not only colour.
