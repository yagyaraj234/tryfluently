import { ChoiceChips } from "@fluently/ui";
import { useRouter } from "@tanstack/react-router";
import { saveTheme, type Theme } from "../../lib/theme";
import { themes } from "./shared";

export function ThemeChips({ theme }: { theme: string | undefined }) {
  const router = useRouter();

  async function pickTheme(value: string) {
    saveTheme(value as Theme);
    await router.invalidate();
  }

  return (
    <ChoiceChips
      layout="segmented"
      label="Preview theme"
      options={themes}
      value={theme ?? "system"}
      onValueChange={pickTheme}
    />
  );
}
