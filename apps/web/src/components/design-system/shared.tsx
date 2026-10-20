import { Card, Heading, Stack, toastManager } from "@fluently/ui";
import type { ReactNode } from "react";

export const themes = ["Light", "Dark", "System"].map((label) => ({ label, value: label.toLowerCase() }));
export const sample = () =>
  toastManager.add({ title: "Preview action", description: "This guide uses example content." });
export const answered = (answer: string) => toastManager.add({ title: "Answer received", description: answer });

export function Example({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card render={<section />}>
      <Stack gap={5}>
        <Heading level={2}>{title}</Heading>
        {children}
      </Stack>
    </Card>
  );
}
