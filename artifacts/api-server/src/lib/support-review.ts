export const SUPPORT_PACE_THRESHOLD_DAYS = 7;
export const SUPPORT_MIN_STUDY_CHECKS = 3;
export const SUPPORT_REQUIRED_SECURE_PERCENT = 50;

export function supportReviewSignals({
  courseStatus,
  paceStatus,
  deltaDays,
  studyChecks,
  secureChecks,
}: {
  courseStatus: string;
  paceStatus: "ahead" | "on_track" | "behind" | "complete";
  deltaDays: number;
  studyChecks: number;
  secureChecks: number;
}) {
  const active = courseStatus !== "completed" && paceStatus !== "complete";
  const paceTriggered = active
    && paceStatus === "behind"
    && deltaDays <= -SUPPORT_PACE_THRESHOLD_DAYS;
  const count = Math.max(0, Math.trunc(studyChecks));
  const secureCount = Math.max(0, Math.min(count, Math.trunc(secureChecks)));
  const nonSecureCount = count - secureCount;
  const eligible = count >= SUPPORT_MIN_STUDY_CHECKS;
  const securePercent = count > 0 ? Math.round(secureCount / count * 100) : null;
  const learningTriggered = active
    && eligible
    && securePercent !== null
    && securePercent < SUPPORT_REQUIRED_SECURE_PERCENT;
  const reasons: string[] = [];

  if (paceTriggered) {
    reasons.push(`Course pace is ${Math.abs(deltaDays).toFixed(1)} days behind the target.`);
  }
  if (learningTriggered) {
    reasons.push(`Only ${securePercent}% of recorded study checks were secure.`);
  }

  return {
    pace: {
      status: paceStatus,
      deltaDays,
      thresholdDays: SUPPORT_PACE_THRESHOLD_DAYS,
      triggered: paceTriggered,
    },
    learningChecks: {
      count,
      secureCount,
      nonSecureCount,
      minimumChecks: SUPPORT_MIN_STUDY_CHECKS,
      securePercent,
      requiredSecurePercent: SUPPORT_REQUIRED_SECURE_PERCENT,
      eligible,
      triggered: learningTriggered,
    },
    needsSupportReview: reasons.length > 0,
    reasons,
  };
}
