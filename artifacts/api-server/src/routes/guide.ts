import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, avg, count, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import {
  db, enrollments, guideReportAccess, internshipGuides, learners,
  practiceAttempts, studyProgress, studyTeaching, workLogs,
} from "@workspace/db";
import {
  GetGuideDashboardQueryParams, GetGuideDashboardResponse,
  GetGuideLearningReportParams, GetGuideLearningReportResponse,
} from "@workspace/api-zod";
import { requireGuide } from "../lib/auth";
import { reportSummariesForUsers, savedReport } from "../lib/assessment";
import { enrollmentViews } from "../lib/learning";
import { courses, findCourse } from "../lib/catalog";

const router: IRouter = Router();

router.get("/guide/dashboard", requireGuide, async (req, res): Promise<void> => {
  const query = GetGuideDashboardQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Choose a supported internship." }); return; }
  const [guide] = await db.select({ supportedCourseIds: internshipGuides.supportedCourseIds })
    .from(internshipGuides).where(eq(internshipGuides.userId, req.learner!.id)).limit(1);
  if (!guide) { res.status(403).json({ error: "Your guide account is not set up yet." }); return; }

  const supportedCourseIds = Array.isArray(guide.supportedCourseIds) ? guide.supportedCourseIds : [];
  const selectedCourseId = query.data.courseId ?? null;
  const allAssignments = await db.select().from(enrollments)
    .where(eq(enrollments.guideId, req.learner!.id))
    .orderBy(desc(enrollments.createdAt));
  const courseCoverage = new Set([...supportedCourseIds, ...allAssignments.map((row) => row.courseId)]);
  const supportedCourses = courses.filter((course) => courseCoverage.has(course.id));
  if (selectedCourseId && !courseCoverage.has(selectedCourseId)) {
    res.status(400).json({ error: "That internship is not in your guide coverage." }); return;
  }

  const assignments = selectedCourseId
    ? allAssignments.filter((row) => row.courseId === selectedCourseId)
    : allAssignments;
  const learnerIds = [...new Set(assignments.map((row) => row.userId))];
  if (!assignments.length) {
    res.set("Cache-Control", "private, no-store");
    res.json(GetGuideDashboardResponse.parse({
      supportedCourses: supportedCourses.map(({ id, title }) => ({ id, title })),
      selectedCourseId, learnerCount: 0, learners: [],
    }));
    return;
  }

  const assignmentIds = assignments.map((row) => row.id);
  const [learnerRows, logs, practices, reading, checks, reportRows] = await Promise.all([
    db.select({
      id: learners.id, name: learners.name, email: learners.email,
      college: learners.college, discipline: learners.discipline,
    }).from(learners).where(inArray(learners.id, learnerIds)),
    db.select({
      id: workLogs.id, enrollmentId: workLogs.enrollmentId, date: workLogs.date,
      hours: workLogs.hours, activity: workLogs.activity, learning: workLogs.learning,
    }).from(workLogs)
      .where(inArray(workLogs.enrollmentId, assignmentIds)),
    db.select({
      userId: practiceAttempts.userId, courseId: practiceAttempts.courseId,
      total: count(), average: avg(practiceAttempts.score),
    }).from(practiceAttempts)
      .where(and(inArray(practiceAttempts.userId, learnerIds), isNotNull(practiceAttempts.score)))
      .groupBy(practiceAttempts.userId, practiceAttempts.courseId),
    db.select({
      userId: studyProgress.userId, courseId: studyProgress.courseId, total: count(),
    }).from(studyProgress)
      .where(and(inArray(studyProgress.userId, learnerIds), eq(studyProgress.read, true)))
      .groupBy(studyProgress.userId, studyProgress.courseId),
    db.select({
      userId: studyTeaching.userId,
      courseId: studyTeaching.courseId,
      total: count(),
      secure: sql<number>`count(*) filter (where ${studyTeaching.verdict} = 'secure')`.mapWith(Number),
    }).from(studyTeaching)
      .where(inArray(studyTeaching.userId, learnerIds))
      .groupBy(studyTeaching.userId, studyTeaching.courseId),
    reportSummariesForUsers(learnerIds),
  ]);
  const pacedAssignments = await enrollmentViews(assignments, logs);
  const learnerMap = new Map(learnerRows.map((row) => [row.id, {
    ...row,
    reports: [] as { id: string; version: number; completedAt: string }[],
    courses: [] as {
      enrollmentId: string; courseId: string; courseTitle: string; hours: number;
      completedModules: number; totalModules: number; loggedHours: number; status: string;
      pacing: (typeof pacedAssignments)[number]["pacing"];
      practiceCount: number; practiceAverage: number | null; lessonsRead: number;
      studyChecks: number; secureChecks: number;
      practicalLogs: { id: string; date: string; hours: number; activity: string; learning: string }[];
    }[],
  }]));
  for (const report of reportRows) learnerMap.get(report.userId)?.reports.push({
    id: report.id, version: report.version, completedAt: report.completedAt,
  });
  const metricKey = (userId: string, courseId: string) => `${userId}\u0000${courseId}`;
  const practiceMap = new Map(practices.map((row) => [metricKey(row.userId, row.courseId), row]));
  const readingMap = new Map(reading.map((row) => [metricKey(row.userId, row.courseId), row.total]));
  const checksMap = new Map(checks.map((row) => [metricKey(row.userId, row.courseId), row]));

  for (let index = 0; index < assignments.length; index++) {
    const enrollment = assignments[index]!;
    const view = pacedAssignments[index]!;
    const course = findCourse(enrollment.courseId);
    const learner = learnerMap.get(enrollment.userId);
    if (!course || !learner) continue;
    const key = metricKey(enrollment.userId, enrollment.courseId);
    const practice = practiceMap.get(key);
    const teaching = checksMap.get(key);
    learner.courses.push({
      enrollmentId: enrollment.id,
      courseId: enrollment.courseId,
      courseTitle: course.title,
      hours: enrollment.hours,
      completedModules: enrollment.completedModules.length,
      totalModules: view.pacing.moduleSchedule.length,
      loggedHours: logs.filter((log) => log.enrollmentId === enrollment.id).reduce((total, log) => total + log.hours, 0),
      status: enrollment.status,
      pacing: view.pacing,
      practiceCount: practice?.total ?? 0,
      practiceAverage: practice?.average == null ? null : Number(practice.average),
      lessonsRead: readingMap.get(key) ?? 0,
      studyChecks: teaching?.total ?? 0,
      secureChecks: teaching?.secure ?? 0,
      practicalLogs: logs.filter((log) => log.enrollmentId === enrollment.id)
        .sort((a, b) => b.date.localeCompare(a.date))
        .map(({ id, date, hours, activity, learning }) => ({ id, date, hours, activity, learning })),
    });
  }

  const result = [...learnerMap.values()].sort((a, b) => a.name.localeCompare(b.name));
  res.set("Cache-Control", "private, no-store");
  res.json(GetGuideDashboardResponse.parse({
    supportedCourses: supportedCourses.map(({ id, title }) => ({ id, title })),
    selectedCourseId,
    learnerCount: result.length,
    learners: result,
  }));
});

router.get("/guide/learners/:learnerId/reports/:reportId", requireGuide, async (req, res): Promise<void> => {
  const params = GetGuideLearningReportParams.safeParse(req.params);
  if (!params.success) { res.status(404).json({ error: "Learning report not found." }); return; }
  const { learnerId, reportId } = params.data;
  const [assigned] = await db.select({ id: enrollments.id }).from(enrollments)
    .where(and(eq(enrollments.guideId, req.learner!.id), eq(enrollments.userId, learnerId))).limit(1);
  const report = assigned ? await savedReport(learnerId, reportId) : null;
  if (!report) { res.status(404).json({ error: "Learning report not found." }); return; }
  await db.insert(guideReportAccess).values({
    id: randomUUID(), guideId: req.learner!.id, learnerId, reportId: report.id,
  });
  res.set("Cache-Control", "private, no-store");
  res.json(GetGuideLearningReportResponse.parse(report));
});

export default router;
