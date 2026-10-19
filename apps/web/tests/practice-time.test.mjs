import assert from "node:assert/strict";
import { test } from "node:test";
import { practiceTime } from "../src/lib/practice-time.ts";

test("practice preferences remain optional and include weekly hours and completion range in Goal Context", () => {
  assert.deepEqual(practiceTime("", "", ""), { context: "" });
  assert.equal(
    practiceTime("1.5", "4", "8").context,
    "I can spend 1.5 hours per week practising.\n\nI would like to reach my Goal in 4–8 weeks.",
  );
  assert.equal(practiceTime("0.25", "", "").context, "I can spend 0.25 hours per week practising.");
  assert.equal(practiceTime("", "1", "1").context, "I would like to reach my Goal in 1–1 weeks.");
  assert.ok(practiceTime("168", "", "").context);
});

test("invalid hours and incomplete, reversed or fractional week ranges cannot be submitted", () => {
  for (const hours of ["0", "-1", "169", "abc", "Infinity", "0.3"]) assert.ok(practiceTime(hours, "", "").error, hours);
  for (const [min, max] of [
    ["4", ""],
    ["", "8"],
    ["8", "4"],
    ["0", "4"],
    ["1.5", "4"],
    ["1", "Infinity"],
    ["abc", "4"],
  ]) {
    assert.ok(practiceTime("", min, max).error, `${min}–${max}`);
  }
});
