import { db, enrollments, workLogs, type LearningEnrollment } from "@workspace/db";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import { findCourse } from "./catalog";
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
export function enrollmentView(row: LearningEnrollment, logs: { enrollmentId: string; hours: number }[]) {
  const course = findCourse(row.courseId);
  if (!course) throw new Error("Enrollment refers to an unknown course.");
  return {
    id: row.id, course, hours: row.hours, completedModules: row.completedModules,
    loggedHours: logs.filter((l) => l.enrollmentId === row.id).reduce((sum, l) => sum + l.hours, 0),
    projectUrl: row.projectUrl, reflection: row.reflection, status: row.status, createdAt: row.createdAt.toISOString(),
  };
}

type EnrollmentRow = LearningEnrollment;

function cohortKey(row: EnrollmentRow) {
  return `${row.courseId}:${row.hours}:${indiaCalendarDate(row.createdAt)}`;
}

async function enrollmentViews(rows: EnrollmentRow[], logs: { enrollmentId: string; hours: number }[]) {
  const now = new Date();
  const baseViews = rows.map((row) => enrollmentView(row, logs));
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
