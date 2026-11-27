import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream";
import { Router, type IRouter } from "express";
import { asc, count, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  enrollments,
  learners,
  mentorshipAttachments,
  mentorshipMessages,
  type Learner,
  type MentorshipMessage,
} from "@workspace/db";
import {
  DownloadMentorshipAttachmentParams,
  ListMentorshipMessagesParams,
  ListMentorshipMessagesResponse,
  ListMentorshipThreadsResponse,
  RequestMentorshipUploadBody,
  RequestMentorshipUploadResponse,
  SendMentorshipMessageBody,
  SendMentorshipMessageResponse,
  StreamMentorshipEventsParams,
} from "@workspace/api-zod";
import { checkAssessment, requireLearner } from "../lib/auth";
import { findCourse } from "../lib/catalog";
import { publishMentorshipMessage, subscribeToMentorshipThread } from "../lib/mentorship-events";
import {
  canAccessMentorshipThread,
  canSendMentorshipMessage,
  isAllowedMentorshipAttachment,
  isGoogleMeetLink,
  MAX_MENTORSHIP_ATTACHMENT_BYTES,
  sanitizeMentorshipFileName,
} from "../lib/mentorship-rules";
import {
  createMentorshipUpload,
  mentorshipObjectFile,
  verifyMentorshipUploadToken,
  verifyUploadedMentorshipFile,
  type MentorshipUploadClaims,
} from "../lib/mentorship-storage";

const router: IRouter = Router();
router.use("/mentorship", requireLearner, checkAssessment);

type EnrollmentRow = typeof enrollments.$inferSelect;
type PersonSummary = Pick<Learner, "id" | "name" | "role">;

function roleCanUseMentorship(user: Learner): boolean {
  return user.role === "student" || user.role === "guide";
}

async function loadEnrollmentAccess(
  enrollmentId: string,
  user: Learner,
): Promise<{ enrollment: EnrollmentRow; student: PersonSummary; guide: PersonSummary | null } | null> {
  const [enrollment] = await db.select().from(enrollments)
    .where(eq(enrollments.id, enrollmentId)).limit(1);
  if (!enrollment || !canAccessMentorshipThread(user, enrollment)) return null;
  const [student] = await db.select({ id: learners.id, name: learners.name, role: learners.role })
    .from(learners).where(eq(learners.id, enrollment.userId)).limit(1);
  if (!student) return null;
  const [guide] = enrollment.guideId
    ? await db.select({ id: learners.id, name: learners.name, role: learners.role })
      .from(learners).where(eq(learners.id, enrollment.guideId)).limit(1)
    : [];
  return {
    enrollment,
    student,
    guide: guide?.role === "guide" ? guide : null,
  };
}

function threadView(
  enrollment: EnrollmentRow,
  student: PersonSummary,
  guide: PersonSummary | null,
  user: Learner,
  latest?: { kind: "text" | "meeting"; body: string; meetingAgenda: string; createdAt: Date },
  messageCount = 0,
) {
  const course = findCourse(enrollment.courseId);
  if (!course) return null;
  const lastMessagePreview = latest
    ? latest.kind === "meeting"
      ? `Google Meet session${latest.meetingAgenda ? ` · ${latest.meetingAgenda}` : ""}`
      : latest.body.trim().replace(/\s+/g, " ").slice(0, 160) || "Shared an attachment"
    : null;
  return {
    enrollmentId: enrollment.id,
    courseId: course.id,
    courseTitle: course.title,
    hours: enrollment.hours,
    status: enrollment.status,
    studentId: student.id,
    studentName: student.name,
    guideId: guide?.id ?? null,
    guideName: guide?.name ?? null,
    canSend: canSendMentorshipMessage(user, enrollment) && !!guide,
    lastMessagePreview,
    lastMessageAt: latest?.createdAt ?? null,
    messageCount,
  };
}

async function buildThread(
  enrollment: EnrollmentRow,
  user: Learner,
): Promise<ReturnType<typeof threadView> | null> {
  const access = await loadEnrollmentAccess(enrollment.id, user);
  if (!access) return null;
  const [latest] = await db.selectDistinctOn([mentorshipMessages.enrollmentId], {
    kind: mentorshipMessages.kind,
    body: mentorshipMessages.body,
    meetingAgenda: mentorshipMessages.meetingAgenda,
    createdAt: mentorshipMessages.createdAt,
  }).from(mentorshipMessages)
    .where(eq(mentorshipMessages.enrollmentId, enrollment.id))
    .orderBy(mentorshipMessages.enrollmentId, desc(mentorshipMessages.createdAt));
  const [summary] = await db.select({ total: count() }).from(mentorshipMessages)
    .where(eq(mentorshipMessages.enrollmentId, enrollment.id));
  return threadView(access.enrollment, access.student, access.guide, user, latest, summary?.total ?? 0);
}

router.get("/mentorship/threads", async (req, res): Promise<void> => {
  const user = req.learner!;
  if (!roleCanUseMentorship(user)) {
    res.status(403).json({ error: "Student or assigned guide access is required." });
    return;
  }
  const rows = user.role === "student"
    ? await db.select().from(enrollments).where(eq(enrollments.userId, user.id)).orderBy(desc(enrollments.createdAt))
    : await db.select().from(enrollments).where(eq(enrollments.guideId, user.id)).orderBy(desc(enrollments.createdAt));
  if (rows.length === 0) {
    res.set("Cache-Control", "private, no-store");
    res.json(ListMentorshipThreadsResponse.parse([]));
    return;
  }

  const enrollmentIds = rows.map((row) => row.id);
  const personIds = [...new Set(rows.flatMap((row) => [row.userId, ...(row.guideId ? [row.guideId] : [])]))];
  const people = await db.select({ id: learners.id, name: learners.name, role: learners.role })
    .from(learners).where(inArray(learners.id, personIds));
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const latestRows = await db.selectDistinctOn([mentorshipMessages.enrollmentId], {
    enrollmentId: mentorshipMessages.enrollmentId,
    kind: mentorshipMessages.kind,
    body: mentorshipMessages.body,
    meetingAgenda: mentorshipMessages.meetingAgenda,
    createdAt: mentorshipMessages.createdAt,
  }).from(mentorshipMessages)
    .where(inArray(mentorshipMessages.enrollmentId, enrollmentIds))
    .orderBy(mentorshipMessages.enrollmentId, desc(mentorshipMessages.createdAt));
  const latestByEnrollment = new Map(latestRows.map((row) => [row.enrollmentId, row]));
  const countRows = await db.select({ enrollmentId: mentorshipMessages.enrollmentId, total: count() })
    .from(mentorshipMessages).where(inArray(mentorshipMessages.enrollmentId, enrollmentIds))
    .groupBy(mentorshipMessages.enrollmentId);
  const countByEnrollment = new Map(countRows.map((row) => [row.enrollmentId, row.total]));

  const result = rows.flatMap((enrollment) => {
    const student = peopleById.get(enrollment.userId);
    const rawGuide = enrollment.guideId ? peopleById.get(enrollment.guideId) : undefined;
    if (!student) return [];
    const guide = rawGuide?.role === "guide" ? rawGuide : null;
    const value = threadView(
      enrollment,
      student,
      guide,
      user,
      latestByEnrollment.get(enrollment.id),
      countByEnrollment.get(enrollment.id) ?? 0,
    );
    return value ? [value] : [];
  });
  res.set("Cache-Control", "private, no-store");
  res.json(ListMentorshipThreadsResponse.parse(result));
});

async function getMessagesForEnrollment(enrollmentId: string) {
  const rows = await db.select({
    message: mentorshipMessages,
    senderName: learners.name,
  }).from(mentorshipMessages)
    .innerJoin(learners, eq(learners.id, mentorshipMessages.senderId))
    .where(eq(mentorshipMessages.enrollmentId, enrollmentId))
    .orderBy(asc(mentorshipMessages.createdAt), asc(mentorshipMessages.id));
  if (rows.length === 0) return [];
  const messageIds = rows.map((row) => row.message.id);
  const attachments = await db.select().from(mentorshipAttachments)
    .where(inArray(mentorshipAttachments.messageId, messageIds))
    .orderBy(asc(mentorshipAttachments.createdAt));
  const attachmentsByMessage = new Map<string, typeof attachments>();
  for (const attachment of attachments) {
    const group = attachmentsByMessage.get(attachment.messageId) ?? [];
    group.push(attachment);
    attachmentsByMessage.set(attachment.messageId, group);
  }
  return rows.map(({ message, senderName }) => ({
    ...message,
    senderName,
    attachments: (attachmentsByMessage.get(message.id) ?? []).map((attachment) => ({
      id: attachment.id,
      fileName: attachment.fileName,
      contentType: attachment.contentType,
      size: attachment.size,
      downloadUrl: `/api/mentorship/attachments/${attachment.id}`,
      isImage: attachment.contentType.startsWith("image/"),
    })),
  }));
}

router.get("/mentorship/threads/:enrollmentId/messages", async (req, res): Promise<void> => {
  const params = ListMentorshipMessagesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Choose a valid course conversation." });
    return;
  }
  const access = await loadEnrollmentAccess(params.data.enrollmentId, req.learner!);
  if (!access) {
    const [exists] = await db.select({ id: enrollments.id }).from(enrollments)
      .where(eq(enrollments.id, params.data.enrollmentId)).limit(1);
    res.status(exists ? 403 : 404).json({ error: exists ? "You are not part of this conversation." : "Course conversation not found." });
    return;
  }
  const thread = await buildThread(access.enrollment, req.learner!);
  const messages = await getMessagesForEnrollment(access.enrollment.id);
  res.set("Cache-Control", "private, no-store");
  res.json(ListMentorshipMessagesResponse.parse({ thread, messages }));
});

router.post("/mentorship/threads/:enrollmentId/uploads", async (req, res): Promise<void> => {
  const params = ListMentorshipMessagesParams.safeParse(req.params);
  const parsed = RequestMentorshipUploadBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Choose a valid conversation and supported file." });
    return;
  }
  const access = await loadEnrollmentAccess(params.data.enrollmentId, req.learner!);
  if (!access) {
    res.status(403).json({ error: "You are not part of this conversation." });
    return;
  }
  if (!access.guide || !canSendMentorshipMessage(req.learner!, access.enrollment)) {
    res.status(403).json({ error: "A guide must be assigned before you can send messages." });
    return;
  }
  if (!isAllowedMentorshipAttachment(parsed.data.contentType, parsed.data.size)) {
    res.status(400).json({ error: `Use an image or document no larger than ${MAX_MENTORSHIP_ATTACHMENT_BYTES / (1024 * 1024)} MB.` });
    return;
  }
  try {
    const upload = await createMentorshipUpload({
      enrollmentId: params.data.enrollmentId,
      userId: req.learner!.id,
      fileName: parsed.data.fileName,
      contentType: parsed.data.contentType,
      size: parsed.data.size,
    });
    res.status(201).json(RequestMentorshipUploadResponse.parse(upload));
  } catch (error) {
    req.log.error({ err: error }, "Could not create mentorship attachment upload");
    res.status(503).json({ error: "File uploads are temporarily unavailable. Please try again." });
  }
});

router.post("/mentorship/threads/:enrollmentId/messages", async (req, res): Promise<void> => {
  const params = ListMentorshipMessagesParams.safeParse(req.params);
  const parsed = SendMentorshipMessageBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Check the message and try again." });
    return;
  }
  const access = await loadEnrollmentAccess(params.data.enrollmentId, req.learner!);
  if (!access) {
    res.status(403).json({ error: "You are not part of this conversation." });
    return;
  }
  const user = req.learner!;
  if (!access.guide || !canSendMentorshipMessage(user, access.enrollment)) {
    res.status(403).json({ error: "A guide must be assigned before you can send messages." });
    return;
  }
  const body = (parsed.data.body ?? "").trim();
  const meetingAgenda = (parsed.data.meetingAgenda ?? "").trim();
  const uploadTokens = parsed.data.uploadTokens ?? [];
  if (parsed.data.kind === "meeting") {
    if (user.role !== "guide") {
      res.status(403).json({ error: "Only the assigned guide can share a Meet session." });
      return;
    }
    if (!parsed.data.meetingUrl || !isGoogleMeetLink(parsed.data.meetingUrl) || uploadTokens.length) {
      res.status(400).json({ error: "Paste a valid Google Meet link. Meeting posts cannot include file attachments." });
      return;
    }
  } else if (parsed.data.meetingUrl || parsed.data.meetingStartsAt || parsed.data.meetingAgenda) {
    res.status(400).json({ error: "Meeting details can only be included in a Meet session post." });
    return;
  }

  const claims: MentorshipUploadClaims[] = [];
  for (const token of uploadTokens) {
    const claim = verifyMentorshipUploadToken(token, {
      enrollmentId: params.data.enrollmentId,
      userId: user.id,
    });
    if (!claim || !await verifyUploadedMentorshipFile(claim)) {
      res.status(400).json({ error: "An attachment is missing, expired or invalid. Upload it again." });
      return;
    }
    claims.push(claim);
  }
  if (parsed.data.kind === "text" && !body && claims.length === 0) {
    res.status(400).json({ error: "Write a message or add an attachment before sending." });
    return;
  }
  if (claims.length > 0) {
    const reused = await db.select({ id: mentorshipAttachments.id }).from(mentorshipAttachments)
      .where(inArray(mentorshipAttachments.objectPath, claims.map((claim) => claim.objectPath))).limit(1);
    if (reused.length) {
      res.status(409).json({ error: "An uploaded file has already been sent. Upload it again to share it." });
      return;
    }
  }

  let saved: MentorshipMessage;
  let savedAttachments: typeof mentorshipAttachments.$inferSelect[] = [];
  try {
    const result = await db.transaction(async (tx) => {
      const [message] = await tx.insert(mentorshipMessages).values({
        id: randomUUID(),
        enrollmentId: access.enrollment.id,
        senderId: user.id,
        senderRole: user.role === "guide" ? "guide" : "student",
        kind: parsed.data.kind,
        body,
        meetingUrl: parsed.data.kind === "meeting" ? parsed.data.meetingUrl! : null,
        meetingStartsAt: parsed.data.kind === "meeting" ? parsed.data.meetingStartsAt ?? null : null,
        meetingAgenda: parsed.data.kind === "meeting" ? meetingAgenda : "",
      }).returning();
      if (!message) throw new Error("Message insert did not return a row.");
      const attachments = claims.length
        ? await tx.insert(mentorshipAttachments).values(claims.map((claim) => ({
          id: randomUUID(),
          messageId: message.id,
          objectPath: claim.objectPath,
          fileName: claim.fileName,
          contentType: claim.contentType,
          size: claim.size,
          uploadedBy: user.id,
        }))).returning()
        : [];
      return { message, attachments };
    });
    saved = result.message;
    savedAttachments = result.attachments;
  } catch (error) {
    req.log.error({ err: error }, "Could not save mentorship message");
    res.status(409).json({ error: "The message could not be saved. Check the attachments and try again." });
    return;
  }

  const response = SendMentorshipMessageResponse.parse({
    ...saved,
    senderName: user.name,
    attachments: savedAttachments.map((attachment) => ({
      id: attachment.id,
      fileName: attachment.fileName,
      contentType: attachment.contentType,
      size: attachment.size,
      downloadUrl: `/api/mentorship/attachments/${attachment.id}`,
      isImage: attachment.contentType.startsWith("image/"),
    })),
  });
  publishMentorshipMessage(access.enrollment.id, saved.id);
  res.status(201).set("Cache-Control", "private, no-store").json(response);
});

router.get("/mentorship/threads/:enrollmentId/events", async (req, res): Promise<void> => {
  const params = StreamMentorshipEventsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Choose a valid course conversation." });
    return;
  }
  const access = await loadEnrollmentAccess(params.data.enrollmentId, req.learner!);
  if (!access) {
    res.status(403).json({ error: "You are not part of this conversation." });
    return;
  }
  res.status(200);
  res.set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "private, no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  res.write("retry: 3000\n: connected\n\n");
  const unsubscribe = subscribeToMentorshipThread(access.enrollment.id, res);
  const heartbeat = setInterval(() => {
    if (!res.destroyed && !res.writableEnded) res.write(": ping\n\n");
  }, 25_000);
  res.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

router.get("/mentorship/attachments/:attachmentId", async (req, res): Promise<void> => {
  const params = DownloadMentorshipAttachmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(404).json({ error: "Attachment not found." });
    return;
  }
  const [row] = await db.select({
    attachment: mentorshipAttachments,
    enrollmentId: mentorshipMessages.enrollmentId,
  }).from(mentorshipAttachments)
    .innerJoin(mentorshipMessages, eq(mentorshipMessages.id, mentorshipAttachments.messageId))
    .where(eq(mentorshipAttachments.id, params.data.attachmentId)).limit(1);
  if (!row) {
    res.status(404).json({ error: "Attachment not found." });
    return;
  }
  const access = await loadEnrollmentAccess(row.enrollmentId, req.learner!);
  if (!access) {
    res.status(403).json({ error: "You are not part of this conversation." });
    return;
  }
  const file = await mentorshipObjectFile(row.attachment.objectPath);
  if (!file) {
    res.status(404).json({ error: "Attachment file is no longer available." });
    return;
  }
  const fileName = sanitizeMentorshipFileName(row.attachment.fileName);
  const disposition = row.attachment.contentType.startsWith("image/") ? "inline" : "attachment";
  res.set({
    "Content-Type": row.attachment.contentType,
    "Content-Length": String(row.attachment.size),
    "Content-Disposition": `${disposition}; filename="attachment"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  });
  pipeline(file.createReadStream(), res, (error) => {
    if (error) req.log.warn({ err: error }, "Could not stream mentorship attachment");
  });
});

export default router;
