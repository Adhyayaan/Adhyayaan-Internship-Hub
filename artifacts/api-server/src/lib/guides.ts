import { db, enrollments, learners } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { findCourse } from "./catalog";
import { localDay, pathwayPace, standing } from "./pacing";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// The pool is shared across courses. Enrolment and roster edits take the
// same transaction lock so simultaneous requests cannot claim the last seat.
export const lockPool = (tx: Transaction) =>
  tx.execute(sql`select pg_advisory_xact_lock(61328471)`);
export async function assignWaiting(tx: Transaction) {
  const waiting = await tx
    .select({
      id: enrollments.id,
      userId: enrollments.userId,
      course: enrollments.courseId,
    })
    .from(enrollments)
    .where(sql`${enrollments.guideId} is null`)
    .orderBy(enrollments.createdAt, enrollments.id);
  if (!waiting.length) return;
  const pool = await tx.execute<{
    account_id: string;
    course_ids: string[];
    remaining: number;
  }>(sql`
    select g.account_id, g.course_ids, (g.capacity - count(e.id))::int as remaining
    from internship_guide_profiles g join learners u on u.id=g.account_id and u.role='guide'
    left join learning_enrollments e on e.guide_id=g.account_id
    group by g.account_id order by g.account_id`);
  for (const student of waiting) {
    const guide = pool.rows
      .filter(
        (g) =>
          g.remaining > 0 &&
          g.account_id !== student.userId &&
          g.course_ids.includes(student.course),
      )
      .sort((a, b) => b.remaining - a.remaining)[0];
    if (!guide) continue;
    await tx
      .update(enrollments)
      .set({ guideId: guide.account_id })
      .where(eq(enrollments.id, student.id));
    guide.remaining--;
  }
}

export async function learnerPacing(userId: string) {
  const indiaDay = sql`(learning_enrollments.created_at at time zone 'Asia/Kolkata')::date`;
  const rows = await db
    .select({ e: enrollments, guide: learners.name })
    .from(enrollments)
    .leftJoin(learners, eq(learners.id, enrollments.guideId))
    .where(sql`exists (select 1 from learning_enrollments mine where mine.user_id=${userId}
      and mine.course_id=learning_enrollments.course_id
      and (mine.created_at at time zone 'Asia/Kolkata')::date=${indiaDay})`);
  const now = new Date();
  const results = rows.map(({ e, guide }) => {
    const course = findCourse(e.courseId)!;
    return {
      e,
      guide,
      title: course.title,
      pace: pathwayPace(e, course.modules, now),
    };
  });
  return results
    .filter((r) => r.e.userId === userId)
    .map(({ e, guide, title, pace }) => {
      const scores = results
        .filter(
          (r) =>
            r.e.courseId === e.courseId &&
            localDay(r.e.createdAt) === localDay(e.createdAt),
        )
        .map((r) => r.pace.percent);
      return {
        ...pace,
        enrollmentId: e.id,
        title,
        guideName: guide ?? "",
        cohortSize: scores.length,
        percentile: standing(pace.percent, scores),
      };
    });
}
