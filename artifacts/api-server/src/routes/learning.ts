import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { db, enrollmentPortfolioFiles, enrollments, workLogs } from "@workspace/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  GetCourseParams, GetCourseResponse, ListCoursesResponse, GetDashboardResponse,
  EnrollBody, EnrollResponse, ListEnrollmentsResponse, UpdateEnrollmentParams, UpdateEnrollmentBody, UpdateEnrollmentResponse,
  ListLogsResponse, CreateLogBody, CreateLogResponse, DeleteLogParams,
  RequestPortfolioUploadParams, RequestPortfolioUploadBody, RequestPortfolioUploadResponse, DownloadPortfolioFileParams,
} from "@workspace/api-zod";
import { courses, findCourse } from "../lib/catalog";
import { requireLearner, requireStudent, publicUser } from "../lib/auth";
import { assignNextGuide, lockGuideAssignmentPool } from "../lib/guide-assignment";
import { userEnrollments, userLogs, enrollmentViewWithPacing } from "../lib/learning";
import { pathwayModuleWeights } from "../lib/pacing";
import {
  MAX_PORTFOLIO_FILES,
  MAX_PORTFOLIO_TOTAL_BYTES,
  MAX_PROJECT_SUBMISSION_BYTES,
  MAX_PROJECT_SUBMISSION_FILES,
  getProjectFileExtension,
  sanitizeProjectFileName,
} from "../lib/project-rules";
import {
  createPortfolioUpload,
  portfolioObjectFile,
  verifyPortfolioUploadToken,
  verifyUploadedPortfolioFile,
} from "../lib/portfolio-storage";

const router: IRouter = Router();
router.get("/courses", (_req, res) => { res.json(ListCoursesResponse.parse(courses)); });
router.get("/courses/:id", (req, res): void => {
  const params = GetCourseParams.safeParse(req.params);
  const course = params.success ? findCourse(params.data.id) : undefined;
  if (!course) { res.status(404).json({ error: "Internship not found." }); return; }
  res.json(GetCourseResponse.parse(course));
});
router.get("/dashboard", requireStudent, async (req, res): Promise<void> => {
  const user = req.learner!;
  const [items, logs] = await Promise.all([userEnrollments(user.id), userLogs(user.id)]);
  const relevant = courses.filter((c) => !items.some((e) => e.course.id === c.id))
    .sort((a, b) => Number(b.disciplines.some((d) => d.toLowerCase() === user.discipline.toLowerCase())) - Number(a.disciplines.some((d) => d.toLowerCase() === user.discipline.toLowerCase()))).slice(0, 3);
  const activity = [
    ...logs.slice(0, 8).map((l) => ({ id: l.id, text: `Logged ${l.hours}h: ${l.activity}`, date: l.date, type: "log" })),
    ...items.map((e) => ({ id: e.id, text: `Started ${e.course.title}`, date: e.createdAt.slice(0, 10), type: "enrollment" })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  res.json(GetDashboardResponse.parse({
    preview: false, user: publicUser(user),
    stats: { activeInternships: items.length, learningHours: logs.reduce((s, l) => s + l.hours, 0), completedModules: items.reduce((s, e) => s + e.completedModules.length, 0), submittedProjects: items.filter((e) => e.status === "submitted").length },
    enrollments: items, recommendations: relevant, activity,
  }));
});
router.get("/enrollments", requireStudent, async (req, res): Promise<void> => {
  res.json(ListEnrollmentsResponse.parse(await userEnrollments(req.learner!.id)));
});
router.post("/enrollments", requireStudent, async (req, res): Promise<void> => {
  const parsed = EnrollBody.safeParse(req.body);
  if (!parsed.success || !findCourse(parsed.data.courseId)) { res.status(400).json({ error: "Choose an available internship and a 60- or 120-hour pathway." }); return; }
  let created: typeof enrollments.$inferSelect | undefined;
  let alreadyEnrolled = false;
  await db.transaction(async (tx) => {
    await lockGuideAssignmentPool(tx);
    const [existing] = await tx.select().from(enrollments)
      .where(and(eq(enrollments.userId, req.learner!.id), eq(enrollments.courseId, parsed.data.courseId))).limit(1);
    if (existing) { alreadyEnrolled = true; return; }
    const guideId = await assignNextGuide(tx, parsed.data.courseId, true);
    [created] = await tx.insert(enrollments)
      .values({ id: randomUUID(), userId: req.learner!.id, ...parsed.data, guideId })
      .onConflictDoNothing().returning();
  });
  if (alreadyEnrolled || !created) { res.status(409).json({ error: "You already have a pathway for this internship. Open My learning to continue." }); return; }
  res.status(201).json(EnrollResponse.parse(await enrollmentViewWithPacing(created, [])));
});

router.post("/enrollments/:id/uploads", requireStudent, async (req, res): Promise<void> => {
  const params = RequestPortfolioUploadParams.safeParse(req.params);
  const body = RequestPortfolioUploadBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Choose a supported file for your pathway reflection." }); return; }
  const [enrollment] = await db.select({ id: enrollments.id }).from(enrollments)
    .where(and(eq(enrollments.id, params.data.id), eq(enrollments.userId, req.learner!.id)))
    .limit(1);
  if (!enrollment) { res.status(403).json({ error: "This pathway is not assigned to your account." }); return; }
  try {
    const result = await createPortfolioUpload({
      enrollmentId: enrollment.id,
      userId: req.learner!.id,
      ...body.data,
    });
    res.status(201).json(RequestPortfolioUploadResponse.parse(result));
  } catch (error) {
    req.log.error({ err: error, enrollmentId: enrollment.id }, "Could not create portfolio upload");
    res.status(400).json({ error: "This file type or size is not supported." });
  }
});

router.patch("/enrollments/:id", requireStudent, async (req, res): Promise<void> => {
  const params = UpdateEnrollmentParams.safeParse(req.params);
  const parsed = UpdateEnrollmentBody.safeParse(req.body);
  if (!params.success || !parsed.success) { res.status(400).json({ error: "Invalid progress update." }); return; }
  const owner = and(eq(enrollments.id, params.data.id), eq(enrollments.userId, req.learner!.id));
  const [existing] = await db.select().from(enrollments).where(owner).limit(1);
  if (!existing) { res.status(404).json({ error: "Learning pathway not found." }); return; }
  const data = parsed.data;
  const course = findCourse(existing.courseId)!;
  const applicableModules = pathwayModuleWeights(course, existing.hours).map(({ module }) => module);
  if (data.completedModules && (new Set(data.completedModules).size !== data.completedModules.length || data.completedModules.some((id) => !applicableModules.some((m) => m.id === id)))) {
    res.status(400).json({ error: "Choose valid modules for your selected pathway." }); return;
  }
  const projectUrl = data.projectUrl ?? existing.projectUrl;
  if (projectUrl) {
    try { if (!["http:", "https:"].includes(new URL(projectUrl).protocol)) throw new Error(); }
    catch { res.status(400).json({ error: "Provide a valid http or https portfolio/repository link." }); return; }
  }
  const rawClaims = (data.uploadTokens ?? []).map((token) => verifyPortfolioUploadToken(token, {
    enrollmentId: existing.id,
    userId: req.learner!.id,
  }));
  if (rawClaims.some((claim) => !claim)) {
    res.status(400).json({ error: "One or more file upload links have expired. Choose and upload those files again." }); return;
  }
  const uploadClaims = rawClaims as NonNullable<(typeof rawClaims)[number]>[];
  const incomingBytes = uploadClaims.reduce((total, claim) => total + claim.size, 0);
  const containsArchive = uploadClaims.some((claim) => getProjectFileExtension(claim.fileName) === ".zip");
  if (uploadClaims.length > MAX_PROJECT_SUBMISSION_FILES
    || incomingBytes > MAX_PROJECT_SUBMISSION_BYTES
    || (containsArchive && uploadClaims.length > 1)
    || new Set(uploadClaims.map((claim) => claim.objectPath)).size !== uploadClaims.length) {
    res.status(400).json({ error: "Add up to five files, or one ZIP archive, within the upload size limit." }); return;
  }
  const savedFiles = await db.select().from(enrollmentPortfolioFiles)
    .where(eq(enrollmentPortfolioFiles.enrollmentId, existing.id))
    .orderBy(desc(enrollmentPortfolioFiles.createdAt));
  if (savedFiles.length + uploadClaims.length > MAX_PORTFOLIO_FILES
    || savedFiles.reduce((sum, file) => sum + file.size, 0) + incomingBytes > MAX_PORTFOLIO_TOTAL_BYTES) {
    res.status(400).json({ error: "This pathway has reached its file limit. Remove older uploads before adding more." }); return;
  }
  if (uploadClaims.some((claim) => savedFiles.some((file) => file.objectPath === claim.objectPath))) {
    res.status(400).json({ error: "These upload links were already used. Upload the files again." }); return;
  }
  const verifiedUploads = await Promise.all(uploadClaims.map(verifyUploadedPortfolioFile));
  if (verifiedUploads.some((verified) => !verified)) {
    res.status(400).json({ error: "One or more files are still uploading or could not be checked. Please upload them again." }); return;
  }
  const logs = await userLogs(req.learner!.id);
  const reflection = data.reflection ?? existing.reflection;
  const completedModules = data.completedModules ?? existing.completedModules;
  if (data.submit) {
    const hours = logs.filter((l) => l.enrollmentId === existing.id).reduce((s, l) => s + l.hours, 0);
    if ((!projectUrl && savedFiles.length + uploadClaims.length === 0) || reflection.trim().length < 30 || hours < existing.hours || !applicableModules.every((m) => completedModules.includes(m.id))) {
      res.status(400).json({ error: `Before submitting, complete all pathway modules, record ${existing.hours} practical hours, add a project link or file, and write a reflection of at least 30 characters. You can save a draft at any time.` }); return;
    }
  }
  // Any edit invalidates an earlier submission and requires the learner to resubmit.
  const [updated] = await db.transaction(async (tx) => {
    if (uploadClaims.length) {
      await tx.insert(enrollmentPortfolioFiles).values(uploadClaims.map((claim) => ({
        id: randomUUID(),
        enrollmentId: existing.id,
        userId: req.learner!.id,
        objectPath: claim.objectPath,
        fileName: claim.fileName,
        contentType: claim.contentType,
        size: claim.size,
      })));
    }
    return tx.update(enrollments).set({
      projectUrl,
      reflection,
      completedModules,
      status: data.submit ? "submitted" : "in_progress",
    }).where(owner).returning();
  });
  res.json(UpdateEnrollmentResponse.parse(await enrollmentViewWithPacing(updated!, logs)));
});

router.get("/projects/portfolio-files/:fileId", requireLearner, async (req, res): Promise<void> => {
  const params = DownloadPortfolioFileParams.safeParse(req.params);
  if (!params.success) { res.status(404).json({ error: "Portfolio file not found." }); return; }
  const [row] = await db.select({
    file: enrollmentPortfolioFiles,
    guideId: enrollments.guideId,
  }).from(enrollmentPortfolioFiles)
    .innerJoin(enrollments, eq(enrollments.id, enrollmentPortfolioFiles.enrollmentId))
    .where(eq(enrollmentPortfolioFiles.id, params.data.fileId))
    .limit(1);
  if (!row) { res.status(404).json({ error: "Portfolio file not found." }); return; }
  const allowed = req.learner!.role === "student"
    ? row.file.userId === req.learner!.id
    : req.learner!.role === "guide" && row.guideId === req.learner!.id;
  if (!allowed) { res.status(403).json({ error: "You are not part of this pathway." }); return; }
  const file = await portfolioObjectFile(row.file.objectPath);
  if (!file) { res.status(404).json({ error: "Portfolio file is no longer available." }); return; }
  const fileName = sanitizeProjectFileName(row.file.fileName);
  res.set({
    "Content-Type": row.file.contentType,
    "Content-Length": String(row.file.size),
    "Content-Disposition": `attachment; filename="portfolio-file"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  });
  file.createReadStream().on("error", (error) => {
    req.log.warn({ err: error, fileId: row.file.id }, "Could not stream portfolio file");
    if (!res.headersSent) res.status(404).end();
    else res.end();
  }).pipe(res);
});

router.get("/logs", requireStudent, async (req, res): Promise<void> => {
  res.json(ListLogsResponse.parse(await userLogs(req.learner!.id)));
});
router.post("/logs", requireStudent, async (req, res): Promise<void> => {
  const parsed = CreateLogBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Enter a date, 0.25–12 hours, and activity and learning notes of at least 5 characters each." }); return; }
  const data = parsed.data;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const validDate = !Number.isNaN(Date.parse(data.date)) && new Date(data.date).toISOString().slice(0, 10) === data.date;
  if (!validDate || data.date > today || data.activity.trim().length < 5 || data.learning.trim().length < 5) { res.status(400).json({ error: "Use a valid date no later than today and meaningful work notes." }); return; }
  let created: typeof workLogs.$inferSelect | undefined;
  let failure = "";
  await db.transaction(async (tx) => {
    // Serialize daily-hour checks across all pathways for this learner.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${req.learner!.id}))`);
    const [enrollment] = await tx.select().from(enrollments).where(and(eq(enrollments.id, data.enrollmentId), eq(enrollments.userId, req.learner!.id))).limit(1);
    if (!enrollment) { failure = "Learning pathway not found."; return; }
    const logs = await tx.select().from(workLogs).where(eq(workLogs.userId, req.learner!.id));
    if (logs.filter((l) => l.date === data.date).reduce((s, l) => s + l.hours, 0) + data.hours > 12) { failure = "Daily practical work cannot exceed 12 hours across all internships."; return; }
    [created] = await tx.insert(workLogs).values({ id: randomUUID(), userId: req.learner!.id, ...data }).returning();
  });
  if (!created) { res.status(400).json({ error: failure }); return; }
  res.status(201).json(CreateLogResponse.parse(created));
});
router.delete("/logs/:id", requireStudent, async (req, res): Promise<void> => {
  const params = DeleteLogParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid log." }); return; }
  await db.transaction(async (tx) => {
    const [deleted] = await tx.delete(workLogs).where(and(eq(workLogs.id, params.data.id), eq(workLogs.userId, req.learner!.id))).returning();
    if (!deleted) { res.status(404).json({ error: "Work log not found." }); return; }
    await tx.update(enrollments).set({ status: "in_progress" }).where(eq(enrollments.id, deleted.enrollmentId));
    res.json({ success: true });
  });
});
export default router;
