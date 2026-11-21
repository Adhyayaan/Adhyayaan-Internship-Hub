import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, avg, count, desc, eq, ilike, isNotNull, isNull, or, sql, sum } from "drizzle-orm";
import { adminReportAccess, db, enrollments, learners, practiceAttempts, studyProgress, studyTeaching, workLogs } from "@workspace/db";
import {
  GetAdminLearnerParams, GetAdminLearnerResponse, GetAdminLearningReportParams,
  ListAdminLearnersQueryParams, ListAdminLearnersResponse,
} from "@workspace/api-zod";
import { requireAdmin } from "../lib/auth";
import { reportSummaries, savedReport } from "../lib/assessment";
import { findCourse } from "../lib/catalog";

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

export default router;
