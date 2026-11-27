export type GuideCandidate = {
  userId: string;
  supportedCourseIds: string[];
  availableForAssignments: boolean;
  lastAssignedAt: Date | null;
  activeLearners: number;
};

export function chooseGuideCandidate(guides: GuideCandidate[], courseId: string): GuideCandidate | null {
  const eligible = guides.filter((guide) =>
    guide.availableForAssignments && guide.supportedCourseIds.includes(courseId),
  );
  eligible.sort((left, right) =>
    left.activeLearners - right.activeLearners
    || (left.lastAssignedAt?.getTime() ?? Number.NEGATIVE_INFINITY) - (right.lastAssignedAt?.getTime() ?? Number.NEGATIVE_INFINITY)
    || left.userId.localeCompare(right.userId),
  );
  return eligible[0] ?? null;
}
