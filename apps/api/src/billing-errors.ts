import { HTTPException } from "hono/http-exception";

export const billingError = (status: 403 | 409 | 429 | 503, message: string) =>
  new HTTPException(status, { message, res: Response.json({ error: message }, { status }) });
