import { createFileRoute } from "@tanstack/react-router";
import { apiUrl } from "../../api";

// The browser only ever talks to the web origin, so Better Auth cookies are first-party.
async function passThrough({ request }: { request: Request }) {
  const { pathname, search } = new URL(request.url);
  const headers = new Headers(request.headers);
  headers.delete("host");
  const response = await fetch(new URL(pathname + search, apiUrl()), {
    method: request.method,
    headers,
    body: request.body,
    // @ts-expect-error Node needs `duplex` to send a streamed body; it's missing from the DOM types.
    duplex: "half",
    redirect: "manual",
  });
  // fetch already decoded the body, so its encoding and length no longer apply.
  const out = new Headers(response.headers);
  out.delete("content-encoding");
  out.delete("content-length");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: out });
}

export const Route = createFileRoute("/api/$")({
  server: { handlers: { ANY: passThrough } },
});
