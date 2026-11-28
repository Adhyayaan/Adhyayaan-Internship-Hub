import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import {
  db,
  enrollments,
  guideProjectAssignments,
  guideProjectSubmissionFiles,
  guideProjectSubmissions,
  guideProjectTargets,
  learners,
} from "@workspace/db";
import {
  CreateGuideProjectAssignmentBody,
  CreateGuideProjectAssignmentResponse,
  DownloadProjectAttachmentParams,
  ListGuideProjectsResponse,
  ListStudentProjectAssignmentsResponse,
  RequestStudentProjectUploadBody,
  RequestStudentProjectUploadParams,
  RequestStudentProjectUploadResponse,
  RetryGuideProjectEvaluationParams,
  RetryGuideProjectEvaluationResponse,
  SubmitStudentProjectBody,
  SubmitStudentProjectParams,
  SubmitStudentProjectResponse,
} from "@workspace/api-zod";
import { requireGuide, requireLearner, requireStudent } from "../lib/auth";
import {
  MAX_PROJECT_SUBMISSION_BYTES,
  MAX_PROJECT_SUBMISSION_FILES,
  getProjectFileExtension,
} from "../lib/project-rules";
import {
  createProjectUpload,
  projectObjectFile,
  verifyProjectUploadToken,
  verifyUploadedProjectFile,
} from "../lib/project-storage";
import { evaluateProjectSubmission } from "../lib/project-evaluation";
import { findCourse } from "../lib/catalog";

const router: IRouter = Router();

function attachmentView(file: typeof guideProjectSubmissionFiles.$inferSelect) {
  return {
    id: file.id,
    fileName: file.fileName,
    contentType: file.contentType,
    size: file.size,
    downloadUrl: `/api/projects/attachments/${file.id}`,
    isArchive: getProjectFileExtension(file.fileName) === ".zip",
  };
}

async function latestSubmissionsByTarget(targetIds: string[]) {
  if (!targetIds.length) return new Map<string, {
    submission: typeof guideProjectSubmissions.$inferSelect;
    files: (typeof guideProjectSubmissionFiles.$inferSelect)[];
  }>();
  const staleBefore = new Date(Date.now() - 5 * 60 * 1000);
  await db.update(guideProjectSubmissions).set({
    evaluationStatus: "failed",
    evaluation: null,
    evaluationStartedAt: null,
    evaluatedAt: new Date(),
  }).where(and(
    inArray(guideProjectSubmissions.targetId, targetIds),
    eq(guideProjectSubmissions.evaluationStatus, "pending"),
    lt(guideProjectSubmissions.evaluationStartedAt, staleBefore),
  ));
  const submissions = await db.select().from(guideProjectSubmissions)
    .where(inArray(guideProjectSubmissions.targetId, targetIds))
    .orderBy(desc(guideProjectSubmissions.version), desc(guideProjectSubmissions.submittedAt));
  const latest = new Map<string, typeof guideProjectSubmissions.$inferSelect>();
  for (const submission of submissions) {
    if (!latest.has(submission.targetId)) latest.set(submission.targetId, submission);
  }
  const submissionIds = [...latest.values()].map((submission) => submission.id);
  const files = submissionIds.length
    ? await db.select().from(guideProjectSubmissionFiles)
      .where(inArray(guideProjectSubmissionFiles.submissionId, submissionIds))
      .orderBy(guideProjectSubmissionFiles.createdAt)
    : [];
  const filesBySubmission = new Map<string, typeof files>();
  for (const file of files) {
    const group = filesBySubmission.get(file.submissionId) ?? [];
    group.push(file);
    filesBySubmission.set(file.submissionId, group);
  }
  const result = new Map<string, { submission: typeof guideProjectSubmissions.$inferSelect; files: typeof files }>();
  for (const [targetId, submission] of latest) {
    result.set(targetId, { submission, files: filesBySubmission.get(submission.id) ?? [] });
  }
  return result;
}

function submissionView(
  row: typeof guideProjectSubmissions.$inferSelect,
  files: (typeof guideProjectSubmissionFiles.$inferSelect)[],
  includeEvaluation: boolean,
) {
  const base = {
    id: row.id,
    version: row.version,
    reflection: row.reflection,
    projectUrl: row.projectUrl,
    evaluationStatus: row.evaluationStatus,
    submittedAt: row.submittedAt,
    files: files.map(attachmentView),
  };
  return includeEvaluation ? { ...base, evaluation: row.evaluation ?? null } : base;
}

async function guideProjectsData(guideId: string) {
  const [assignments, guideEnrollments] = await Promise.all([
    db.select().from(guideProjectAssignments)
      .where(eq(guideProjectAssignments.guideId, guideId))
      .orderBy(desc(guideProjectAssignments.createdAt)),
    db.select({
      enrollmentId: enrollments.id,
      learnerId: enrollments.userId,
      courseId: enrollments.courseId,
      name: learners.name,
      college: learners.college,
    }).from(enrollments)
      .innerJoin(learners, eq(learners.id, enrollments.userId))
      .where(eq(enrollments.guideId, guideId)),
  ]);
  const assignmentIds = assignments.map((assignment) => assignment.id);
  const targets = assignmentIds.length
    ? await db.select({
      target: guideProjectTargets,
      learnerName: learners.name,
      learnerEmail: learners.email,
    }).from(guideProjectTargets)
      .innerJoin(learners, eq(learners.id, guideProjectTargets.userId))
      .where(inArray(guideProjectTargets.assignmentId, assignmentIds))
      .orderBy(guideProjectTargets.assignedAt)
    : [];
  const latest = await latestSubmissionsByTarget(targets.map(({ target }) => target.id));
  const targetsByAssignment = new Map<string, typeof targets>();
  for (const row of targets) {
    const group = targetsByAssignment.get(row.target.assignmentId) ?? [];
    group.push(row);
    targetsByAssignment.set(row.target.assignmentId, group);
  }
  const courseIds = [...new Set(guideEnrollments.map((row) => row.courseId))];
  const courses = courseIds.flatMap((id) => {
    const course = findCourse(id);
    return course ? [{ id: course.id, title: course.title }] : [];
  });
  const courseTitle = (courseId: string) => findCourse(courseId)?.title ?? "Internship pathway";
  const mappedAssignments = assignments.map((assignment) => ({
    ...assignment,
    courseTitle: courseTitle(assignment.courseId),
    targets: (targetsByAssignment.get(assignment.id) ?? []).map(({ target, learnerName, learnerEmail }) => {
      const latestSubmission = latest.get(target.id);
      return {
        id: target.id,
        enrollmentId: target.enrollmentId,
        learnerId: target.userId,
        learnerName,
        learnerEmail,
        assignedAt: target.assignedAt,
        latestSubmission: latestSubmission
          ? submissionView(latestSubmission.submission, latestSubmission.files, true)
          : null,
      };
    }),
  }));
  return {
    courses,
    learners: guideEnrollments.map((learner) => ({
      ...learner,
      courseTitle: courseTitle(learner.courseId),
    })),
    assignments: mappedAssignments,
  };
}

async function runEvaluation(submissionId: string, logError: (error: unknown) => void): Promise<void> {
  try {
    const [row] = await db.select({
      submission: guideProjectSubmissions,
      target: guideProjectTargets,
      assignment: guideProjectAssignments,
    }).from(guideProjectSubmissions)
      .innerJoin(guideProjectTargets, eq(guideProjectTargets.id, guideProjectSubmissions.targetId))
      .innerJoin(guideProjectAssignments, eq(guideProjectAssignments.id, guideProjectTargets.assignmentId))
      .where(eq(guideProjectSubmissions.id, submissionId))
      .limit(1);
    if (!row) return;
    const files = await db.select().from(guideProjectSubmissionFiles)
      .where(eq(guideProjectSubmissionFiles.submissionId, submissionId));
    const evaluation = await evaluateProjectSubmission({
      assignment: row.assignment,
      submission: row.submission,
      files,
    });
    await db.update(guideProjectSubmissions).set({
      evaluation,
      evaluationStatus: "ready",
      evaluationStartedAt: null,
      evaluatedAt: new Date(),
    }).where(eq(guideProjectSubmissions.id, submissionId));
  } catch (error) {
    logError(error);
    try {
      await db.update(guideProjectSubmissions).set({
        evaluation: null,
        evaluationStatus: "failed",
        evaluationStartedAt: null,
        evaluatedAt: new Date(),
      }).where(eq(guideProjectSubmissions.id, submissionId));
    } catch (saveError) {
      logError(saveError);
    }
  }
}

router.get("/guide/projects", requireGuide, async (req, res): Promise<void> => {
  const data = await guideProjectsData(req.learner!.id);
  res.set("Cache-Control", "private, no-store");
  res.json(ListGuideProjectsResponse.parse(data));
});

router.post("/guide/projects", requireGuide, async (req, res): Promise<void> => {
  const body = CreateGuideProjectAssignmentBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Check the project details and selected learners." }); return; }
  const input = body.data;
  const selectedIds = [...new Set(input.enrollmentIds)];
  if (selectedIds.length !== input.enrollmentIds.length || !findCourse(input.courseId)) {
    res.status(400).json({ error: "Choose a valid course and select each learner only once." }); return;
  }
  const enrolled = await db.select().from(enrollments)
    .where(and(
      inArray(enrollments.id, selectedIds),
      eq(enrollments.guideId, req.learner!.id),
      eq(enrollments.courseId, input.courseId),
    ));
  if (enrolled.length !== selectedIds.length) {
    res.status(400).json({ error: "One or more learners are not currently assigned to you in this course." }); return;
  }
  const assignmentId = randomUUID();
  const createdAt = new Date();
  const [assignment] = await db.transaction(async (tx) => {
    const [created] = await tx.insert(guideProjectAssignments).values({
      id: assignmentId,
      guideId: req.learner!.id,
      courseId: input.courseId,
      title: input.title.trim(),
      instructions: input.instructions.trim(),
      rubric: input.rubric.trim(),
      dueAt: input.dueAt ?? null,
      createdAt,
    }).returning();
    await tx.insert(guideProjectTargets).values(enrolled.map((row) => ({
      id: randomUUID(),
      assignmentId,
      enrollmentId: row.id,
      userId: row.userId,
      assignedAt: createdAt,
    })));
    return [created];
  });
  const data = await guideProjectsData(req.learner!.id);
  const result = data.assignments.find((row) => row.id === assignment!.id);
  if (!result) { res.status(500).json({ error: "The project was saved but could not be loaded." }); return; }
  res.status(201).json(CreateGuideProjectAssignmentResponse.parse(result));
});

router.post("/guide/projects/submissions/:submissionId/evaluate", requireGuide, async (req, res): Promise<void> => {
  const params = RetryGuideProjectEvaluationParams.safeParse(req.params);
  if (!params.success) { res.status(404).json({ error: "Project submission not found." }); return; }
  const [row] = await db.select({
    submission: guideProjectSubmissions,
    assignment: guideProjectAssignments,
  }).from(guideProjectSubmissions)
    .innerJoin(guideProjectTargets, eq(guideProjectTargets.id, guideProjectSubmissions.targetId))
    .innerJoin(guideProjectAssignments, eq(guideProjectAssignments.id, guideProjectTargets.assignmentId))
    .where(and(
      eq(guideProjectSubmissions.id, params.data.submissionId),
      eq(guideProjectAssignments.guideId, req.learner!.id),
    )).limit(1);
  if (!row) { res.status(404).json({ error: "Project submission not found." }); return; }
  if (row.submission.evaluationStatus === "pending") {
    res.status(409).json({ error: "This project is already being evaluated." }); return;
  }
  await db.update(guideProjectSubmissions).set({
    evaluationStatus: "pending",
    evaluation: null,
    evaluationStartedAt: new Date(),
    evaluatedAt: null,
  }).where(eq(guideProjectSubmissions.id, row.submission.id));
  res.json(RetryGuideProjectEvaluationResponse.parse({
    ...submissionView({ ...row.submission, evaluationStatus: "pending", evaluation: null }, [], true),
    files: (await db.select().from(guideProjectSubmissionFiles)
      .where(eq(guideProjectSubmissionFiles.submissionId, row.submission.id))).map(attachmentView),
  }));
  void runEvaluation(row.submission.id, (error) => {
    req.log.error({ err: error, submissionId: row.submission.id }, "Project AI evaluation failed");
  });
});

router.get("/projects/assignments", requireStudent, async (req, res): Promise<void> => {
  const targets = await db.select({
    target: guideProjectTargets,
    assignment: guideProjectAssignments,
  }).from(guideProjectTargets)
    .innerJoin(guideProjectAssignments, eq(guideProjectAssignments.id, guideProjectTargets.assignmentId))
    .where(eq(guideProjectTargets.userId, req.learner!.id))
    .orderBy(desc(guideProjectTargets.assignedAt));
  const latest = await latestSubmissionsByTarget(targets.map(({ target }) => target.id));
  const result = targets.map(({ target, assignment }) => {
    const saved = latest.get(target.id);
    return {
      targetId: target.id,
      assignmentId: assignment.id,
      courseId: assignment.courseId,
      courseTitle: findCourse(assignment.courseId)?.title ?? "Internship pathway",
      title: assignment.title,
      instructions: assignment.instructions,
      rubric: assignment.rubric,
      dueAt: assignment.dueAt,
      assignedAt: target.assignedAt,
      latestSubmission: saved ? submissionView(saved.submission, saved.files, false) : null,
    };
  });
  res.set("Cache-Control", "private, no-store");
  res.json(ListStudentProjectAssignmentsResponse.parse(result));
});

router.post("/projects/assignments/:targetId/uploads", requireStudent, async (req, res): Promise<void> => {
  const params = RequestStudentProjectUploadParams.safeParse(req.params);
  const body = RequestStudentProjectUploadBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Choose a supported project file." }); return; }
  const [target] = await db.select({ id: guideProjectTargets.id }).from(guideProjectTargets)
    .where(and(eq(guideProjectTargets.id, params.data.targetId), eq(guideProjectTargets.userId, req.learner!.id)))
    .limit(1);
  if (!target) { res.status(403).json({ error: "This project is not assigned to you." }); return; }
  try {
    const result = await createProjectUpload({
      targetId: target.id,
      userId: req.learner!.id,
      ...body.data,
    });
    res.status(201).json(RequestStudentProjectUploadResponse.parse(result));
  } catch (error) {
    req.log.error({ err: error, targetId: target.id }, "Could not create project upload");
    res.status(400).json({ error: "This file type or size is not supported." });
  }
});

router.post("/projects/assignments/:targetId/submissions", requireStudent, async (req, res): Promise<void> => {
  const params = SubmitStudentProjectParams.safeParse(req.params);
  const body = SubmitStudentProjectBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Choose one or more files and submit the project." }); return; }
  const [target] = await db.select().from(guideProjectTargets)
    .where(and(eq(guideProjectTargets.id, params.data.targetId), eq(guideProjectTargets.userId, req.learner!.id)))
    .limit(1);
  if (!target) { res.status(403).json({ error: "This project is not assigned to you." }); return; }
  const claims = body.data.uploadTokens.map((token) => verifyProjectUploadToken(token, {
    targetId: target.id,
    userId: req.learner!.id,
  }));
  if (claims.some((claim) => !claim)) {
    res.status(400).json({ error: "One or more upload links have expired. Upload the files again." }); return;
  }
  const verifiedClaims = claims as NonNullable<(typeof claims)[number]>[];
  const totalBytes = verifiedClaims.reduce((total, claim) => total + claim.size, 0);
  const hasZip = verifiedClaims.some((claim) => getProjectFileExtension(claim.fileName) === ".zip");
  if (verifiedClaims.length > MAX_PROJECT_SUBMISSION_FILES
    || totalBytes > MAX_PROJECT_SUBMISSION_BYTES
    || (hasZip && verifiedClaims.length > 1)
    || new Set(verifiedClaims.map((claim) => claim.objectPath)).size !== verifiedClaims.length) {
    res.status(400).json({ error: "Upload up to five files (or one ZIP archive), within the total size limit." }); return;
  }
  const existingFiles = await db.select({ objectPath: guideProjectSubmissionFiles.objectPath })
    .from(guideProjectSubmissionFiles)
    .where(inArray(guideProjectSubmissionFiles.objectPath, verifiedClaims.map((claim) => claim.objectPath)));
  if (existingFiles.length) {
    res.status(400).json({ error: "These upload links were already used. Upload the project files again." }); return;
  }
  const verified = await Promise.all(verifiedClaims.map(verifyUploadedProjectFile));
  if (verified.some((exists) => !exists)) {
    res.status(400).json({ error: "One or more files are still uploading or could not be verified. Please upload again." }); return;
  }
  const submissionId = randomUUID();
  const inserted = await db.transaction(async (tx) => {
    await tx.select().from(guideProjectTargets).where(eq(guideProjectTargets.id, target.id)).for("update");
    const [previous] = await tx.select({ version: guideProjectSubmissions.version })
      .from(guideProjectSubmissions).where(eq(guideProjectSubmissions.targetId, target.id))
      .orderBy(desc(guideProjectSubmissions.version)).limit(1);
    const [submission] = await tx.insert(guideProjectSubmissions).values({
      id: submissionId,
      targetId: target.id,
      version: (previous?.version ?? 0) + 1,
      reflection: body.data.reflection?.trim() ?? "",
      projectUrl: body.data.projectUrl?.trim() ?? "",
      evaluationStatus: "pending",
      evaluationStartedAt: new Date(),
    }).returning();
    const files = await tx.insert(guideProjectSubmissionFiles).values(verifiedClaims.map((claim) => ({
      id: randomUUID(),
      submissionId,
      objectPath: claim.objectPath,
      fileName: claim.fileName,
      contentType: claim.contentType,
      size: claim.size,
      uploadedBy: req.learner!.id,
    }))).returning();
    return { submission: submission!, files };
  });
  res.status(201).json(SubmitStudentProjectResponse.parse({
    ...submissionView(inserted.submission, inserted.files, false),
  }));
  void runEvaluation(submissionId, (error) => {
    req.log.error({ err: error, submissionId }, "Project AI evaluation failed");
  });
});

router.get("/projects/attachments/:attachmentId", requireLearner, async (req, res): Promise<void> => {
  const params = DownloadProjectAttachmentParams.safeParse(req.params);
  if (!params.success) { res.status(404).json({ error: "Project file not found." }); return; }
  const [row] = await db.select({
    file: guideProjectSubmissionFiles,
    userId: guideProjectTargets.userId,
    guideId: guideProjectAssignments.guideId,
  }).from(guideProjectSubmissionFiles)
    .innerJoin(guideProjectSubmissions, eq(guideProjectSubmissions.id, guideProjectSubmissionFiles.submissionId))
    .innerJoin(guideProjectTargets, eq(guideProjectTargets.id, guideProjectSubmissions.targetId))
    .innerJoin(guideProjectAssignments, eq(guideProjectAssignments.id, guideProjectTargets.assignmentId))
    .where(eq(guideProjectSubmissionFiles.id, params.data.attachmentId))
    .limit(1);
  if (!row) { res.status(404).json({ error: "Project file not found." }); return; }
  const allowed = req.learner!.role === "student"
    ? row.userId === req.learner!.id
    : req.learner!.role === "guide" && row.guideId === req.learner!.id;
  if (!allowed) { res.status(403).json({ error: "You are not part of this project." }); return; }
  const file = await projectObjectFile(row.file.objectPath);
  if (!file) { res.status(404).json({ error: "Project file is no longer available." }); return; }
  const fileName = row.file.fileName.replace(/[\\/\u0000-\u001f\u007f]/g, "_").slice(0, 160);
  res.set({
    "Content-Type": row.file.contentType,
    "Content-Length": String(row.file.size),
    "Content-Disposition": `attachment; filename="project-file"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  });
  file.createReadStream().on("error", (error) => {
    req.log.warn({ err: error, attachmentId: row.file.id }, "Could not stream project file");
    if (!res.headersSent) res.status(404).end();
    else res.end();
  }).pipe(res);
});

export default router;
