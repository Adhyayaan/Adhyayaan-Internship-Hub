import { Router, type IRouter } from "express";
import { rateLimit } from "express-rate-limit";
import { randomUUID } from "node:crypto";
import { db, learners } from "@workspace/db";
import { eq } from "drizzle-orm";
import { RegisterBody, LoginBody, GetSessionResponse } from "@workspace/api-zod";
import { publicUser, hashPassword, verifyPassword, createSession, clearSession } from "../lib/auth";

const router: IRouter = Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 15, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "Too many attempts. Please try again in 15 minutes." } });

router.get("/auth/me", (req, res) => {
  res.json(GetSessionResponse.parse({ user: req.learner ? publicUser(req.learner) : null }));
});
router.post("/auth/register", limiter, async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Use a valid email, a name, and a password of 10–128 characters." }); return; }
  const data = parsed.data;
  if (data.name.trim().length < 2) { res.status(400).json({ error: "Please enter your name." }); return; }
  const passwordHash = await hashPassword(data.password);
  const [user] = await db.insert(learners).values({
    id: randomUUID(), name: data.name.trim(), email: data.email.toLowerCase().trim(), passwordHash,
    college: data.college.trim(), discipline: data.discipline.trim(), assessmentRequired: true,
  }).onConflictDoNothing({ target: learners.email }).returning();
  if (!user) { res.status(409).json({ error: "An account with this email already exists. Please sign in." }); return; }
  await createSession(req, res, user.id);
  res.status(201).json(GetSessionResponse.parse({ user: publicUser(user) }));
});
router.post("/auth/login", limiter, async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Please enter a valid email and password." }); return; }
  const [user] = await db.select().from(learners).where(eq(learners.email, parsed.data.email.toLowerCase().trim())).limit(1);
  // A dummy hash performs equivalent work when the email is unknown.
  const valid = await verifyPassword(parsed.data.password, user?.passwordHash ?? `${"0".repeat(32)}:${"0".repeat(128)}`);
  if (!user || !valid) { res.status(401).json({ error: "The email or password is incorrect." }); return; }
  await createSession(req, res, user.id);
  res.json(GetSessionResponse.parse({ user: publicUser(user) }));
});
router.post("/auth/logout", async (req, res): Promise<void> => {
  await clearSession(req, res);
  res.json({ success: true });
});
export default router;
