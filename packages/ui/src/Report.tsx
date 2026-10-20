import { Check } from "@phosphor-icons/react";
import { Card } from "./Card";
import { Heading } from "./Heading";
import { Text } from "./Text";

export type ReportStrengthsProps = {
  strengths: string[];
};

export function ReportStrengths({ strengths }: ReportStrengthsProps) {
  return (
    <ul className="flex flex-col gap-3">
      {strengths.map((s) => (
        <li key={s} className="flex items-start gap-3 text-body text-ink">
          <Check aria-hidden className="mt-1 shrink-0 text-correct" />
          {s}
        </li>
      ))}
    </ul>
  );
}

export type ReportWeaknessProps = {
  label: string;
  quote: string;
  betterVersion: string;
};

export function ReportWeakness({ label, quote, betterVersion }: ReportWeaknessProps) {
  return (
    <Card>
      <div className="flex flex-col gap-3">
        <Heading level={3}>{label}</Heading>
        <Text size="label" tone="muted">
          You said
        </Text>
        <blockquote className="rounded-xl bg-subtle px-4 py-3 text-body text-ink">{quote}</blockquote>
        <Text size="label" tone="muted">
          Better
        </Text>
        <p className="text-body font-bold text-ink">{betterVersion}</p>
      </div>
    </Card>
  );
}
