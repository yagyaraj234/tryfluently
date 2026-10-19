import { expect, spyOn, test } from "bun:test";
import { resendMailer } from "../src/mailer";

test("Report retries pass the provider idempotency key without changing the email payload", async () => {
  const requests: RequestInit[] = [];
  const fetch = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        requests.push(init!);
        return new Response("{}", { status: 200 });
      },
      { preconnect: () => {} },
    ),
  );
  try {
    const mailer = resendMailer("synthetic-key", "coach@example.com");
    const email = { to: "learner@example.com", subject: "Your Report", html: "<p>Ready</p>" };
    await mailer.send(email, "assessment-report/test");
    await mailer.send(email);
    expect(new Headers(requests[0]!.headers).get("Idempotency-Key")).toBe("assessment-report/test");
    expect(new Headers(requests[1]!.headers).has("Idempotency-Key")).toBe(false);
    expect(JSON.parse(requests[0]!.body as string)).toEqual({ from: "coach@example.com", ...email });
  } finally {
    fetch.mockRestore();
  }
});
