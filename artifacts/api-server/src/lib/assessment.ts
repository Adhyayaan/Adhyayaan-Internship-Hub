import { GetLearningReportResponse } from "@workspace/api-zod";
import { assessmentAttempts, db, type AssessmentAttempt } from "@workspace/db";
import { and, desc, eq, isNotNull } from "drizzle-orm";

export function draftView(row: AssessmentAttempt) {
  return { id: row.id, version: row.version, answers: row.answers, updatedAt: row.updatedAt.toISOString() };
}

export async function reportSummaries(userId: string) {
  const rows = await db.select({
    id: assessmentAttempts.id, version: assessmentAttempts.version, completedAt: assessmentAttempts.completedAt,
  }).from(assessmentAttempts)
    .where(and(eq(assessmentAttempts.userId, userId), isNotNull(assessmentAttempts.completedAt)))
    .orderBy(desc(assessmentAttempts.completedAt));
  return rows.map(x => ({ ...x, completedAt: x.completedAt!.toISOString() }));
}

export async function savedReport(userId: string, id?: string) {
  const [row] = await db.select({ report: assessmentAttempts.report }).from(assessmentAttempts)
    .where(and(eq(assessmentAttempts.userId, userId), isNotNull(assessmentAttempts.completedAt),
      id ? eq(assessmentAttempts.id, id) : undefined))
    .orderBy(desc(assessmentAttempts.completedAt)).limit(1);
  return row ? GetLearningReportResponse.parse(row.report) : null;
}

export async function teachingSignals(userId: string) {
  const report = await savedReport(userId);
  if (!report) return null;
  const reasoning = report.dimensions.find(x => x.id === "reasoning");
  return { teachingPlan: report.teachingPlan, tryAppliedWarmup: !!reasoning && reasoning.score >= 5 };
}
