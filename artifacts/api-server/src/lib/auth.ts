import { randomBytes, createHash, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Request, Response, NextFunction } from "express";
import { db, learners, learnerSessions, type Learner } from "@workspace/db";
import { and, eq, gt } from "drizzle-orm";

const scrypt = promisify(scryptCallback);
const cookieName = "adhyayaan_session";
const digest = (token: string) => createHash("sha256").update(token).digest("hex");

declare global {
  namespace Express {
    interface Request { learner?: Learner }
  }
}

export function publicUser(user: Learner) {
  return { id: user.id, name: user.name, email: user.email, college: user.college, discipline: user.discipline };
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, 64) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const hash = await scrypt(password, salt, 64) as Buffer;
  const buffer = Buffer.from(expected, "hex");
  return hash.length === buffer.length && timingSafeEqual(hash, buffer);
}

export async function createSession(req: Request, res: Response, userId: string) {
  const old = req.cookies?.[cookieName];
  if (typeof old === "string") await db.delete(learnerSessions).where(eq(learnerSessions.tokenHash, digest(old)));
  const token = randomBytes(32).toString("base64url");
  const maxAge = 7 * 24 * 60 * 60 * 1000;
  await db.insert(learnerSessions).values({ tokenHash: digest(token), userId, expiresAt: new Date(Date.now() + maxAge) });
  const secure = req.secure || process.env.NODE_ENV === "production";
  // HTTPS previews can be embedded cross-site; Origin checks protect mutations.
  res.cookie(cookieName, token, { httpOnly: true, secure, sameSite: secure ? "none" : "lax", maxAge, path: "/" });
}

export async function clearSession(req: Request, res: Response) {
  const token = req.cookies?.[cookieName];
  if (typeof token === "string") await db.delete(learnerSessions).where(eq(learnerSessions.tokenHash, digest(token)));
  const secure = req.secure || process.env.NODE_ENV === "production";
  res.clearCookie(cookieName, { path: "/", httpOnly: true, sameSite: secure ? "none" : "lax", secure });
}

export async function loadLearner(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[cookieName];
    if (typeof token === "string" && token.length < 128) {
      const [row] = await db.select({ user: learners }).from(learnerSessions)
        .innerJoin(learners, eq(learnerSessions.userId, learners.id))
        .where(and(eq(learnerSessions.tokenHash, digest(token)), gt(learnerSessions.expiresAt, new Date()))).limit(1);
      if (row) req.learner = row.user;
    }
    next();
  } catch (error) { next(error); }
}

export function requireLearner(req: Request, res: Response, next: NextFunction) {
  if (!req.learner) { res.status(401).json({ error: "Please sign in to save your learning progress." }); return; }
  next();
}
