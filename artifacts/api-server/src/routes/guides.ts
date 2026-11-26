import { Router } from "express";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import {
  db,
  enrollments,
  guideProfiles,
  learners,
  workLogs,
} from "@workspace/db";
import {
  ConfigureGuideBody,
  GetGuideWorkspaceResponse,
  GetGuidePoolResponse,
} from "@workspace/api-zod";
import { requireAdmin, requireLearner } from "../lib/auth";
import { findCourse } from "../lib/catalog";
import { assignWaiting, lockPool } from "../lib/guides";
import { pathwayPace } from "../lib/pacing";

const router = Router();
router.get("/admin/guide-pool", requireAdmin, async (_req, res) => {
  const list = await db
    .select({
      accountId: guideProfiles.accountId,
      name: learners.name,
      capacity: guideProfiles.capacity,
      courseIds: guideProfiles.courseIds,
      assigned: sql<number>`count(${enrollments.id})::int`,
    })
    .from(guideProfiles)
    .innerJoin(learners, eq(learners.id, guideProfiles.accountId))
    .leftJoin(enrollments, eq(enrollments.guideId, guideProfiles.accountId))
    .groupBy(guideProfiles.accountId, learners.name)
    .orderBy(asc(learners.name));
  res.json(GetGuidePoolResponse.parse(list));
});
router.put("/admin/guide-pool", requireAdmin, async (req, res) => {
  const input = ConfigureGuideBody.safeParse(req.body);
  if (!input.success || input.data.courseIds.some((id) => !findCourse(id))) {
    res
      .status(400)
      .json({ error: "Choose valid courses and a capacity from 0 to 500." });
    return;
  }
  const { accountId, capacity, courseIds } = input.data;
  const saved = await db.transaction(async (tx) => {
    await lockPool(tx);
    const [user] = await tx
      .update(learners)
      .set({ role: "guide" })
      .where(and(eq(learners.id, accountId), ne(learners.role, "admin")))
      .returning({ id: learners.id });
    if (!user) return false;
    await tx
      .insert(guideProfiles)
      .values({ accountId, capacity, courseIds })
      .onConflictDoUpdate({
        target: guideProfiles.accountId,
        set: { capacity, courseIds },
      });
    await assignWaiting(tx);
    return true;
  });
  if (!saved) {
    res
      .status(400)
      .json({ error: "Choose an existing non-administrator account." });
    return;
  }
  res.json({ saved });
});
router.get("/guide/workspace", requireLearner, async (req, res) => {
  if (req.learner!.role !== "guide") {
    res.status(403).json({ error: "Internship guide access required." });
    return;
  }
  const rows = await db
    .select({
      e: enrollments,
      name: learners.name,
      email: learners.email,
      college: learners.college,
      discipline: learners.discipline,
    })
    .from(enrollments)
    .innerJoin(learners, eq(learners.id, enrollments.userId))
    .where(eq(enrollments.guideId, req.learner!.id))
    .orderBy(learners.name);
  const logs = rows.length
    ? await db
        .select()
        .from(workLogs)
        .where(
          inArray(
            workLogs.enrollmentId,
            rows.map((r) => r.e.id),
          ),
        )
        .orderBy(desc(workLogs.date))
    : [];
  res.json(
    GetGuideWorkspaceResponse.parse(
      rows.map(({ e, ...student }) => {
        const course = findCourse(e.courseId)!;
        const pace = pathwayPace(e, course.modules);
        const work = logs.filter((l) => l.enrollmentId === e.id);
        return {
          ...student,
          id: e.id,
          title: course.title,
          courseId: e.courseId,
          logged: work.reduce((s, l) => s + l.hours, 0),
          target: e.hours,
          completed: pace.chapters.filter((c) => c.done).length,
          chapters: pace.chapters.length,
          percent: pace.percent,
          deltaHours: pace.deltaHours,
          status: e.status,
          projectUrl: e.projectUrl,
          reflection: e.reflection,
          logs: work,
        };
      }),
    ),
  );
});
export default router;
