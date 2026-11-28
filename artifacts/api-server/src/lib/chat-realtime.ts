import { randomUUID } from "node:crypto";
import type { IncomingMessage, Server } from "node:http";
import type { Socket } from "node:net";
import { and, desc, eq } from "drizzle-orm";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import {
  db,
  pool,
  enrollments,
  learners,
  mentorshipAttachments,
  mentorshipMessages,
  mentorshipMessageReactions,
  mentorshipQuestions,
  mentorshipThreadReads,
  supportGroups,
  supportGroupMembers,
  supportGroupMessages,
  supportGroupMessageReactions,
  supportGroupQuestions,
  supportGroupAttachments,
  supportGroupReads,
  type Learner,
} from "@workspace/db";
import { logger } from "./logger";
import { getLearnerForSessionToken } from "./auth";
import { canAccessMentorshipThread } from "./mentorship-rules";
import { supportGroupAccess } from "./support-group-rules";
import { readPositionIncludesMessage, summarizeChatReactions } from "./chat-features";

const CHANNEL = "adhyayaan_chat_events";
const SESSION_COOKIE = "adhyayaan_session";
const MAX_ROOMS_PER_SOCKET = 12;
const MAX_USER_SOCKETS = 5;
const MAX_TYPING_EVENTS_PER_WINDOW = 8;
const TYPING_WINDOW_MS = 5_000;
type PgNotification = { channel: string; payload?: string };
type ListenerClient = {
  query(text: string): Promise<unknown>;
  on(event: "notification", listener: (notification: PgNotification) => void): void;
  on(event: "error", listener: (error: Error) => void): void;
  on(event: "end", listener: () => void): void;
  release(error?: Error): void;
};

type RoomKind = "mentorship" | "support-group";
type ChatEvent =
  | { id: string; type: "mentorship.message"; roomId: string; messageId: string }
  | { id: string; type: "mentorship.read"; roomId: string; actorId: string }
  | { id: string; type: "mentorship.typing"; roomId: string; actorId: string; name: string; typing: boolean }
  | { id: string; type: "mentorship.notification"; recipientId: string; roomId: string; messageId: string }
  | { id: string; type: "support-group.message"; roomId: string; messageId: string }
  | { id: string; type: "support-group.read"; roomId: string; actorId: string }
  | { id: string; type: "support-group.typing"; roomId: string; actorId: string; name: string; typing: boolean }
  | { id: string; type: "support-group.revoked"; roomId: string; userId: string };

type ClientCommand =
  | { type: "subscribe"; room: { kind: RoomKind; id: string } }
  | { type: "unsubscribe"; room: { kind: RoomKind; id: string } }
  | { type: "read"; room: { kind: RoomKind; id: string } }
  | { type: "typing"; room: { kind: RoomKind; id: string }; typing: boolean };

type Connection = {
  socket: WebSocket;
  user: Learner;
  rooms: Set<string>;
  alive: boolean;
  typingWindowStart: number;
  typingEvents: number;
};

type MentorshipMessageRow = typeof mentorshipMessages.$inferSelect;
type SupportGroupMessageRow = typeof supportGroupMessages.$inferSelect;

const rooms = new Map<string, Set<Connection>>();
const userConnections = new Map<string, Set<Connection>>();
const connections = new Set<Connection>();
let listenerClient: ListenerClient | null = null;
let listenerRetry: ReturnType<typeof setTimeout> | null = null;
let listenerStopping = false;

function roomKey(room: { kind: RoomKind; id: string }) {
  return `${room.kind}:${room.id}`;
}

function send(connection: Connection, event: Record<string, unknown>) {
  if (connection.socket.readyState !== WebSocket.OPEN) return;
  connection.socket.send(JSON.stringify(event));
}

function cookieValue(request: IncomingMessage, name: string): string | null {
  const header = request.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

function originAllowed(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  if (!origin) return true;
  const forwardedHost = request.headers["x-forwarded-host"]?.toString().split(",")[0]?.trim();
  const expectedHost = forwardedHost || request.headers.host;
  try {
    return new URL(origin).host === expectedHost;
  } catch {
    return false;
  }
}

function rejectUpgrade(socket: Socket, status: number, message: string) {
  const statusText = status === 401 ? "Unauthorized" : status === 403 ? "Forbidden" : "Bad Request";
  socket.write(`HTTP/1.1 ${status} ${statusText}\r\nConnection: close\r\nContent-Type: text/plain\r\n\r\n${message}`);
  socket.destroy();
}

async function authorizeRoom(user: Learner, room: { kind: RoomKind; id: string }): Promise<boolean> {
  if (room.kind === "mentorship") {
    if (user.role !== "student" && user.role !== "guide") return false;
    if (user.role === "student" && user.assessmentRequired && !user.assessmentCompletedAt) return false;
    const [enrollment] = await db.select({
      userId: enrollments.userId,
      guideId: enrollments.guideId,
    }).from(enrollments).where(eq(enrollments.id, room.id)).limit(1);
    return !!enrollment && canAccessMentorshipThread(user, enrollment);
  }

  if (user.role !== "student" && user.role !== "guide") return false;
  if (user.role === "student" && user.assessmentRequired && !user.assessmentCompletedAt) return false;
  const [group] = await db.select({ guideId: supportGroups.guideId }).from(supportGroups)
    .where(eq(supportGroups.id, room.id)).limit(1);
  if (!group) return false;
  const [membership] = user.role === "student"
    ? await db.select({ userId: supportGroupMembers.userId }).from(supportGroupMembers)
      .where(and(eq(supportGroupMembers.groupId, room.id), eq(supportGroupMembers.userId, user.id)))
      .limit(1)
    : [];
  return supportGroupAccess(user, group, !!membership).allowed;
}

function addToRoom(connection: Connection, key: string) {
  const room = rooms.get(key) ?? new Set<Connection>();
  room.add(connection);
  rooms.set(key, room);
  connection.rooms.add(key);
}

function removeFromRoom(connection: Connection, key: string) {
  const room = rooms.get(key);
  room?.delete(connection);
  if (!room?.size) rooms.delete(key);
  connection.rooms.delete(key);
}

function removeConnection(connection: Connection) {
  connections.delete(connection);
  for (const key of [...connection.rooms]) removeFromRoom(connection, key);
  const userRoom = userConnections.get(connection.user.id);
  userRoom?.delete(connection);
  if (!userRoom?.size) userConnections.delete(connection.user.id);
}

function parseCommand(raw: RawData): ClientCommand | null {
  try {
    const source = typeof raw === "string" ? raw : raw.toString();
    if (source.length > 2_048) return null;
    const value = JSON.parse(source) as Record<string, unknown>;
    if (!value || typeof value !== "object" || !["subscribe", "unsubscribe", "read", "typing"].includes(String(value.type))) return null;
    const room = value.room as Record<string, unknown> | undefined;
    if (!room || (room.kind !== "mentorship" && room.kind !== "support-group")
      || typeof room.id !== "string" || !room.id || room.id.length > 128) return null;
    if (value.type === "typing" && typeof value.typing !== "boolean") return null;
    return value as ClientCommand;
  } catch {
    return null;
  }
}

async function handleCommand(connection: Connection, command: ClientCommand) {
  const key = roomKey(command.room);
  if (command.type === "subscribe") {
    if (connection.rooms.has(key)) return;
    if (connection.rooms.size >= MAX_ROOMS_PER_SOCKET) {
      send(connection, { type: "error", code: "room_limit", message: "Too many chat spaces are open." });
      return;
    }
    if (!await authorizeRoom(connection.user, command.room)) {
      send(connection, { type: "error", code: "access_denied", room: command.room });
      return;
    }
    addToRoom(connection, key);
    send(connection, { type: "subscribed", room: command.room });
    return;
  }
  if (command.type === "unsubscribe") {
    removeFromRoom(connection, key);
    return;
  }
  if (!connection.rooms.has(key)) {
    send(connection, { type: "error", code: "subscribe_first", room: command.room });
    return;
  }
  if (command.type === "read") {
    if (command.room.kind === "mentorship") {
      const [latest] = await db.select({
        id: mentorshipMessages.id,
        senderId: mentorshipMessages.senderId,
        createdAt: mentorshipMessages.createdAt,
      }).from(mentorshipMessages)
        .where(eq(mentorshipMessages.enrollmentId, command.room.id))
        .orderBy(desc(mentorshipMessages.createdAt), desc(mentorshipMessages.id)).limit(1);
      if (!latest || latest.senderId === connection.user.id) return;
      const [previous] = await db.select().from(mentorshipThreadReads)
        .where(and(
          eq(mentorshipThreadReads.enrollmentId, command.room.id),
          eq(mentorshipThreadReads.userId, connection.user.id),
        )).limit(1);
      if (readPositionIncludesMessage(previous?.lastReadAt ?? null, previous?.lastReadMessageId ?? null, latest.createdAt, latest.id)) return;
      await db.insert(mentorshipThreadReads).values({
        enrollmentId: command.room.id,
        userId: connection.user.id,
        lastReadAt: latest.createdAt,
        lastReadMessageId: latest.id,
      }).onConflictDoUpdate({
        target: [mentorshipThreadReads.enrollmentId, mentorshipThreadReads.userId],
        set: { lastReadAt: latest.createdAt, lastReadMessageId: latest.id },
      });
      await publishChatEvent({ id: randomUUID(), type: "mentorship.read", roomId: command.room.id, actorId: connection.user.id });
      return;
    }
    const [latest] = await db.select({
      id: supportGroupMessages.id,
      senderId: supportGroupMessages.senderId,
      createdAt: supportGroupMessages.createdAt,
    }).from(supportGroupMessages)
      .where(eq(supportGroupMessages.groupId, command.room.id))
      .orderBy(desc(supportGroupMessages.createdAt), desc(supportGroupMessages.id)).limit(1);
    if (!latest || latest.senderId === connection.user.id) return;
    const [previous] = await db.select().from(supportGroupReads)
      .where(and(
        eq(supportGroupReads.groupId, command.room.id),
        eq(supportGroupReads.userId, connection.user.id),
      )).limit(1);
    if (readPositionIncludesMessage(previous?.lastReadAt ?? null, previous?.lastReadMessageId ?? null, latest.createdAt, latest.id)) return;
    await db.insert(supportGroupReads).values({
      groupId: command.room.id,
      userId: connection.user.id,
      lastReadAt: latest.createdAt,
      lastReadMessageId: latest.id,
    }).onConflictDoUpdate({
      target: [supportGroupReads.groupId, supportGroupReads.userId],
      set: { lastReadAt: latest.createdAt, lastReadMessageId: latest.id },
    });
    await publishChatEvent({ id: randomUUID(), type: "support-group.read", roomId: command.room.id, actorId: connection.user.id });
    return;
  }
  const now = Date.now();
  if (now - connection.typingWindowStart >= TYPING_WINDOW_MS) {
    connection.typingWindowStart = now;
    connection.typingEvents = 0;
  }
  connection.typingEvents += 1;
  if (connection.typingEvents > MAX_TYPING_EVENTS_PER_WINDOW) return;
  const event = command.room.kind === "mentorship"
    ? { id: randomUUID(), type: "mentorship.typing", roomId: command.room.id, actorId: connection.user.id, name: connection.user.name, typing: command.typing } satisfies ChatEvent
    : { id: randomUUID(), type: "support-group.typing", roomId: command.room.id, actorId: connection.user.id, name: connection.user.name, typing: command.typing } satisfies ChatEvent;
  await publishChatEvent(event);
}

async function loadMentorshipMessage(messageId: string) {
  const [row] = await db.select({
    message: mentorshipMessages,
    senderName: learners.name,
  }).from(mentorshipMessages)
    .innerJoin(learners, eq(learners.id, mentorshipMessages.senderId))
    .where(eq(mentorshipMessages.id, messageId)).limit(1);
  if (!row) return null;
  const [attachments, reactions, reads, questionRows] = await Promise.all([
    db.select().from(mentorshipAttachments).where(eq(mentorshipAttachments.messageId, messageId)),
    db.select().from(mentorshipMessageReactions).where(eq(mentorshipMessageReactions.messageId, messageId)),
    db.select().from(mentorshipThreadReads).where(eq(mentorshipThreadReads.enrollmentId, row.message.enrollmentId)),
    row.message.kind === "question"
      ? db.select().from(mentorshipQuestions).where(eq(mentorshipQuestions.messageId, messageId)).limit(1)
      : Promise.resolve([]),
  ]);
  return { ...row, attachments, reactions, reads, question: questionRows[0] ?? null };
}

function mentorshipMessageForViewer(
  row: NonNullable<Awaited<ReturnType<typeof loadMentorshipMessage>>>,
  viewerId: string,
) {
  const counterpartRead = row.reads.find((read) => read.userId !== viewerId);
  const message = row.message as MentorshipMessageRow;
  return {
    ...message,
    body: message.deletedAt ? "" : message.body,
    senderName: row.senderName,
    readByCount: message.senderId === viewerId && readPositionIncludesMessage(
      counterpartRead?.lastReadAt ?? null,
      counterpartRead?.lastReadMessageId ?? null,
      message.createdAt,
      message.id,
    ) ? 1 : 0,
    reactions: message.deletedAt ? [] : summarizeChatReactions(row.reactions, viewerId).get(message.id) ?? [],
    question: row.question ? { type: row.question.type, options: row.question.options } : null,
    attachments: message.deletedAt ? [] : row.attachments.map((attachment) => ({
      id: attachment.id,
      fileName: attachment.fileName,
      contentType: attachment.contentType,
      size: attachment.size,
      downloadUrl: `/api/mentorship/attachments/${attachment.id}`,
      isImage: attachment.contentType.startsWith("image/"),
    })),
  };
}

async function loadSupportGroupMessage(messageId: string) {
  const [row] = await db.select({
    message: supportGroupMessages,
    senderName: learners.name,
  }).from(supportGroupMessages)
    .innerJoin(learners, eq(learners.id, supportGroupMessages.senderId))
    .where(eq(supportGroupMessages.id, messageId)).limit(1);
  if (!row) return null;
  const [attachments, reactions, reads, questionRows] = await Promise.all([
    db.select().from(supportGroupAttachments).where(eq(supportGroupAttachments.messageId, messageId)),
    db.select().from(supportGroupMessageReactions).where(eq(supportGroupMessageReactions.messageId, messageId)),
    db.select().from(supportGroupReads).where(eq(supportGroupReads.groupId, row.message.groupId)),
    row.message.kind === "question"
      ? db.select().from(supportGroupQuestions).where(eq(supportGroupQuestions.messageId, messageId)).limit(1)
      : Promise.resolve([]),
  ]);
  return { ...row, attachments, reactions, reads, question: questionRows[0] ?? null };
}

function supportGroupMessageForViewer(
  row: NonNullable<Awaited<ReturnType<typeof loadSupportGroupMessage>>>,
  viewerId: string,
) {
  const message = row.message as SupportGroupMessageRow;
  return {
    ...message,
    body: message.deletedAt ? "" : message.body,
    senderName: row.senderName ?? "Group member",
    readByCount: row.reads.filter((read) => read.userId !== message.senderId
      && readPositionIncludesMessage(read.lastReadAt, read.lastReadMessageId, message.createdAt, message.id)).length,
    reactions: message.deletedAt ? [] : summarizeChatReactions(row.reactions, viewerId).get(message.id) ?? [],
    question: row.question ? { type: row.question.type, options: row.question.options } : null,
    replyToMessageId: message.replyToMessageId,
    attachments: message.deletedAt ? [] : row.attachments.map((attachment) => ({
      id: attachment.id,
      fileName: attachment.fileName,
      contentType: attachment.contentType,
      size: attachment.size,
      downloadUrl: `/api/support-groups/attachments/${attachment.id}`,
      isImage: attachment.contentType.startsWith("image/"),
    })),
  };
}

function publishToRoom(key: string, event: Record<string, unknown>, exceptUserId?: string) {
  const subscribers = rooms.get(key);
  if (!subscribers) return;
  for (const connection of [...subscribers]) {
    if (connection.user.id !== exceptUserId) send(connection, event);
  }
}

async function dispatch(event: ChatEvent) {
  if (event.type === "mentorship.notification") {
    const recipients = userConnections.get(event.recipientId);
    if (!recipients?.size) return;
    const row = await loadMentorshipMessage(event.messageId);
    if (!row) return;
    for (const connection of recipients ?? []) {
      send(connection, {
        type: "mentorship.notification",
        enrollmentId: event.roomId,
        messageId: event.messageId,
        message: mentorshipMessageForViewer(row, connection.user.id),
      });
    }
    return;
  }

  if (event.type === "support-group.revoked") {
    for (const connection of userConnections.get(event.userId) ?? []) {
      removeFromRoom(connection, `support-group:${event.roomId}`);
      send(connection, { type: "support-group.access-revoked", groupId: event.roomId });
    }
    return;
  }

  const key = event.type.startsWith("mentorship.") ? `mentorship:${event.roomId}` : `support-group:${event.roomId}`;
  const subscribers = rooms.get(key);
  if (!subscribers?.size) return;

  if (event.type === "mentorship.message") {
    const row = await loadMentorshipMessage(event.messageId);
    if (!row) return;
    for (const connection of [...subscribers]) {
      send(connection, {
        type: "mentorship.message",
        enrollmentId: event.roomId,
        message: mentorshipMessageForViewer(row, connection.user.id),
      });
    }
    return;
  }

  if (event.type === "support-group.message") {
    const row = await loadSupportGroupMessage(event.messageId);
    if (!row) return;
    for (const connection of [...subscribers]) {
      send(connection, {
        type: "support-group.message",
        groupId: event.roomId,
        message: supportGroupMessageForViewer(row, connection.user.id),
      });
    }
    return;
  }

  if (event.type === "mentorship.read") {
    publishToRoom(key, { type: event.type, enrollmentId: event.roomId, userId: event.actorId }, event.actorId);
    return;
  }
  if (event.type === "support-group.read") {
    publishToRoom(key, { type: event.type, groupId: event.roomId, userId: event.actorId }, event.actorId);
    return;
  }
  if (event.type === "mentorship.typing") {
    publishToRoom(key, { type: event.type, enrollmentId: event.roomId, userId: event.actorId, name: event.name, typing: event.typing }, event.actorId);
    return;
  }
  if (event.type === "support-group.typing") {
    publishToRoom(key, { type: event.type, groupId: event.roomId, userId: event.actorId, name: event.name, typing: event.typing }, event.actorId);
  }
}

async function publishChatEvent(event: ChatEvent) {
  try {
    await pool.query("SELECT pg_notify('adhyayaan_chat_events', $1)", [JSON.stringify(event)]);
  } catch (error) {
    logger.error({ err: error, eventType: event.type }, "Could not publish a chat event");
  }
}

function scheduleListenerReconnect() {
  if (listenerStopping || listenerRetry) return;
  listenerRetry = setTimeout(() => {
    listenerRetry = null;
    void connectListener();
  }, 2_000);
}

async function connectListener() {
  if (listenerStopping || listenerClient) return;
  let client: ListenerClient | null = null;
  try {
    client = await pool.connect();
    const activeClient = client;
    await activeClient.query(`LISTEN ${CHANNEL}`);
    listenerClient = activeClient;
    activeClient.on("notification", (notification) => {
      if (notification.channel !== CHANNEL || !notification.payload) return;
      try {
        const event = JSON.parse(notification.payload) as ChatEvent;
        void dispatch(event).catch((error: unknown) => {
          logger.warn({ err: error, eventType: event?.type }, "Could not deliver a chat event");
        });
      } catch {
        logger.warn("Ignored a malformed chat event");
      }
    });
    const disconnect = (error?: Error) => {
      if (listenerClient !== activeClient) return;
      listenerClient = null;
      activeClient.release(error ?? new Error("Chat event listener disconnected"));
      scheduleListenerReconnect();
    };
    activeClient.on("error", disconnect);
    activeClient.on("end", () => disconnect());
    for (const connection of connections) send(connection, { type: "resync" });
    logger.info("PostgreSQL chat event listener connected");
  } catch (error) {
    client?.release(error instanceof Error ? error : new Error("Chat event listener failed"));
    logger.warn({ err: error }, "Could not connect the PostgreSQL chat event listener");
    scheduleListenerReconnect();
  }
}

export function publishMentorshipRealtimeMessage(enrollmentId: string, messageId: string) {
  void publishChatEvent({ id: randomUUID(), type: "mentorship.message", roomId: enrollmentId, messageId });
}

export function publishMentorshipRealtimeRead(enrollmentId: string, actorId: string) {
  void publishChatEvent({ id: randomUUID(), type: "mentorship.read", roomId: enrollmentId, actorId });
}

export function publishMentorshipRealtimeTyping(enrollmentId: string, actorId: string, name: string, typing: boolean) {
  void publishChatEvent({ id: randomUUID(), type: "mentorship.typing", roomId: enrollmentId, actorId, name, typing });
}

export function publishMentorshipRealtimeNotification(recipientId: string, enrollmentId: string, messageId: string) {
  void publishChatEvent({ id: randomUUID(), type: "mentorship.notification", recipientId, roomId: enrollmentId, messageId });
}

export function publishSupportGroupRealtimeMessage(groupId: string, messageId: string) {
  void publishChatEvent({ id: randomUUID(), type: "support-group.message", roomId: groupId, messageId });
}

export function publishSupportGroupRealtimeRead(groupId: string, actorId: string) {
  void publishChatEvent({ id: randomUUID(), type: "support-group.read", roomId: groupId, actorId });
}

export function publishSupportGroupRealtimeTyping(groupId: string, actorId: string, name: string, typing: boolean) {
  void publishChatEvent({ id: randomUUID(), type: "support-group.typing", roomId: groupId, actorId, name, typing });
}

export function revokeSupportGroupRealtimeAccess(groupId: string, userIds: string[]) {
  for (const userId of userIds) {
    void publishChatEvent({ id: randomUUID(), type: "support-group.revoked", roomId: groupId, userId });
  }
}

export function startChatRealtime(server: Server): () => void {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
  const heartbeat = setInterval(() => {
    for (const connection of connections) {
      if (!connection.alive) {
        connection.socket.terminate();
        continue;
      }
      connection.alive = false;
      connection.socket.ping();
    }
  }, 30_000);

  const onUpgrade = async (request: IncomingMessage, socket: Socket, head: Buffer) => {
    let pathname = "";
    try {
      pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    } catch {
      rejectUpgrade(socket, 400, "Invalid WebSocket path.");
      return;
    }
    if (pathname !== "/ws") return;
    if (!originAllowed(request)) {
      rejectUpgrade(socket, 403, "WebSocket origin is not allowed.");
      return;
    }
    const token = cookieValue(request, SESSION_COOKIE);
    if (!token) {
      rejectUpgrade(socket, 401, "Please sign in.");
      return;
    }
    let user: Learner | null;
    try {
      user = await getLearnerForSessionToken(token);
    } catch (error) {
      logger.warn({ err: error }, "Could not authenticate a chat WebSocket");
      rejectUpgrade(socket, 503, "Chat is temporarily unavailable.");
      return;
    }
    if (!user || user.mustChangePassword || (user.role === "student" && user.assessmentRequired && !user.assessmentCompletedAt)) {
      rejectUpgrade(socket, 401, "Please sign in again.");
      return;
    }
    if (!["student", "guide"].includes(user.role)) {
      rejectUpgrade(socket, 403, "Chat access is not available for this account.");
      return;
    }
    if ((userConnections.get(user.id)?.size ?? 0) >= MAX_USER_SOCKETS) {
      rejectUpgrade(socket, 429, "Too many chat connections are open.");
      return;
    }

    wss.handleUpgrade(request, socket, head, (webSocket) => {
      const connection: Connection = {
        socket: webSocket,
        user,
        rooms: new Set(),
        alive: true,
        typingWindowStart: Date.now(),
        typingEvents: 0,
      };
      connections.add(connection);
      const userRoom = userConnections.get(user.id) ?? new Set<Connection>();
      userRoom.add(connection);
      userConnections.set(user.id, userRoom);
      webSocket.on("pong", () => { connection.alive = true; });
      webSocket.on("message", (raw) => {
        const command = parseCommand(raw);
        if (!command) {
          send(connection, { type: "error", code: "invalid_command", message: "This chat action was not valid." });
          return;
        }
        void handleCommand(connection, command).catch((error: unknown) => {
          logger.warn({ err: error, userId: user.id }, "Could not handle a chat WebSocket command");
          send(connection, { type: "error", code: "chat_unavailable", message: "Chat is temporarily unavailable." });
        });
      });
      webSocket.on("close", () => removeConnection(connection));
      webSocket.on("error", (error) => logger.warn({ err: error, userId: user.id }, "Chat WebSocket error"));
      send(connection, { type: "connected" });
    });
  };

  server.on("upgrade", onUpgrade);
  listenerStopping = false;
  void connectListener();
  return () => {
    listenerStopping = true;
    clearInterval(heartbeat);
    if (listenerRetry) clearTimeout(listenerRetry);
    listenerClient?.release();
    listenerClient = null;
    server.off("upgrade", onUpgrade);
    for (const connection of connections) connection.socket.close(1001, "Server shutting down");
    wss.close();
  };
}
