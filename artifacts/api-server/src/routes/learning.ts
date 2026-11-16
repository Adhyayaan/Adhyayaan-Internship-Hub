import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { db, enrollments, workLogs } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import {
  GetCourseParams, GetCourseResponse, ListCoursesResponse, GetDashboardResponse,
  EnrollBody, EnrollResponse, ListEnrollmentsResponse, UpdateEnrollmentParams, UpdateEnrollmentBody, UpdateEnrollmentResponse,
  ListLogsResponse, CreateLogBody, CreateLogResponse, DeleteLogParams,
} from "@workspace/api-zod";
import { courses, findCourse } from "../lib/catalog";
import { requireLearner, publicUser } from "../lib/auth";
import { userEnrollments, userLogs, enrollmentView } from "../lib/learning";

const router: IRouter = Router();
router.get("/courses", (_req, res) => { res.json(ListCoursesResponse.parse(courses)); });
router.get("/courses/:id", (req, res): void => {
  const params = GetCourseParams.safeParse(req.params);
  const course = params.success ? findCourse(params.data.id) : undefined;
  if (!course) { res.status(404).json({ error: "Internship not found." }); return; }
  res.json(GetCourseResponse.parse(course));
});
router.get("/dashboard", async (req, res): Promise<void> => {
  if (!req.learner) {
    const course = courses[0]!;
    res.json(GetDashboardResponse.parse({
      preview: true, user: null,
      stats: { activeInternships: 1, learningHours: 18, completedModules: 3, submittedProjects: 0 },
      enrollments: [{
        id: "preview", course, hours: 60, completedModules: course.modules.slice(0, 3).map((m) => m.id), loggedHours: 18,
        projectUrl: "", reflection: "", status: "in_progress", createdAt: "2026-11-01T00:00:00.000Z",
      }],
      recommendations: [courses[9], courses[10], courses[2]],
      activity: [
        { id: "sample-1", text: "Sample: completed Questionnaire design", date: "2026-11-16", type: "module" },
        { id: "sample-2", text: "Sample: recorded 3 hours of practical work", date: "2026-11-15", type: "log" },
      ],
    })); return;
  }
  const [items, logs] = await Promise.all([userEnrollments(req.learner.id), userLogs(req.learner.id)]);
  const relevant = courses.filter((c) => !items.some((e) => e.course.id === c.id))
    .sort((a, b) => Number(b.disciplines.some((d) => d.toLowerCase() === req.learner!.discipline.toLowerCase())) - Number(a.disciplines.some((d) => d.toLowerCase() === req.learner!.discipline.toLowerCase()))).slice(0, 3);
  const activity = [
    ...logs.slice(0, 8).map((l) => ({ id: l.id, text: `Logged ${l.hours}h: ${l.activity}`, date: l.date, type: "log" })),
    ...items.map((e) => ({ id: e.id, text: `Started ${e.course.title}`, date: e.createdAt.slice(0, 10), type: "enrollment" })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  res.json(GetDashboardResponse.parse({
    preview: false, user: publicUser(req.learner),
    stats: { activeInternships: items.length, learningHours: logs.reduce((s, l) => s + l.hours, 0), completedModules: items.reduce((s, e) => s + e.completedModules.length, 0), submittedProjects: items.filter((e) => e.status === "submitted").length },
    enrollments: items, recommendations: relevant, activity,
  }));
});
router.get("/enrollments", requireLearner, async (req, res): Promise<void> => {
  res.json(ListEnrollmentsResponse.parse(await userEnrollments(req.learner!.id)));
});
router.post("/enrollments", requireLearner, async (req, res): Promise<void> => {
  const parsed = EnrollBody.safeParse(req.body);
  if (!parsed.success || !findCourse(parsed.data.courseId)) { res.status(400).json({ error: "Choose an available internship and a 60- or 120-hour pathway." }); return; }
  const [created] = await db.insert(enrollments).values({ id: randomUUID(), userId: req.learner!.id, ...parsed.data }).onConflictDoNothing().returning();
  if (!created) { res.status(409).json({ error: "You already have a pathway for this internship. Open My learning to continue." }); return; }
  res.status(201).json(EnrollResponse.parse(enrollmentView(created, [])));
});
router.patch("/enrollments/:id", requireLearner, async (req, res): Promise<void> => {
  const params = UpdateEnrollmentParams.safeParse(req.params);
  const parsed = UpdateEnrollmentBody.safeParse(req.body);
  if (!params.success || !parsed.success) { res.status(400).json({ error: "Invalid progress update." }); return; }
  const owner = and(eq(enrollments.id, params.data.id), eq(enrollments.userId, req.learner!.id));
  const [existing] = await db.select().from(enrollments).where(owner).limit(1);
  if (!existing) { res.status(404).json({ error: "Learning pathway not found." }); return; }
  const data = parsed.data;
  const modules = findCourse(existing.courseId)!.modules.filter((m) => existing.hours === 120 ? m.hours120 > 0 || m.hours60 > 0 : m.hours60 > 0);
  if (data.completedModules && (new Set(data.completedModules).size !== data.completedModules.length || data.completedModules.some((id) => !modules.some((m) => m.id === id)))) {
    res.status(400).json({ error: "Choose valid modules for your selected pathway." }); return;
  }
  const projectUrl = data.projectUrl ?? existing.projectUrl;
  if (projectUrl) {
    try { if (!["http:", "https:"].includes(new URL(projectUrl).protocol)) throw new Error(); }
    catch { res.status(400).json({ error: "Provide a valid http or https portfolio/repository link." }); return; }
  }
  const logs = await userLogs(req.learner!.id);
  const reflection = data.reflection ?? existing.reflection;
  const completedModules = data.completedModules ?? existing.completedModules;
  if (data.submit) {
    const hours = logs.filter((l) => l.enrollmentId === existing.id).reduce((s, l) => s + l.hours, 0);
    if (!projectUrl || reflection.trim().length < 30 || hours < existing.hours || !modules.every((m) => completedModules.includes(m.id))) {
      res.status(400).json({ error: `Before submitting, complete all pathway modules, record ${existing.hours} practical hours, add a project link and a reflection of at least 30 characters. You can save a draft at any time.` }); return;
    }
  }
  // Any edit invalidates an earlier submission and requires the learner to resubmit.
  const [updated] = await db.update(enrollments).set({ projectUrl, reflection, completedModules, status: data.submit ? "submitted" : "in_progress" }).where(owner).returning();
  res.json(UpdateEnrollmentResponse.parse(enrollmentView(updated!, logs)));
});
router.get("/logs", requireLearner, async (req, res): Promise<void> => {
  res.json(ListLogsResponse.parse(await userLogs(req.learner!.id)));
});
router.post("/logs", requireLearner, async (req, res): Promise<void> => {
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
router.delete("/logs/:id", requireLearner, async (req, res): Promise<void> => {
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
