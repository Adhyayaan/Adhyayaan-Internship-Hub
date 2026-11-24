import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findStudyModule } from "../lib/study-content";
import { bengaliConsentPilotCaptions } from "../data/study/community-bengali";
import { chapterDiagram, chapterVideo } from "../lib/study-media";
import { getPilotMedia, type PilotFile } from "../lib/pilot-media";
import { checkAssessment } from "../lib/auth";

const router: IRouter = Router();
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const mentorAvatarPath = [
  path.resolve(moduleDir, "../assets/mentor-avatar.png"),
  path.resolve(moduleDir, "../../assets/mentor-avatar.png"),
  path.resolve(process.cwd(), "assets/mentor-avatar.png"),
  path.resolve(process.cwd(), "artifacts/api-server/assets/mentor-avatar.png"),
].find(existsSync);
if (!mentorAvatarPath) throw new Error("The Adhya mentor avatar asset is missing.");
const limit = rateLimit({ windowMs: 60_000, limit: 90, standardHeaders: "draft-7", legacyHeaders: false });
const videoLimit = rateLimit({
  windowMs: 15 * 60_000, limit: 32, standardHeaders: "draft-7", legacyHeaders: false,
  message: { error: "Too many lesson videos were requested. Please try again in a few minutes." },
});
function protectGeneratedVideo(req: Request, res: Response, next: NextFunction) {
  if (!String(req.params.file).endsWith(".mp4")) { next(); return; }
  if (!req.learner) { res.status(401).json({ error: "Sign in to generate and play narrated lessons." }); return; }
  checkAssessment(req, res, () => videoLimit(req, res, next));
}

router.get("/study-media/mentor-avatar.png", limit, (_req, res) => {
  res.set("Cache-Control", "public, max-age=86400");
  res.type("image/png").sendFile(mentorAvatarPath);
});

router.get("/study-media/01/:file", limit, protectGeneratedVideo, async (req, res): Promise<void> => {
  const file = String(req.params.file);
  if (file === "consent-pilot-bn.vtt") {
    res.set("Cache-Control", "public, max-age=3600").set("X-Content-Type-Options", "nosniff");
    res.type("text/vtt").send(bengaliConsentPilotCaptions);
    return;
  }
  if (file === "consent-pilot.mp4" || file === "consent-pilot.vtt" || file === "consent-pilot.jpg") {
    try {
      const local = await getPilotMedia(file as PilotFile);
      res.set("Cache-Control", file.endsWith(".mp4") ? "private, max-age=3600" : "public, max-age=3600");
      res.set("X-Content-Type-Options", "nosniff");
      res.type(file.endsWith(".mp4") ? "video/mp4" : file.endsWith(".vtt") ? "text/vtt" : "image/jpeg").sendFile(local);
    } catch (error) {
      req.log.error({ err: error, file }, "Pilot lesson media could not be loaded");
      res.set("Cache-Control", "no-store").status(503).json({ error: "The pilot lesson media could not be loaded. Its transcript remains available." });
    }
    return;
  }
  const match = /^(01-\d{1,2})\.(svg|mp4)$/.exec(file);
  const language = req.query.language === "bn" ? "bn" : "en";
  const chapter = match ? findStudyModule(match[1]!, language) : undefined;
  if (!chapter || !match) { res.status(404).json({ error: "Instructional media not found." }); return; }
  res.set("Cache-Control", match[2] === "mp4" ? "private, max-age=3600" : "public, max-age=3600");
  res.set("X-Content-Type-Options", "nosniff");
  if (match[2] === "svg") { res.type("image/svg+xml").send(chapterDiagram(chapter)); return; }
  try {
    const visualChapter = language === "bn" ? findStudyModule(match[1]!, "en") : chapter;
    const video = await chapterVideo(chapter, visualChapter);
    res.type("video/mp4");
    res.sendFile(video);
  } catch (error) {
    req.log.error({ err: error }, "AI-narrated lesson rendering failed");
    res.set("Cache-Control", "no-store").status(503).json({ error: "The narrated lesson could not be prepared. Its full transcript remains available in the lesson." });
  }
});
export default router;
