import { createAuthClient } from "better-auth/react";

/** Better Auth on the web origin; `/api/auth/*` passes through to the API. Use it in the browser only. */
export const authClient = createAuthClient({ baseURL: globalThis.location?.origin });
