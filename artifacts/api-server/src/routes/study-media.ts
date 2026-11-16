import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import path from "node:path";
import { findStudyModule } from "../lib/study-content";
import { chapterDiagram, chapterVideo } from "../lib/study-media";

const router: IRouter = Router();
const limit = rateLimit({ windowMs: 60_000, limit: 90, standardHeaders: "draft-7", legacyHeaders: false });
const videoLimit = rateLimit({
  windowMs: 15 * 60_000, limit: 32, standardHeaders: "draft-7", legacyHeaders: false,
  message: { error: "Too many lesson videos were requested. Please try again in a few minutes." },
});
function protectGeneratedVideo(req: Request, res: Response, next: NextFunction) {
  if (!String(req.params.file).endsWith(".mp4")) { next(); return; }
  if (!req.learner) { res.status(401).json({ error: "Sign in to generate and play narrated lessons." }); return; }
  videoLimit(req, res, next);
}

router.get("/study-media/mentor-avatar.png", limit, (_req, res) => {
  res.set("Cache-Control", "public, max-age=86400");
  res.type("image/png").sendFile(path.resolve(process.cwd(), "assets", "mentor-avatar.png"));
});

router.get("/study-media/01/:file", limit, protectGeneratedVideo, async (req, res): Promise<void> => {
  const file = String(req.params.file);
  const match = /^(01-\d{1,2})\.(svg|mp4)$/.exec(file);
  const chapter = match ? findStudyModule(match[1]!) : undefined;
  if (!chapter || !match) { res.status(404).json({ error: "Instructional media not found." }); return; }
  res.set("Cache-Control", "public, max-age=3600");
  res.set("X-Content-Type-Options", "nosniff");
  if (match[2] === "svg") { res.type("image/svg+xml").send(chapterDiagram(chapter)); return; }
  try {
    const video = await chapterVideo(chapter);
    res.type("video/mp4");
    res.sendFile(video);
  } catch (error) {
    req.log.error({ err: error }, "AI-narrated lesson rendering failed");
    res.set("Cache-Control", "no-store").status(503).json({ error: "The narrated lesson could not be prepared. Its full transcript remains available in the lesson." });
  }
});
export default router;
