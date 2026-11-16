import { Router, type IRouter } from "express";
import { rateLimit } from "express-rate-limit";
import { findStudyModule } from "../lib/study-content";
import { chapterDiagram, chapterVideo } from "../lib/study-media";

const router: IRouter = Router();
const limit = rateLimit({ windowMs: 60_000, limit: 90, standardHeaders: "draft-7", legacyHeaders: false });
router.get("/study-media/01/:file", limit, async (req, res): Promise<void> => {
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
    req.log.error({ err: error }, "Instructional video rendering failed");
    res.set("Cache-Control", "no-store").status(503).json({ error: "The visual summary could not be prepared. Its complete text transcript remains available in the lesson." });
  }
});
export default router;
