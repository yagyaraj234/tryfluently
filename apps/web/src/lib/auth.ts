import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/** Better Auth on the web origin; `/api/auth/*` passes through to the API. Use it in the browser only. */
export const authClient = createAuthClient({
  baseURL: globalThis.location?.origin,
  plugins: [inferAdditionalFields({ user: { timezone: { type: "string", required: false } } })],
});

/** Email sign-up, sending the browser's timezone so the Streak and daily caps follow the Learner's day. */
export const signUp = (fields: { name: string; email: string; password: string }) =>
  authClient.signUp.email({ ...fields, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });

/** Google sign-in and sign-up. Back on `/sign-in?error=…` if it fails. */
export const signInWithGoogle = () =>
  authClient.signIn.social({
    provider: "google",
    callbackURL: "/home",
    errorCallbackURL: "/sign-in",
    additionalData: { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
  });
