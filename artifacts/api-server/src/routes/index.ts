import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import learningRouter from "./learning";
import aiRouter from "./ai";
import studyRouter from "./study";
import studyMediaRouter from "./study-media";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(learningRouter);
router.use(aiRouter);
router.use(studyRouter);
router.use(studyMediaRouter);

export default router;
