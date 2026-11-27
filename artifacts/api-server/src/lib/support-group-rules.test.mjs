import test from "node:test";
import assert from "node:assert/strict";
import { canPostSupportGroupKind, supportGroupAccess } from "./support-group-rules.ts";

const group = { guideId: "guide-1" };

test("only the creating guide or an invited student can access a group", () => {
  assert.deepEqual(supportGroupAccess({ id: "guide-1", role: "guide" }, group, false), {
    allowed: true,
    guide: true,
  });
  assert.deepEqual(supportGroupAccess({ id: "guide-2", role: "guide" }, group, true), {
    allowed: false,
    guide: false,
  });
  assert.deepEqual(supportGroupAccess({ id: "student-1", role: "student" }, group, true), {
    allowed: true,
    guide: false,
  });
  assert.deepEqual(supportGroupAccess({ id: "student-2", role: "student" }, group, false), {
    allowed: false,
    guide: false,
  });
  assert.deepEqual(supportGroupAccess({ id: "admin-1", role: "admin" }, group, true), {
    allowed: false,
    guide: false,
  });
});

test("only guides can create Meet posts and formative questions", () => {
  assert.equal(canPostSupportGroupKind("student", "text"), true);
  assert.equal(canPostSupportGroupKind("guide", "text"), true);
  assert.equal(canPostSupportGroupKind("student", "meeting"), false);
  assert.equal(canPostSupportGroupKind("student", "question"), false);
  assert.equal(canPostSupportGroupKind("guide", "meeting"), true);
  assert.equal(canPostSupportGroupKind("guide", "question"), true);
});
