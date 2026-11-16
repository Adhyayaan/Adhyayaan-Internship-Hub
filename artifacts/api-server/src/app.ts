import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { loadLearner } from "./lib/auth";

const app: Express = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Cache-Control", "no-store");
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.get("origin");
    const forwardedHost = req.get("x-forwarded-host")?.split(",")[0]?.trim();
    if (origin) {
      try {
        const host = new URL(origin).host;
        if (host !== req.get("host") && host !== forwardedHost) {
          res.status(403).json({ error: "Cross-origin requests are not allowed." }); return;
        }
      } catch { res.status(403).json({ error: "Invalid request origin." }); return; }
    }
    if (req.method !== "DELETE" && !req.is("application/json") && Number(req.get("content-length") ?? 0) > 0) {
      res.status(415).json({ error: "Send application/json." }); return;
    }
  }
  next();
});
app.use(loadLearner);

app.use("/api", router);
app.use((err: Error & { status?: number }, req: Request, res: Response, _next: NextFunction) => {
  req.log.error({ err }, "Request failed");
  res.status(err.status && err.status >= 400 && err.status < 500 ? err.status : 500)
    .json({ error: err.status === 400 ? "The request was not valid JSON." : "Something went wrong. Please retry." });
});

export default app;
