import { GetLearningReportResponse } from "@workspace/api-zod";
import { assessmentAttempts, db, type AssessmentAttempt } from "@workspace/db";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { assessmentPath } from "./assessment-path";
import { scoreAssessment } from "./assessment-score";

const retakeIntervalMs = 7 * 24 * 60 * 60 * 1000;

export function retakeWait(completedAt: Date | string | null | undefined, now = Date.now()) {
  if (!completedAt) return null;
  const eligibleAt = new Date(completedAt).getTime() + retakeIntervalMs;
  if (eligibleAt <= now) return null;
  return {
    error: "Wait seven days after you submit before you start another assessment.",
    code: "ASSESSMENT_RETAKE_WAIT" as const,
    nextRetakeAt: new Date(eligibleAt).toISOString(),
  };
}

export async function latestCompletion(query: Pick<typeof db, "select">, userId: string) {
  const [row] = await query.select({ completedAt: assessmentAttempts.completedAt }).from(assessmentAttempts)
    .where(and(eq(assessmentAttempts.userId, userId), isNotNull(assessmentAttempts.completedAt)))
    .orderBy(desc(assessmentAttempts.completedAt)).limit(1);
  return row?.completedAt;
}

export function draftView(row: AssessmentAttempt) {
  const path = assessmentPath(row.version, row.answers);
  // Do not send the remaining bank, answer keys, or internal scoring metadata.
  const sections = path.sections.map(({ questions, ...section }) => ({
    ...section, questions: questions.map(({ id, prompt, options }) => ({ id, prompt, options })),
  }));
  return { id: row.id, version: row.version, answers: path.answers, sections, updatedAt: row.updatedAt.toISOString() };
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
  const [row] = await db.select({
    id: assessmentAttempts.id,
    version: assessmentAttempts.version,
    answers: assessmentAttempts.answers,
    completedAt: assessmentAttempts.completedAt,
    report: assessmentAttempts.report,
  }).from(assessmentAttempts)
    .where(and(eq(assessmentAttempts.userId, userId), isNotNull(assessmentAttempts.completedAt),
      id ? eq(assessmentAttempts.id, id) : undefined))
    .orderBy(desc(assessmentAttempts.completedAt)).limit(1);
  if (!row) return null;
  // Add the clearer analysis when a report is opened, including older saved reports.
  // Keep the stored report and original answers unchanged.
  const saved = GetLearningReportResponse.parse(row.report);
  const refreshedAnalysis = row.completedAt
    ? scoreAssessment(row.id, row.version, new Date(saved.completedAt), row.answers)
    : null;
  return GetLearningReportResponse.parse(refreshedAnalysis ?? saved);
}

export async function teachingSignals(userId: string) {
  const report = await savedReport(userId);
  if (!report) return null;
  const reasoning = report.dimensions.find(x => x.id === "reasoning");
  return { teachingPlan: report.teachingPlan, tryAppliedWarmup: !!reasoning && reasoning.score >= 5 };
}
