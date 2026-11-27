import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, avg, count, desc, eq, ilike, isNotNull, isNull, ne, or, sql, sum } from "drizzle-orm";
import {
  adminReportAccess, db, enrollments, internshipGuides, learners,
  practiceAttempts, studyProgress, studyTeaching, workLogs,
} from "@workspace/db";
import {
  AssignAdminGuideParams, AssignAdminGuideResponse,
  GetAdminLearnerParams, GetAdminLearnerResponse, GetAdminLearningReportParams,
  ListAdminGuidesResponse, ProvisionAdminGuideBody, ProvisionAdminGuideResponse,
  ListAdminLearnersQueryParams, ListAdminLearnersResponse,
  UpdateAdminGuideBody, UpdateAdminGuideParams, UpdateAdminGuideResponse,
} from "@workspace/api-zod";
import { requireAdmin } from "../lib/auth";
import { reportSummaries, savedReport } from "../lib/assessment";
import { courses, findCourse } from "../lib/catalog";
import { assignNextGuide, lockGuideAssignmentPool } from "../lib/guide-assignment";
import { enrollmentViewWithPacing } from "../lib/learning";

const router: IRouter = Router();
const pageSize = 20;
const students = eq(learners.role, "student");
const fields = {
  id: learners.id, name: learners.name, email: learners.email,
  college: learners.college, discipline: learners.discipline,
  createdAt: learners.createdAt, assessmentCompletedAt: learners.assessmentCompletedAt,
};
const view = (row: { createdAt: Date; assessmentCompletedAt: Date | null } & Record<string, unknown>) => ({
  ...row, createdAt: row.createdAt.toISOString(), assessmentCompletedAt: row.assessmentCompletedAt?.toISOString() ?? null,
});

async function adminGuideView(userId: string) {
  const [guide] = await db.select({
    id: learners.id,
    name: learners.name,
    email: learners.email,
    supportedCourseIds: internshipGuides.supportedCourseIds,
    availableForAssignments: internshipGuides.availableForAssignments,
  }).from(internshipGuides)
    .innerJoin(learners, eq(learners.id, internshipGuides.userId))
    .where(and(eq(internshipGuides.userId, userId), eq(learners.role, "guide"))).limit(1);
  if (!guide) return null;
  const activeLearners = await db.select({ learnerId: enrollments.userId })
    .from(enrollments).where(and(eq(enrollments.guideId, userId), ne(enrollments.status, "completed")))
    .groupBy(enrollments.userId);
  return {
    ...guide,
    supportedCourseIds: Array.isArray(guide.supportedCourseIds) ? guide.supportedCourseIds : [],
    activeLearners: activeLearners.length,
  };
}

router.use("/admin", requireAdmin);

router.get("/admin/learners", async (req, res): Promise<void> => {
  const parsed = ListAdminLearnersQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: "Check your search or page number." }); return; }
  const { search, assessment, page = 1 } = parsed.data;
  const term = `%${(search ?? "").trim().replace(/[\\%_]/g, "\\$&")}%`;
  const matches = and(students,
    term !== "%%" ? or(ilike(learners.name, term), ilike(learners.email, term), ilike(learners.college, term), ilike(learners.discipline, term)) : undefined,
    assessment === "completed" ? isNotNull(learners.assessmentCompletedAt) : assessment === "pending" ? isNull(learners.assessmentCompletedAt) : undefined);
  const [rows, matchCount, [totals], [enrollmentTotal]] = await Promise.all([
    db.select({ ...fields, enrollmentCount: db.$count(enrollments, eq(enrollments.userId, learners.id)) })
      .from(learners).where(matches).orderBy(desc(learners.createdAt), learners.id).limit(pageSize).offset((page - 1) * pageSize),
    db.$count(learners, matches),
    db.select({ learnerCount: count(), completedCount: count(learners.assessmentCompletedAt) }).from(learners).where(students),
    db.select({ enrollmentCount: count() }).from(enrollments).innerJoin(learners, eq(learners.id, enrollments.userId)).where(students),
  ]);
  res.json(ListAdminLearnersResponse.parse({ students: rows.map(view), page, pageSize, matchCount, ...totals!, ...enrollmentTotal! }));
});

router.get("/admin/learners/:id", async (req, res): Promise<void> => {
  const params = GetAdminLearnerParams.safeParse(req.params);
  if (!params.success) { res.status(404).json({ error: "Student not found." }); return; }
  const { id } = params.data;
  const [student] = await db.select(fields).from(learners).where(and(students, eq(learners.id, id))).limit(1);
  if (!student) { res.status(404).json({ error: "Student not found." }); return; }
  const [registered, hours, practice, reading, checks, reports] = await Promise.all([
    db.select({ id: enrollments.id, courseId: enrollments.courseId, hours: enrollments.hours, completedModules: enrollments.completedModules, status: enrollments.status })
      .from(enrollments).where(eq(enrollments.userId, id)).orderBy(desc(enrollments.createdAt)),
    db.select({ enrollmentId: workLogs.enrollmentId, total: sum(workLogs.hours) }).from(workLogs)
      .where(eq(workLogs.userId, id)).groupBy(workLogs.enrollmentId),
    db.select({ courseId: practiceAttempts.courseId, total: count(), average: avg(practiceAttempts.score) }).from(practiceAttempts)
      .where(and(eq(practiceAttempts.userId, id), isNotNull(practiceAttempts.score))).groupBy(practiceAttempts.courseId),
    db.select({ courseId: studyProgress.courseId, total: count() }).from(studyProgress)
      .where(and(eq(studyProgress.userId, id), eq(studyProgress.read, true))).groupBy(studyProgress.courseId),
    db.select({ courseId: studyTeaching.courseId, total: count(), secure: sql<number>`count(*) filter (where ${studyTeaching.verdict} = 'secure')`.mapWith(Number) })
      .from(studyTeaching).where(eq(studyTeaching.userId, id)).groupBy(studyTeaching.courseId),
    reportSummaries(id),
  ]);
  const courses = registered.map(enrollment => {
    const course = findCourse(enrollment.courseId);
    const modules = course?.modules.filter(m => enrollment.hours === 60 ? m.hours60 > 0 : m.hours120 > 0 || m.hours60 > 0) ?? [];
    const performance = practice.find(x => x.courseId === enrollment.courseId);
    const feedback = checks.find(x => x.courseId === enrollment.courseId);
    return {
      courseId: enrollment.courseId, title: course?.title ?? `Archived course ${enrollment.courseId}`,
      completedModules: course ? modules.filter(m => enrollment.completedModules.includes(m.id)).length : enrollment.completedModules.length,
      totalModules: course ? modules.length : enrollment.completedModules.length,
      loggedHours: Number(hours.find(x => x.enrollmentId === enrollment.id)?.total ?? 0),
      targetHours: enrollment.hours, projectStatus: enrollment.status,
      practiceCount: performance?.total ?? 0, practiceAverage: performance?.average == null ? null : Number(performance.average),
      lessonsRead: reading.find(x => x.courseId === enrollment.courseId)?.total ?? 0,
      studyChecks: feedback?.total ?? 0, secureChecks: feedback?.secure ?? 0,
    };
  });
  res.json(GetAdminLearnerResponse.parse({ student: view({ ...student, enrollmentCount: registered.length }), courses, reports }));
});

router.get("/admin/learners/:id/reports/:reportId", async (req, res): Promise<void> => {
  const params = GetAdminLearningReportParams.safeParse(req.params);
  if (!params.success) { res.status(404).json({ error: "Report not found." }); return; }
  const { id, reportId } = params.data;
  const [student] = await db.select({ id: learners.id }).from(learners).where(and(students, eq(learners.id, id))).limit(1);
  const report = student ? await savedReport(id, reportId) : null;
  if (!report) { res.status(404).json({ error: "Report not found." }); return; }
  await db.insert(adminReportAccess).values({ id: randomUUID(), adminId: req.learner!.id, learnerId: id, reportId: report.id });
  res.json(report);
});

router.get("/admin/guides", async (_req, res): Promise<void> => {
  const [guideRows, assignedRows, unassignedRows] = await Promise.all([
    db.select({
      id: learners.id, name: learners.name, email: learners.email,
      supportedCourseIds: internshipGuides.supportedCourseIds,
      availableForAssignments: internshipGuides.availableForAssignments,
    }).from(internshipGuides)
      .innerJoin(learners, eq(learners.id, internshipGuides.userId))
      .where(eq(learners.role, "guide")).orderBy(learners.name),
    db.select({ guideId: enrollments.guideId, learnerId: enrollments.userId }).from(enrollments)
      .where(and(isNotNull(enrollments.guideId), ne(enrollments.status, "completed"))),
    db.select({
      id: enrollments.id, learnerId: learners.id, learnerName: learners.name, learnerEmail: learners.email,
      courseId: enrollments.courseId, hours: enrollments.hours, status: enrollments.status, createdAt: enrollments.createdAt,
    }).from(enrollments).innerJoin(learners, eq(learners.id, enrollments.userId))
      .where(isNull(enrollments.guideId)).orderBy(desc(enrollments.createdAt)),
  ]);
  const activeByGuide = new Map<string, Set<string>>();
  for (const row of assignedRows) {
    if (!row.guideId) continue;
    const set = activeByGuide.get(row.guideId) ?? new Set<string>();
    set.add(row.learnerId);
    activeByGuide.set(row.guideId, set);
  }
  res.json(ListAdminGuidesResponse.parse({
    guides: guideRows.map((guide) => ({
      ...guide,
      supportedCourseIds: Array.isArray(guide.supportedCourseIds) ? guide.supportedCourseIds : [],
      activeLearners: activeByGuide.get(guide.id)?.size ?? 0,
    })),
    unassignedEnrollments: unassignedRows.map((row) => ({
      id: row.id, learnerId: row.learnerId, learnerName: row.learnerName, learnerEmail: row.learnerEmail,
      courseId: row.courseId, courseTitle: findCourse(row.courseId)?.title ?? `Archived course ${row.courseId}`,
      hours: row.hours, status: row.status, createdAt: row.createdAt.toISOString(),
    })),
  }));
});

router.post("/admin/guides", async (req, res): Promise<void> => {
  const input = ProvisionAdminGuideBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Enter an account email and at least one supported internship." }); return; }
  const supportedCourseIds = [...new Set(input.data.supportedCourseIds)];
  if (supportedCourseIds.some((courseId) => !findCourse(courseId))) {
    res.status(400).json({ error: "Choose internships from the available course list." }); return;
  }
  let failure: "not_found" | "admin" | null = null;
  let userId: string | null = null;
  await db.transaction(async (tx) => {
    await lockGuideAssignmentPool(tx);
    const [account] = await tx.select({ id: learners.id, role: learners.role }).from(learners)
      .where(sql`lower(${learners.email}) = ${input.data.email.trim().toLowerCase()}`).limit(1);
    if (!account) { failure = "not_found"; return; }
    if (account.role === "admin") { failure = "admin"; return; }
    userId = account.id;
    await tx.update(learners).set({ role: "guide" }).where(eq(learners.id, account.id));
    await tx.insert(internshipGuides).values({
      userId: account.id, supportedCourseIds,
      availableForAssignments: input.data.availableForAssignments,
    }).onConflictDoUpdate({
      target: internshipGuides.userId,
      set: { supportedCourseIds, availableForAssignments: input.data.availableForAssignments },
    });
  });
  if (failure === "not_found") { res.status(404).json({ error: "No account matches that email. Ask the person to register first." }); return; }
  if (failure === "admin") { res.status(409).json({ error: "An administrator account cannot be changed to a guide." }); return; }
  const guide = userId ? await adminGuideView(userId) : null;
  if (!guide) { res.status(500).json({ error: "The guide account could not be saved." }); return; }
  res.status(201).json(ProvisionAdminGuideResponse.parse(guide));
});

router.patch("/admin/guides/:id", async (req, res): Promise<void> => {
  const params = UpdateAdminGuideParams.safeParse(req.params);
  const input = UpdateAdminGuideBody.safeParse(req.body);
  if (!params.success || !input.success || (input.data.supportedCourseIds === undefined && input.data.availableForAssignments === undefined)) {
    res.status(400).json({ error: "Choose course coverage, availability, or both." }); return;
  }
  const supportedCourseIds = input.data.supportedCourseIds === undefined
    ? undefined
    : [...new Set(input.data.supportedCourseIds)];
  if (supportedCourseIds?.some((courseId) => !findCourse(courseId))) {
    res.status(400).json({ error: "Choose internships from the available course list." }); return;
  }
  let exists = false;
  await db.transaction(async (tx) => {
    await lockGuideAssignmentPool(tx);
    const [guide] = await tx.select({ userId: internshipGuides.userId }).from(internshipGuides)
      .innerJoin(learners, eq(learners.id, internshipGuides.userId))
      .where(and(eq(internshipGuides.userId, params.data.id), eq(learners.role, "guide"))).limit(1);
    if (!guide) return;
    exists = true;
    await tx.update(internshipGuides).set({
      ...(supportedCourseIds !== undefined ? { supportedCourseIds } : {}),
      ...(input.data.availableForAssignments !== undefined ? { availableForAssignments: input.data.availableForAssignments } : {}),
    }).where(eq(internshipGuides.userId, params.data.id));
  });
  if (!exists) { res.status(404).json({ error: "Guide not found." }); return; }
  const guide = await adminGuideView(params.data.id);
  if (!guide) { res.status(404).json({ error: "Guide not found." }); return; }
  res.json(UpdateAdminGuideResponse.parse(guide));
});

router.post("/admin/enrollments/:id/assign-guide", async (req, res): Promise<void> => {
  const params = AssignAdminGuideParams.safeParse(req.params);
  if (!params.success) { res.status(404).json({ error: "Enrolment not found." }); return; }
  let enrollment: typeof enrollments.$inferSelect | undefined;
  let failure: "missing" | "assigned" | "none" | null = null;
  await db.transaction(async (tx) => {
    await lockGuideAssignmentPool(tx);
    const [existing] = await tx.select().from(enrollments).where(eq(enrollments.id, params.data.id)).limit(1).for("update");
    if (!existing) { failure = "missing"; return; }
    if (existing.guideId || existing.status === "completed") { failure = "assigned"; return; }
    const guideId = await assignNextGuide(tx, existing.courseId, true);
    if (!guideId) { failure = "none"; return; }
    [enrollment] = await tx.update(enrollments).set({ guideId })
      .where(eq(enrollments.id, existing.id)).returning();
  });
  if (failure === "missing") { res.status(404).json({ error: "Enrolment not found." }); return; }
  if (failure === "assigned") { res.status(409).json({ error: "This enrolment is already assigned or complete." }); return; }
  if (failure === "none" || !enrollment) { res.status(409).json({ error: "No available guide covers this internship yet." }); return; }
  const logs = await db.select({ enrollmentId: workLogs.enrollmentId, hours: workLogs.hours })
    .from(workLogs).where(eq(workLogs.enrollmentId, enrollment.id));
  res.json(AssignAdminGuideResponse.parse(await enrollmentViewWithPacing(enrollment, logs)));
});

export default router;
