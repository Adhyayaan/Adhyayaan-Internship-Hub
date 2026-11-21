import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { assessmentAttempts, db, learners } from "@workspace/db";
import {
  GetAssessmentResponse, GetLearningReportParams, GetLearningReportResponse, SaveAssessmentAnswerBody,
  SaveAssessmentAnswerParams, SaveAssessmentAnswerResponse, StartAssessmentResponse, SubmitAssessmentParams, SubmitAssessmentResponse,
} from "@workspace/api-zod";
import { requireLearner } from "../lib/auth";
import { currentAssessment, questionnaire, scoreAssessment, validChoice } from "../lib/assessment-score";
import { draftView, reportSummaries, savedReport } from "../lib/assessment";

const router: IRouter = Router();
const openDraft = (userId: string) => and(eq(assessmentAttempts.userId, userId), isNull(assessmentAttempts.completedAt));
const owned = (userId: string, id: string) => and(eq(assessmentAttempts.userId, userId), eq(assessmentAttempts.id, id));

router.use("/assessment", requireLearner);

router.get("/assessment", async (req, res): Promise<void> => {
  const userId = req.learner!.id;
  const [[draft], reports] = await Promise.all([
    db.select().from(assessmentAttempts).where(openDraft(userId)).limit(1),
    reportSummaries(userId),
  ]);
  const bank = draft ? questionnaire(draft.version) : currentAssessment;
  res.json(GetAssessmentResponse.parse({ version: bank.version, sections: bank.sections, draft: draft ? draftView(draft) : null, reports }));
});

router.post("/assessment/attempts", async (req, res): Promise<void> => {
  const userId = req.learner!.id;
  const draft = await db.transaction(async (tx) => {
    // Starting and submitting take the same learner lock before any attempt lock.
    await tx.select({ id: learners.id }).from(learners).where(eq(learners.id, userId)).for("update");
    const [open] = await tx.select().from(assessmentAttempts).where(openDraft(userId)).limit(1);
    if (open) return open;
    const [created] = await tx.insert(assessmentAttempts).values({ id: randomUUID(), userId, version: currentAssessment.version }).returning();
    return created!;
  });
  res.json(StartAssessmentResponse.parse(draftView(draft)));
});

router.patch("/assessment/attempts/:id", async (req, res): Promise<void> => {
  const params = SaveAssessmentAnswerParams.safeParse(req.params);
  const input = SaveAssessmentAnswerBody.safeParse(req.body);
  if (!params.success || !input.success) { res.status(400).json({ error: "Choose an answer from the list." }); return; }
  const where = owned(req.learner!.id, params.data.id);
  const result = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(assessmentAttempts).where(where).for("update");
    if (!row) return { status: 404 as const, error: "Assessment not found." };
    if (row.completedAt) return { status: 409 as const, error: "You have already submitted this assessment." };
    if (!validChoice(row.version, input.data)) return { status: 400 as const, error: "Choose an answer from the list." };
    const answers = row.answers.filter(a => a.questionId !== input.data.questionId);
    const [saved] = await tx.update(assessmentAttempts).set({ answers: [...answers, input.data], updatedAt: new Date() }).where(where).returning();
    return { status: 200 as const, draft: draftView(saved!) };
  });
  if (result.status !== 200) { res.status(result.status).json({ error: result.error }); return; }
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
    if (!row) return { status: 404 as const, error: "Assessment not found." };
    if (row.completedAt) return { status: 200 as const, report: SubmitAssessmentResponse.parse(row.report) };
    const completedAt = new Date();
    const scored = scoreAssessment(row.id, row.version, completedAt, row.answers);
    if (!scored) return { status: 400 as const, error: "Answer all questions before you submit." };
    const report = SubmitAssessmentResponse.parse(scored);
    await tx.update(assessmentAttempts).set({ report, completedAt, updatedAt: completedAt }).where(where);
    await tx.update(learners).set({ assessmentCompletedAt: completedAt }).where(eq(learners.id, userId));
    return { status: 200 as const, report };
  });
  if (result.status !== 200) { res.status(result.status).json({ error: result.error }); return; }
  res.json(result.report);
});

router.get("/assessment/reports/:id", async (req, res): Promise<void> => {
  const params = GetLearningReportParams.safeParse(req.params);
  const report = params.success ? await savedReport(req.learner!.id, params.data.id) : null;
  if (!report) { res.status(404).json({ error: "Report not found." }); return; }
  res.json(report);
});

export default router;
