import { Card } from "./Card";
import { Heading } from "./Heading";
import { Stack } from "./Stack";
import { Text } from "./Text";

// Full class names, so Tailwind finds them when it scans this file.
const colors = {
  canvas: "bg-canvas",
  paper: "bg-paper",
  subtle: "bg-subtle",
  ink: "bg-ink",
  muted: "bg-muted",
  line: "bg-line",
  "line-strong": "bg-line-strong",
  scrim: "bg-scrim",
  primary: "bg-primary",
  "on-primary": "bg-on-primary",
  "primary-soft": "bg-primary-soft",
  brand: "bg-brand",
  "brand-hi": "bg-brand-hi",
  live: "bg-live",
  "live-text": "bg-live-text",
  correct: "bg-correct",
  "correct-tint": "bg-correct-tint",
  almost: "bg-almost",
  "almost-tint": "bg-almost-tint",
  incorrect: "bg-incorrect",
  "incorrect-tint": "bg-incorrect-tint",
  "skill-fluency": "bg-skill-fluency",
  "skill-grammar": "bg-skill-grammar",
  "skill-vocabulary": "bg-skill-vocabulary",
  "cefr-a1": "bg-cefr-a1",
  "cefr-a2": "bg-cefr-a2",
  "cefr-b1": "bg-cefr-b1",
  "cefr-b2": "bg-cefr-b2",
  "cefr-c1": "bg-cefr-c1",
  "cefr-c2": "bg-cefr-c2",
};
const spaces = { 1: "w-1", 2: "w-2", 3: "w-3", 4: "w-4", 6: "w-6", 8: "w-8", 10: "w-10", 14: "w-14" };
const radii = { lg: "rounded-lg", xl: "rounded-xl", "3xl": "rounded-3xl", full: "rounded-full" };

/** Live token samples for the Design System guide. Values resolve from the current theme. */
export function TokenReference() {
  return (
    <Stack gap={8}>
      <section aria-label="Colour tokens">
        <Heading level={2}>Colour tokens</Heading>
        <dl className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {Object.entries(colors).map(([name, swatch]) => (
            <div key={name} className="flex items-center gap-3 rounded-xl border border-line bg-paper p-3">
              <dt className="flex-1 text-caption break-words text-ink">{`--color-${name}`}</dt>
              <dd>
                <span aria-hidden className={`block size-10 rounded-lg border border-line ${swatch}`} />
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <section aria-label="Spacing">
        <Heading level={2}>Spacing</Heading>
        <Stack gap={3}>
          {Object.entries(spaces).map(([step, width]) => (
            <div key={step} className="flex items-center gap-4">
              <Text size="caption">{`${step} · ${Number(step) * 4}px`}</Text>
              <span aria-hidden className={`block h-3 bg-primary ${width}`} />
            </div>
          ))}
        </Stack>
      </section>
      <section aria-label="Shape and depth tokens">
        <Heading level={2}>Shape and depth</Heading>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {Object.entries(radii).map(([name, radius]) => (
            <div key={name} className={`border border-line bg-paper p-5 text-ink ${radius}`}>
              <Text>{`rounded-${name}`}</Text>
            </div>
          ))}
          <div className="rounded-3xl border border-line bg-paper p-5 text-ink shadow-lift">
            <Text>shadow-lift · hover</Text>
          </div>
          <Card>
            <Text>shadow-card</Text>
          </Card>
        </div>
      </section>
    </Stack>
  );
}
