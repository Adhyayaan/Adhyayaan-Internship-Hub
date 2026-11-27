import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { assessmentAttempts, db, learners } from "@workspace/db";
import {
  GetAssessmentResponse, GetLearningReportParams, GetLearningReportResponse, SaveAssessmentAnswerBody,
  SaveAssessmentAnswerParams, SaveAssessmentAnswerResponse, StartAssessmentResponse, SubmitAssessmentParams, SubmitAssessmentResponse,
} from "@workspace/api-zod";
import { requireStudent } from "../lib/auth";
import { assessmentPath, assessmentSize, currentVersion, knownQuestion, validOption } from "../lib/assessment-path";
import { scoreAssessment } from "../lib/assessment-score";
import { draftView, latestCompletion, reportSummaries, retakeWait, savedReport } from "../lib/assessment";

const router: IRouter = Router();
const openDraft = (userId: string) => and(eq(assessmentAttempts.userId, userId), isNull(assessmentAttempts.completedAt));
const owned = (userId: string, id: string) => and(eq(assessmentAttempts.userId, userId), eq(assessmentAttempts.id, id));

router.use("/assessment", requireStudent);

router.get("/assessment", async (req, res): Promise<void> => {
  const userId = req.learner!.id;
  const [[draft], reports] = await Promise.all([
    db.select().from(assessmentAttempts).where(openDraft(userId)).limit(1),
    reportSummaries(userId),
  ]);
  const version = draft?.answers.length ? draft.version : currentVersion;
  const wait = retakeWait(reports[0]?.completedAt);
  res.json(GetAssessmentResponse.parse({ version, ...assessmentSize(version),
    draft: draft ? draftView(draft) : null, reports, nextRetakeAt: wait?.nextRetakeAt ?? null }));
});

router.post("/assessment/attempts", async (req, res): Promise<void> => {
  const userId = req.learner!.id;
  const result = await db.transaction(async (tx) => {
    // All mutations take the learner lock before touching an attempt.
    await tx.select({ id: learners.id }).from(learners).where(eq(learners.id, userId)).for("update");
    const wait = retakeWait(await latestCompletion(tx, userId));
    if (wait) return { wait };
    const [open] = await tx.select().from(assessmentAttempts).where(openDraft(userId)).limit(1);
    if (open) {
      if (!open.answers.length && open.version !== currentVersion) {
        const [upgraded] = await tx.update(assessmentAttempts).set({ version: currentVersion, updatedAt: new Date() })
          .where(eq(assessmentAttempts.id, open.id)).returning();
        return { draft: upgraded! };
      }
      return { draft: open };
    }
    const [created] = await tx.insert(assessmentAttempts).values({ id: randomUUID(), userId, version: currentVersion }).returning();
    return { draft: created! };
  });
  if (result.wait) { res.status(429).json(result.wait); return; }
  res.json(StartAssessmentResponse.parse(draftView(result.draft)));
});

router.patch("/assessment/attempts/:id", async (req, res): Promise<void> => {
  const params = SaveAssessmentAnswerParams.safeParse(req.params);
  const input = SaveAssessmentAnswerBody.safeParse(req.body);
  if (!params.success || !input.success) { res.status(400).json({ error: "Choose an answer from the list." }); return; }
  const userId = req.learner!.id;
  const where = owned(userId, params.data.id);
  const { questionId, choice, replaceFollowUps } = input.data;
  const result = await db.transaction(async (tx) => {
    await tx.select({ id: learners.id }).from(learners).where(eq(learners.id, userId)).for("update");
    const [row] = await tx.select().from(assessmentAttempts).where(where).for("update");
    if (!row) return { status: 404 as const, body: { error: "Assessment not found." } };
    if (row.completedAt) return { status: 409 as const, body: { code: "ASSESSMENT_SUBMITTED", error: "You have already submitted this assessment." } };
    const wait = retakeWait(await latestCompletion(tx, userId));
    if (wait) return { status: 429 as const, body: wait };
    const path = assessmentPath(row.version, row.answers);
    const item = path.sections.flatMap(s => s.questions).find(q => q.id === questionId);
    if (!item && knownQuestion(row.version, questionId)) {
      return { status: 409 as const, body: { code: "QUESTION_CHANGED", error: "This question is not on your current path. Reload your saved answers." } };
    }
    if (!item || !validOption(item, choice)) return { status: 400 as const, body: { error: "Choose an answer from the list." } };
    const remaining = path.answers.filter(a => a.questionId !== questionId);
    const next = assessmentPath(row.version, [...remaining, { questionId, choice }]);
    const affectedAnswers = remaining.length + 1 - next.answers.length;
    if (affectedAnswers > 0 && !replaceFollowUps) {
      return { status: 409 as const, body: { code: "FOLLOW_UPS_CHANGED", affectedAnswers,
        error: "This choice changes your follow-up questions. You will need to answer from that point again." } };
    }
    const [saved] = await tx.update(assessmentAttempts).set({ answers: next.answers, updatedAt: new Date() }).where(where).returning();
    return { status: 200 as const, draft: draftView(saved!) };
  });
  if (result.status !== 200) { res.status(result.status).json(result.body); return; }
  res.json(SaveAssessmentAnswerResponse.parse(result.draft));
});

router.post("/assessment/attempts/:id/submit", async (req, res): Promise<void> => {
  const params = SubmitAssessmentParams.safeParse(req.params);
  if (!params.success) { res.status(404).json({ error: "Assessment not found." }); return; }
  const userId = req.learner!.id;
  const where = owned(userId, params.data.id);
  const result = await db.transaction(async (tx) => {
    await tx.select({ id: learners.id }).from(learners).where(eq(learners.id, userId)).for("update");
    const [row] = await tx.select().from(assessmentAttempts).where(where).for("update");
    if (!row) return { status: 404 as const, body: { error: "Assessment not found." } };
    if (row.completedAt) return { status: 200 as const, report: SubmitAssessmentResponse.parse(row.report) };
    const completedAt = new Date();
    const wait = retakeWait(await latestCompletion(tx, userId), completedAt.getTime());
    if (wait) return { status: 429 as const, body: wait };
    const scored = scoreAssessment(row.id, row.version, completedAt, row.answers);
    if (!scored) return { status: 400 as const, body: { error: "Answer all questions before you submit." } };
    const report = SubmitAssessmentResponse.parse(scored);
    await tx.update(assessmentAttempts).set({ report, completedAt, updatedAt: completedAt }).where(where);
    await tx.update(learners).set({ assessmentCompletedAt: completedAt }).where(eq(learners.id, userId));
    return { status: 200 as const, report };
  });
  if (result.status !== 200) { res.status(result.status).json(result.body); return; }
  res.json(result.report);
});

router.get("/assessment/reports/:id", async (req, res): Promise<void> => {
  const params = GetLearningReportParams.safeParse(req.params);
  const report = params.success ? await savedReport(req.learner!.id, params.data.id) : null;
  if (!report) { res.status(404).json({ error: "Report not found." }); return; }
  res.json(report);
});

export default router;
