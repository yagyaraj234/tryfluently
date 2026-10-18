import { Card } from "./Card";
import { Heading } from "./Heading";
import { Stack } from "./Stack";
import { Text } from "./Text";

const colors = [
  "brand", "paper", "surface", "ink", "muted", "line", "subtle", "scrim", "primary", "on-primary", "primary-soft",
  "live", "live-text", "correct", "correct-tint", "almost", "almost-tint", "incorrect", "incorrect-tint",
  "skill-fluency", "skill-grammar", "skill-vocabulary", "cefr-a1", "cefr-a2", "cefr-b1", "cefr-b2", "cefr-c1", "cefr-c2",
] as const;
const spaces = [1, 2, 3, 4, 5, 6, 8, 10, 14];

/** Live token samples for the Design System guide. Values resolve from the current theme and surface. */
export function TokenReference() {
  return (
    <Stack gap={8}>
      <section aria-label="Colour tokens">
        <Heading level={2}>Colour tokens</Heading>
        <dl className="grid grid-cols-1 gap-4 desktop:grid-cols-3">
          {colors.map((name) => (
            <div key={name} className="flex items-center gap-3 rounded-md border-2 border-line bg-paper p-3">
              <dt className="flex-1 break-words text-caption text-ink">{`--${name}`}</dt>
              <dd>
                <span aria-hidden className="block size-10 rounded-sm border-2 border-line" style={{ backgroundColor: `var(--${name})` }} />
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <section aria-label="Spacing tokens">
        <Heading level={2}>Spacing</Heading>
        <Stack gap={3}>
          {spaces.map((step) => (
            <div key={step} className="flex items-center gap-4">
              <Text size="caption">{`--space-${step} · ${step * 4}px`}</Text>
              <span aria-hidden className="block h-3 bg-primary" style={{ width: `var(--space-${step})` }} />
            </div>
          ))}
        </Stack>
      </section>
      <section aria-label="Shape and depth tokens">
        <Heading level={2}>Shape and depth</Heading>
        <div className="grid grid-cols-1 gap-6 desktop:grid-cols-3">
          {(["sm", "md", "pill"] as const).map((radius) => (
            <div key={radius} className="border-2 border-line bg-paper p-5 text-ink" style={{ borderRadius: `var(--radius-${radius})` }}>
              <Text>{`--radius-${radius}`}</Text>
            </div>
          ))}
          <div className="rounded-md border-2 border-line bg-paper p-5 text-ink shadow-pop"><Text>shadow-pop · 5px</Text></div>
          <div className="rounded-md border-2 border-line bg-paper p-5 text-ink shadow-press"><Text>shadow-press · 3px</Text></div>
          <Card><Text>shadow-card · follows surface</Text></Card>
        </div>
      </section>
    </Stack>
  );
}
