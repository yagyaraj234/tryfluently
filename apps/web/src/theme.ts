import { createIsomorphicFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";

/** Light / Dark / System. System is the absence of the cookie (or any other value). */
export type Theme = "light" | "dark" | "system";
export const themeCookie = "theme";

const parse = (value: string | undefined) => (value === "light" || value === "dark" ? value : undefined);

/** The `data-theme` for `<html>`: read from the cookie while server rendering, so the first paint has no flash. */
export const dataTheme = createIsomorphicFn()
  .server(() => parse(getCookie(themeCookie)))
  .client(() => parse(document.cookie.match(/(?:^|; )theme=([^;]*)/)?.[1]));

/** Saves the theme for a year (System clears the cookie). Call `router.invalidate()` after, so `<html>` picks it up. */
export function saveTheme(theme: Theme) {
  document.cookie =
    theme === "system" ? `${themeCookie}=; path=/; max-age=0` : `${themeCookie}=${theme}; path=/; max-age=31536000; samesite=lax`;
}
