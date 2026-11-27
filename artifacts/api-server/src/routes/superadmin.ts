import { randomBytes, randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, count, desc, eq, ilike, inArray, isNotNull, ne, or, sql, sum } from "drizzle-orm";
import {
  adminReportAccess, assessmentAttempts, db, enrollments, guideReportAccess, internshipGuides,
  learnerSessions, learners, superadminGuidePasswordAudit, superadminRoleAudit, workLogs,
} from "@workspace/db";
import {
  CreateSuperadminGuideBody, CreateSuperadminGuideResponse, GetSuperadminAnalyticsResponse,
  ListSuperadminAccountsQueryParams, ListSuperadminAccountsResponse,
  ResetSuperadminGuidePasswordParams, ResetSuperadminGuidePasswordResponse,
  UpdateSuperadminAccountRoleBody, UpdateSuperadminAccountRoleParams, UpdateSuperadminAccountRoleResponse,
} from "@workspace/api-zod";
import { hashPassword } from "../lib/auth";
import { findCourse } from "../lib/catalog";
import { lockGuideAssignmentPool } from "../lib/guide-assignment";
import { requireSuperadmin } from "../lib/auth";

const router: IRouter = Router();
const pageSize = 25;

router.use("/superadmin", requireSuperadmin);

router.get("/superadmin/analytics", async (_req, res): Promise<void> => {
  const [
    [accountTotals],
    [enrollmentTotals],
    [hours],
    [reports],
    [adminViews],
    [guideViews],
    courseRows,
    auditRows,
  ] = await Promise.all([
    db.select({
      totalAccounts: count(),
      studentCount: sql<number>`count(*) filter (where ${learners.role} = 'student')`.mapWith(Number),
      adminCount: sql<number>`count(*) filter (where ${learners.role} = 'admin')`.mapWith(Number),
      guideCount: sql<number>`count(*) filter (where ${learners.role} = 'guide')`.mapWith(Number),
      superadminCount: sql<number>`count(*) filter (where ${learners.role} = 'superadmin')`.mapWith(Number),
    }).from(learners),
    db.select({
      enrollmentCount: count(),
      activeEnrollmentCount: sql<number>`count(*) filter (where ${enrollments.status} <> 'completed')`.mapWith(Number),
      completedEnrollmentCount: sql<number>`count(*) filter (where ${enrollments.status} = 'completed')`.mapWith(Number),
    }).from(enrollments),
    db.select({ total: sum(workLogs.hours) }).from(workLogs),
    db.select({ total: count() }).from(assessmentAttempts).where(isNotNull(assessmentAttempts.report)),
    db.select({ total: count() }).from(adminReportAccess),
    db.select({ total: count() }).from(guideReportAccess),
    db.select({
      courseId: enrollments.courseId,
      enrollmentCount: count(),
      activeEnrollmentCount: sql<number>`count(*) filter (where ${enrollments.status} <> 'completed')`.mapWith(Number),
      completedEnrollmentCount: sql<number>`count(*) filter (where ${enrollments.status} = 'completed')`.mapWith(Number),
    }).from(enrollments).groupBy(enrollments.courseId).orderBy(desc(count()), enrollments.courseId),
    db.select({
      id: superadminRoleAudit.id,
      actorId: superadminRoleAudit.actorId,
      targetId: superadminRoleAudit.targetId,
      previousRole: superadminRoleAudit.previousRole,
      newRole: superadminRoleAudit.newRole,
      createdAt: superadminRoleAudit.createdAt,
    }).from(superadminRoleAudit).orderBy(desc(superadminRoleAudit.createdAt)).limit(12),
  ]);

  const userIds = [...new Set(auditRows.flatMap((row) => [row.actorId, row.targetId].filter((id): id is string => !!id)))];
  const nameRows = userIds.length
    ? await db.select({ id: learners.id, name: learners.name }).from(learners).where(inArray(learners.id, userIds))
    : [];
  const names = new Map(nameRows.map((row) => [row.id, row.name]));

  res.json(GetSuperadminAnalyticsResponse.parse({
    ...accountTotals,
    ...enrollmentTotals,
    loggedPracticalHours: Number(hours?.total ?? 0),
    savedReportCount: reports?.total ?? 0,
    adminReportViews: adminViews?.total ?? 0,
    guideReportViews: guideViews?.total ?? 0,
    courseTotals: courseRows.map((row) => ({
      courseId: row.courseId,
      title: findCourse(row.courseId)?.title ?? `Archived course ${row.courseId}`,
      enrollmentCount: row.enrollmentCount,
      activeEnrollmentCount: row.activeEnrollmentCount,
      completedEnrollmentCount: row.completedEnrollmentCount,
    })),
    recentRoleChanges: auditRows.map((row) => ({
      id: row.id,
      actorName: row.actorId ? names.get(row.actorId) ?? null : null,
      targetName: row.targetId ? names.get(row.targetId) ?? null : null,
      previousRole: row.previousRole,
      newRole: row.newRole,
      createdAt: row.createdAt,
    })),
  }));
});

router.post("/superadmin/guides", async (req, res): Promise<void> => {
  const input = CreateSuperadminGuideBody.safeParse(req.body);
  if (!input.success || input.data.name.trim().length < 2) {
    res.status(400).json({ error: "Enter a name, valid email and at least one supported internship." });
    return;
  }
  const supportedCourseIds = [...new Set(input.data.supportedCourseIds)];
  if (supportedCourseIds.some((courseId) => !findCourse(courseId))) {
    res.status(400).json({ error: "Choose internships from the available course list." });
    return;
  }

  const email = input.data.email.trim().toLowerCase();
  const temporaryPassword = randomBytes(24).toString("base64url");
  const passwordHash = await hashPassword(temporaryPassword);
  const userId = randomUUID();
  let emailExists = false;

  try {
    await db.transaction(async (tx) => {
      await lockGuideAssignmentPool(tx);
      const [existing] = await tx.select({ id: learners.id }).from(learners)
        .where(sql`lower(${learners.email}) = ${email}`).limit(1);
      if (existing) { emailExists = true; return; }

      await tx.insert(learners).values({
        id: userId,
        name: input.data.name.trim(),
        email,
        passwordHash,
        mustChangePassword: true,
      });
      await tx.update(learners).set({ role: "guide" }).where(eq(learners.id, userId));
      await tx.insert(internshipGuides).values({
        userId,
        supportedCourseIds,
        availableForAssignments: input.data.availableForAssignments ?? true,
      });
      await tx.insert(superadminRoleAudit).values({
        id: randomUUID(),
        actorId: req.learner!.id,
        targetId: userId,
        previousRole: "student",
        newRole: "guide",
      });
    });
  } catch (error) {
    const failure = error as { code?: string; cause?: { code?: string } };
    if (failure.code === "23505" || failure.cause?.code === "23505") emailExists = true;
    else throw error;
  }
  if (emailExists) { res.status(409).json({ error: "An account with this email already exists." }); return; }

  res.status(201).json(CreateSuperadminGuideResponse.parse({
    guide: {
      id: userId,
      name: input.data.name.trim(),
      email,
      supportedCourseIds,
      availableForAssignments: input.data.availableForAssignments ?? true,
      activeLearners: 0,
    },
    temporaryPassword,
    mustChangePassword: true,
  }));
});

router.post("/superadmin/guides/:id/temporary-password", async (req, res): Promise<void> => {
  const params = ResetSuperadminGuidePasswordParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Choose a valid guide account." });
    return;
  }

  const temporaryPassword = randomBytes(24).toString("base64url");
  const passwordHash = await hashPassword(temporaryPassword);
  let guideFound = false;

  await db.transaction(async (tx) => {
    const [guide] = await tx.select({ id: learners.id })
      .from(learners)
      .where(and(eq(learners.id, params.data.id), eq(learners.role, "guide")))
      .for("update")
      .limit(1);
    if (!guide) return;

    guideFound = true;
    await tx.update(learners).set({ passwordHash, mustChangePassword: true })
      .where(eq(learners.id, guide.id));
    await tx.delete(learnerSessions).where(eq(learnerSessions.userId, guide.id));
    await tx.insert(superadminGuidePasswordAudit).values({
      id: randomUUID(),
      actorId: req.learner!.id,
      targetId: guide.id,
    });
  });

  if (!guideFound) {
    res.status(404).json({ error: "Guide account not found." });
    return;
  }
  res.json(ResetSuperadminGuidePasswordResponse.parse({
    temporaryPassword,
    mustChangePassword: true,
  }));
});

router.get("/superadmin/accounts", async (req, res): Promise<void> => {
  const parsed = ListSuperadminAccountsQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: "Check the account search, role filter or page number." }); return; }
  const { search, role = "all", page = 1 } = parsed.data;
  const term = `%${(search ?? "").trim().replace(/[\\%_]/g, "\\$&")}%`;
  const matches = and(
    term !== "%%" ? or(
      ilike(learners.name, term),
      ilike(learners.email, term),
      ilike(learners.college, term),
      ilike(learners.discipline, term),
    ) : undefined,
    role !== "all" ? eq(learners.role, role) : undefined,
  );
  const [rows, matchCount] = await Promise.all([
    db.select({
      id: learners.id,
      name: learners.name,
      email: learners.email,
      college: learners.college,
      discipline: learners.discipline,
      role: learners.role,
      createdAt: learners.createdAt,
      enrollmentCount: db.$count(enrollments, eq(enrollments.userId, learners.id)),
    }).from(learners).where(matches).orderBy(desc(learners.createdAt), learners.id)
      .limit(pageSize).offset((page - 1) * pageSize),
    db.$count(learners, matches),
  ]);
  res.json(ListSuperadminAccountsResponse.parse({ accounts: rows, page, pageSize, matchCount }));
});

router.patch("/superadmin/accounts/:id/role", async (req, res): Promise<void> => {
  const params = UpdateSuperadminAccountRoleParams.safeParse(req.params);
  const input = UpdateSuperadminAccountRoleBody.safeParse(req.body);
  if (!params.success || !input.success) {
    res.status(400).json({ error: "Choose a valid account and role." });
    return;
  }
  if (params.data.id === req.learner!.id) {
    res.status(409).json({ error: "You cannot change your own Superadmin role." });
    return;
  }

  let result: {
    id: string; name: string; email: string; college: string; discipline: string;
    role: string; createdAt: Date; enrollmentCount: number;
  } | null = null;
  let failure: "not_found" | "last_superadmin" | null = null;

  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('adhyayaan-superadmin-role-changes'))`);
    const [target] = await tx.select({
      id: learners.id,
      name: learners.name,
      email: learners.email,
      college: learners.college,
      discipline: learners.discipline,
      role: learners.role,
      createdAt: learners.createdAt,
    }).from(learners).where(eq(learners.id, params.data.id)).limit(1);
    if (!target) { failure = "not_found"; return; }

    const nextRole = input.data.role;
    if (target.role === "superadmin" && nextRole !== "superadmin") {
      const [superadminTotal] = await tx.select({ total: count() }).from(learners).where(eq(learners.role, "superadmin"));
      if ((superadminTotal?.total ?? 0) <= 1) { failure = "last_superadmin"; return; }
    }

    if (target.role !== nextRole) {
      if (target.role === "guide") {
        await lockGuideAssignmentPool(tx);
        await tx.update(enrollments).set({ guideId: null })
          .where(and(eq(enrollments.guideId, target.id), ne(enrollments.status, "completed")));
        await tx.delete(internshipGuides).where(eq(internshipGuides.userId, target.id));
      }
      await tx.update(learners).set({ role: nextRole }).where(eq(learners.id, target.id));
      await tx.insert(superadminRoleAudit).values({
        id: randomUUID(),
        actorId: req.learner!.id,
        targetId: target.id,
        previousRole: target.role,
        newRole: nextRole,
      });
    }
    result = {
      ...target,
      role: nextRole,
      enrollmentCount: await tx.$count(enrollments, eq(enrollments.userId, target.id)),
    };
  });

  if (failure === "not_found") { res.status(404).json({ error: "Account not found." }); return; }
  if (failure === "last_superadmin") {
    res.status(409).json({ error: "Promote another account before removing the last Superadmin." });
    return;
  }
  if (!result) { res.status(500).json({ error: "The account role could not be updated." }); return; }
  res.json(UpdateSuperadminAccountRoleResponse.parse(result));
});

export default router;
