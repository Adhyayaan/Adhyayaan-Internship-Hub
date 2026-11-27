import test from "node:test";
import assert from "node:assert/strict";
import {
  getMentorshipCounterpartId,
  isAfterMentorshipReadCursor,
} from "./mentorship-notifications.ts";

test("new message notifications go only to the other assigned participant", () => {
  assert.equal(getMentorshipCounterpartId("student-a", "student-a", "guide-a"), "guide-a");
  assert.equal(getMentorshipCounterpartId("guide-a", "student-a", "guide-a"), "student-a");
  assert.equal(getMentorshipCounterpartId("student-a", "student-a", null), null);
  assert.equal(getMentorshipCounterpartId("outsider", "student-a", "guide-a"), null);
});

test("read cursor includes newer messages and later IDs at the same timestamp only", () => {
  const readAt = new Date("2026-01-01T00:00:00.000Z");
  assert.equal(isAfterMentorshipReadCursor(new Date("2026-01-01T00:00:01.000Z"), "a", readAt, "z"), true);
  assert.equal(isAfterMentorshipReadCursor(readAt, "z", readAt, "a"), true);
  assert.equal(isAfterMentorshipReadCursor(readAt, "a", readAt, "z"), false);
  assert.equal(isAfterMentorshipReadCursor(readAt, "a", null, null), true);
});
