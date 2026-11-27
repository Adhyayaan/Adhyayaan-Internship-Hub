import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import learningRouter from "./learning";
import aiRouter from "./ai";
import studyRouter from "./study";
import studyMediaRouter from "./study-media";
import assessmentRouter from "./assessment";
import adminRouter from "./admin";
import superadminRouter from "./superadmin";
import guideRouter from "./guide";
import { checkAssessment, requireTemporaryPasswordChangeComplete } from "../lib/auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(requireTemporaryPasswordChangeComplete);
router.use(assessmentRouter);
router.use(adminRouter);
router.use(superadminRouter);
router.use(guideRouter);
router.use(["/dashboard", "/enrollments", "/logs", "/ai", "/practice", "/study"], checkAssessment);
router.use(learningRouter);
router.use(aiRouter);
router.use(studyRouter);
router.use(studyMediaRouter);

export default router;
