import { db, enrollmentPortfolioFiles, enrollments, learners, workLogs, type LearningEnrollment } from "@workspace/db";
import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { findCourse } from "./catalog";
import { getProjectFileExtension } from "./project-rules";
import {
  calculatePacing,
  completedHoursFor,
  indiaCalendarDate,
  indiaDateWindow,
  type PacingCourse,
} from "./pacing";

export async function userLogs(userId: string) {
  return db.select().from(workLogs).where(eq(workLogs.userId, userId)).orderBy(desc(workLogs.date));
}
export function enrollmentView(
  row: LearningEnrollment,
  logs: { enrollmentId: string; hours: number }[],
  assignedGuide: { id: string; name: string; email: string } | null = null,
  files: (typeof enrollmentPortfolioFiles.$inferSelect)[] = [],
) {
  const course = findCourse(row.courseId);
  if (!course) throw new Error("Enrollment refers to an unknown course.");
  return {
    id: row.id, course, hours: row.hours, completedModules: row.completedModules,
    loggedHours: logs.filter((l) => l.enrollmentId === row.id).reduce((sum, l) => sum + l.hours, 0),
    projectUrl: row.projectUrl, reflection: row.reflection, status: row.status, createdAt: row.createdAt.toISOString(),
    assignedGuide,
    portfolioFiles: files.map((file) => ({
      id: file.id,
      fileName: file.fileName,
      contentType: file.contentType,
      size: file.size,
      downloadUrl: `/api/projects/portfolio-files/${file.id}`,
      isArchive: getProjectFileExtension(file.fileName) === ".zip",
    })),
  };
}

type EnrollmentRow = LearningEnrollment;

function cohortKey(row: EnrollmentRow) {
  return `${row.courseId}:${row.hours}:${indiaCalendarDate(row.createdAt)}`;
}

export async function enrollmentViews(rows: EnrollmentRow[], logs: { enrollmentId: string; hours: number }[]) {
  const now = new Date();
  const guideIds = [...new Set(rows.map((row) => row.guideId).filter((id): id is string => !!id))];
  const guides = guideIds.length
    ? await db.select({ id: learners.id, name: learners.name, email: learners.email })
      .from(learners).where(inArray(learners.id, guideIds))
    : [];
  const portfolioFiles = rows.length
    ? await db.select().from(enrollmentPortfolioFiles)
      .where(inArray(enrollmentPortfolioFiles.enrollmentId, rows.map((row) => row.id)))
      .orderBy(enrollmentPortfolioFiles.createdAt)
    : [];
  const guidesById = new Map(guides.map((guide) => [guide.id, guide]));
  const filesByEnrollment = new Map<string, typeof portfolioFiles>();
  for (const file of portfolioFiles) {
    const files = filesByEnrollment.get(file.enrollmentId) ?? [];
    files.push(file);
    filesByEnrollment.set(file.enrollmentId, files);
  }
  const baseViews = rows.map((row) => enrollmentView(
    row,
    logs,
    row.guideId ? guidesById.get(row.guideId) ?? null : null,
    filesByEnrollment.get(row.id) ?? [],
  ));
  const cohortRows = new Map<string, { course: PacingCourse; scores: number[] }>();

  await Promise.all([...new Map(rows.map((row) => [cohortKey(row), row])).entries()].map(async ([key, row]) => {
    const course = findCourse(row.courseId);
    if (!course) throw new Error("Enrollment refers to an unknown course.");
    const day = indiaCalendarDate(row.createdAt);
    const { start, end } = indiaDateWindow(day);
    const peers = await db.select({ completedModules: enrollments.completedModules })
      .from(enrollments)
      .where(and(
        eq(enrollments.courseId, row.courseId),
        eq(enrollments.hours, row.hours),
        gte(enrollments.createdAt, start),
        lt(enrollments.createdAt, end),
      ));
    cohortRows.set(key, {
      course,
      scores: peers.map((peer) => completedHoursFor(course, row.hours, peer.completedModules) / row.hours * 100),
    });
  }));

  return rows.map((row, index) => {
    const key = cohortKey(row);
    const group = cohortRows.get(key);
    if (!group) throw new Error("Could not load the enrolment cohort.");
    return {
      ...baseViews[index],
      pacing: calculatePacing({
        course: group.course,
        hours: row.hours,
        completedModules: row.completedModules,
        startedAt: row.createdAt,
        cohortScores: group.scores,
        now,
      }),
    };
  });
}

export async function enrollmentViewWithPacing(row: EnrollmentRow, logs: { enrollmentId: string; hours: number }[]) {
  const [view] = await enrollmentViews([row], logs);
  return view;
}

export async function userEnrollments(userId: string) {
  const [rows, logs] = await Promise.all([
    db.select().from(enrollments).where(eq(enrollments.userId, userId)).orderBy(desc(enrollments.createdAt)),
    userLogs(userId),
  ]);
  return enrollmentViews(rows, logs);
}
