import assert from "node:assert/strict";
import { test } from "node:test";
import { minutesLeft, resetsOn, voiceTime } from "../src/lib/voiceMinutes.ts";

test("renewal uses the server's UTC boundary, including the year", () => {
  assert.equal(resetsOn("2027-01-01T00:00:00.000Z"), "January 1, 2027 at 00:00 UTC");
  assert.equal(voiceTime(600), "10:00");
  assert.equal(voiceTime(45), "0:45");
  assert.equal(voiceTime(-1), "0:00");
});

// The API's count includes a live call up to the moment it answers; between polls the browser counts down itself.
test("during a call the minutes left count down from the last poll, and not while still connecting", () => {
  const poll = { remainingSeconds: 600, fetchedAt: 1_000_000 };
  assert.equal(minutesLeft(poll, undefined, 1_030_000), 600_000, "not live yet");
  assert.equal(minutesLeft(poll, 1_010_000, 1_030_000), 580_000, "live 20s after the poll");
  assert.equal(minutesLeft(poll, 990_000, 1_030_000), 570_000, "live before the poll, which counted up to then");
});

test("a renewed monthly allowance cannot extend a live call past its server deadline", () => {
  const poll = { remainingSeconds: 540, fetchedAt: 1_000_000, callEndsAt: new Date(1_120_000).toISOString() };
  assert.equal(minutesLeft(poll, 990_000, 1_030_000), 90_000);
});
