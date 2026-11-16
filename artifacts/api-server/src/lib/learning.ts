import { db, enrollments, workLogs, type LearningEnrollment } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { findCourse } from "./catalog";

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
export async function userEnrollments(userId: string) {
  const [rows, logs] = await Promise.all([
    db.select().from(enrollments).where(eq(enrollments.userId, userId)).orderBy(desc(enrollments.createdAt)),
    userLogs(userId),
  ]);
  return rows.map((r) => enrollmentView(r, logs));
}
