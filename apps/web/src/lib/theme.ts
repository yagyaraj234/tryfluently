import { createIsomorphicFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";

/** Light / Dark / System. Light is the default (no cookie); System follows the OS and renders no `data-theme`. */
export type Theme = "light" | "dark" | "system";
export const themeCookie = "theme";

const parse = (value: string | undefined) => (value === "system" ? undefined : value === "dark" ? "dark" : "light");

/** The `data-theme` for `<html>`: read from the cookie while server rendering, so the first paint has no flash. */
export const dataTheme = createIsomorphicFn()
  .server(() => parse(getCookie(themeCookie)))
  .client(() => parse(document.cookie.match(/(?:^|; )theme=([^;]*)/)?.[1]));

/** Saves the theme for a year. Call `router.invalidate()` after, so `<html>` picks it up. */
export function saveTheme(theme: Theme) {
  document.cookie = `${themeCookie}=${theme}; path=/; max-age=31536000; samesite=lax`;
}
