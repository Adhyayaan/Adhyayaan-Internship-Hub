import { rateLimit } from "express-rate-limit";
import type { Request, Response, NextFunction } from "express";

export const aiLimit = rateLimit({ windowMs: 60_000, limit: 8, keyGenerator: (req) => req.learner!.id, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "Please wait a minute before requesting more AI assistance." } });
const activeRequests = new Set<string>();
export function oneAtATime(req: Request, res: Response, next: NextFunction) {
  const id = req.learner!.id;
  if (activeRequests.has(id)) { res.status(429).json({ error: "Your previous AI request is still being prepared. Please wait for it to finish." }); return; }
  activeRequests.add(id);
  res.once("finish", () => activeRequests.delete(id));
  res.once("close", () => activeRequests.delete(id));
  next();
}
