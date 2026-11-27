import { and, eq, isNotNull, ne } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db, enrollments, internshipGuides, learners } from "@workspace/db";
import { chooseGuideCandidate } from "./guide-selection";

type GuideAssignmentTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function lockGuideAssignmentPool(tx: GuideAssignmentTx): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('adhyayaan-guide-assignment')::bigint)`);
}

export async function assignNextGuide(tx: GuideAssignmentTx, courseId: string, alreadyLocked = false): Promise<string | null> {
  if (!alreadyLocked) await lockGuideAssignmentPool(tx);

  const [guides, assignments] = await Promise.all([
    tx.select({
      userId: internshipGuides.userId,
      supportedCourseIds: internshipGuides.supportedCourseIds,
      availableForAssignments: internshipGuides.availableForAssignments,
      lastAssignedAt: internshipGuides.lastAssignedAt,
    })
      .from(internshipGuides)
      .innerJoin(learners, eq(learners.id, internshipGuides.userId))
      .where(eq(learners.role, "guide")),
    tx.select({ guideId: enrollments.guideId, learnerId: enrollments.userId })
      .from(enrollments)
      .where(and(isNotNull(enrollments.guideId), ne(enrollments.status, "completed"))),
  ]);

  const activeLearners = new Map<string, Set<string>>();
  for (const assignment of assignments) {
    if (!assignment.guideId) continue;
    const learnersForGuide = activeLearners.get(assignment.guideId) ?? new Set<string>();
    learnersForGuide.add(assignment.learnerId);
    activeLearners.set(assignment.guideId, learnersForGuide);
  }

  const candidate = chooseGuideCandidate(guides.map((guide) => ({
    ...guide,
    supportedCourseIds: Array.isArray(guide.supportedCourseIds) ? guide.supportedCourseIds : [],
    activeLearners: activeLearners.get(guide.userId)?.size ?? 0,
  })), courseId);
  if (!candidate) return null;

  await tx.update(internshipGuides)
    .set({ lastAssignedAt: new Date() })
    .where(eq(internshipGuides.userId, candidate.userId));
  return candidate.userId;
}
