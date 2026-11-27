import assert from "node:assert/strict";
import test from "node:test";
import { chooseGuideCandidate } from "./guide-selection.ts";

const guide = (userId, overrides = {}) => ({
  userId,
  supportedCourseIds: ["01"],
  availableForAssignments: true,
  lastAssignedAt: null,
  activeLearners: 0,
  ...overrides,
});

test("selects the eligible guide with the fewest active learners", () => {
  const selected = chooseGuideCandidate([
    guide("guide-a", { activeLearners: 4 }),
    guide("guide-b", { activeLearners: 2 }),
    guide("guide-c", { activeLearners: 3 }),
  ], "01");
  assert.equal(selected?.userId, "guide-b");
});

test("uses the least-recent assignment and a stable id for ties", () => {
  const selected = chooseGuideCandidate([
    guide("guide-b", { activeLearners: 2, lastAssignedAt: new Date("2026-11-27T10:02:00Z") }),
    guide("guide-c", { activeLearners: 2, lastAssignedAt: new Date("2026-11-27T10:01:00Z") }),
    guide("guide-a", { activeLearners: 2, lastAssignedAt: new Date("2026-11-27T10:01:00Z") }),
  ], "01");
  assert.equal(selected?.userId, "guide-a");
});

test("does not assign an unavailable or out-of-coverage guide", () => {
  const selected = chooseGuideCandidate([
    guide("unavailable", { availableForAssignments: false }),
    guide("wrong-course", { supportedCourseIds: ["02"] }),
  ], "01");
  assert.equal(selected, null);
});
