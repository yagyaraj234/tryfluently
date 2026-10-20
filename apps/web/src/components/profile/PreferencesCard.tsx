import { Card, ChoiceChips, Heading, Stack } from "@fluently/ui";
import { useRouter } from "@tanstack/react-router";
import { saveTheme, type Theme } from "../../lib/theme";
import { TimezoneSelect } from "./TimezoneSelect";

const themes: { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export function PreferencesCard({ theme, timezone }: { theme: string | undefined; timezone: string }) {
  const router = useRouter();

  function pickTheme(value: string) {
    saveTheme(value as Theme);
    return router.invalidate();
  }

  return (
    <Card>
      <Stack gap={6}>
        <Heading level={2} size="title">
          Preferences
        </Heading>
        <ChoiceChips
          label="Theme"
          layout="segmented"
          options={themes}
          value={theme ?? "system"}
          onValueChange={pickTheme}
        />
        <TimezoneSelect saved={timezone} />
      </Stack>
    </Card>
  );
}
