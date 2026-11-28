import { createServer } from "node:http";
import app from "./app";
import { logger } from "./lib/logger";
import { startChatRealtime } from "./lib/chat-realtime";

const rawPort = process.env["API_PORT"] ?? process.env["PORT"] ?? "3000";

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = createServer(app);
const stopChatRealtime = startChatRealtime(server);
server.on("close", stopChatRealtime);
server.listen(port, () => {
  logger.info({ port }, "Server listening");
});
