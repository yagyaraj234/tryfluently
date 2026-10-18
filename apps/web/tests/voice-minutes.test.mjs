import assert from "node:assert/strict";
import { test } from "node:test";
import { minutesLeft, resetsIn } from "../src/lib/voiceMinutes.ts";

// Today's voice minutes come back at local midnight.
test("the voice minutes reset at the next local midnight, said in hours or, under an hour, minutes", () => {
  assert.equal(resetsIn(new Date(2026, 9, 16, 18, 40)), "in 5 hours");
  assert.equal(resetsIn(new Date(2026, 9, 16, 23, 10)), "in 50 minutes");
  assert.equal(resetsIn(new Date(2026, 9, 16, 23, 59, 30)), "in 1 minute");
});

// The API's count includes a live call up to the moment it answers; between polls the browser counts down itself.
test("during a call the minutes left count down from the last poll, and not while still connecting", () => {
  const poll = { remainingSeconds: 600, fetchedAt: 1_000_000 };
  assert.equal(minutesLeft(poll, undefined, 1_030_000), 600_000, "not live yet");
  assert.equal(minutesLeft(poll, 1_010_000, 1_030_000), 580_000, "live 20s after the poll");
  assert.equal(minutesLeft(poll, 990_000, 1_030_000), 570_000, "live before the poll, which counted up to then");
});
