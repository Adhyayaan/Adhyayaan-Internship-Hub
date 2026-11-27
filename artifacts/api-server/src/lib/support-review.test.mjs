import test from "node:test";
import assert from "node:assert/strict";
import { supportReviewSignals } from "./support-review.ts";

const review = (overrides = {}) => supportReviewSignals({
  courseStatus: "in_progress",
  paceStatus: "on_track",
  deltaDays: 0,
  studyChecks: 0,
  secureChecks: 0,
  ...overrides,
});

test("requires a full week behind before the pace signal triggers", () => {
  assert.equal(review({ paceStatus: "behind", deltaDays: -6.9 }).pace.triggered, false);
  assert.equal(review({ paceStatus: "behind", deltaDays: -7 }).pace.triggered, true);
});

test("repeated learning checks trigger only when fewer than half are secure", () => {
  const flagged = review({ studyChecks: 3, secureChecks: 1 });
  assert.equal(flagged.learningChecks.eligible, true);
  assert.equal(flagged.learningChecks.triggered, true);
  assert.equal(flagged.needsSupportReview, true);

  const halfSecure = review({ studyChecks: 4, secureChecks: 2 });
  assert.equal(halfSecure.learningChecks.triggered, false);
  assert.equal(halfSecure.needsSupportReview, false);
});

test("missing or too few learning checks do not trigger a learning signal", () => {
  const result = review({ studyChecks: 2, secureChecks: 0 });
  assert.equal(result.learningChecks.eligible, false);
  assert.equal(result.learningChecks.securePercent, 0);
  assert.equal(result.learningChecks.triggered, false);
  assert.equal(result.needsSupportReview, false);
});

test("one signal is enough for a human review prompt and reasons stay separate", () => {
  const result = review({
    paceStatus: "behind",
    deltaDays: -9,
    studyChecks: 3,
    secureChecks: 1,
  });
  assert.equal(result.needsSupportReview, true);
  assert.equal(result.reasons.length, 2);
});

test("completed courses are not flagged by stale pace or study evidence", () => {
  const result = review({
    courseStatus: "completed",
    paceStatus: "behind",
    deltaDays: -20,
    studyChecks: 5,
    secureChecks: 0,
  });
  assert.equal(result.needsSupportReview, false);
  assert.equal(result.pace.triggered, false);
  assert.equal(result.learningChecks.triggered, false);
});
