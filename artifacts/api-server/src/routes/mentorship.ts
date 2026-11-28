import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream";
import { Router, type IRouter } from "express";
import { and, asc, count, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import {
  db,
  enrollments,
  learners,
  mentorshipAttachments,
  mentorshipMessages,
  mentorshipMessageReactions,
  mentorshipNotificationPreferences,
  mentorshipQuestions,
  mentorshipThreadReads,
  type Learner,
  type MentorshipMessage,
} from "@workspace/db";
import {
  DeleteMentorshipMessageParams,
  DeleteMentorshipMessageResponse,
  EditMentorshipMessageBody,
  EditMentorshipMessageParams,
  EditMentorshipMessageResponse,
  AnswerMentorshipQuestionBody,
  AnswerMentorshipQuestionParams,
  AnswerMentorshipQuestionResponse,
  DownloadMentorshipAttachmentParams,
  ListMentorshipMessagesParams,
  ListMentorshipMessagesResponse,
  ListMentorshipThreadsResponse,
  RequestMentorshipUploadBody,
  RequestMentorshipUploadResponse,
  SendMentorshipMessageBody,
  SendMentorshipMessageResponse,
  StreamMentorshipEventsParams,
  ToggleMentorshipMessageReactionBody,
  ToggleMentorshipMessageReactionParams,
  ToggleMentorshipMessageReactionResponse,
  UpdateMentorshipTypingBody,
  UpdateMentorshipTypingParams,
  UpdateMentorshipNotificationPreferenceBody,
} from "@workspace/api-zod";
import { checkAssessment, requireLearner } from "../lib/auth";
import { findCourse } from "../lib/catalog";
import {
  publishMentorshipMessage,
  publishMentorshipNotification,
  publishMentorshipRead,
  publishMentorshipTyping,
  subscribeToMentorshipNotifications,
  subscribeToMentorshipThread,
} from "../lib/mentorship-events";
import { CHAT_REACTIONS, readPositionIncludesMessage, summarizeChatReactions } from "../lib/chat-features";
import { getMentorshipCounterpartId } from "../lib/mentorship-notifications";
import {
  canAccessMentorshipThread,
  canSendMentorshipMessage,
  isAllowedMentorshipAttachment,
  isGoogleMeetLink,
  isValidMentorshipQuestionResponse,
  MAX_MENTORSHIP_ATTACHMENT_BYTES,
  MAX_MENTORSHIP_VOICE_NOTE_BYTES,
  normalizeMentorshipQuestion,
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
  latest?: { kind: "text" | "meeting" | "question" | "question_response"; body: string; meetingAgenda: string; deletedAt: Date | null; createdAt: Date },
  messageCount = 0,
  unreadCount = 0,
) {
  const course = findCourse(enrollment.courseId);
  if (!course) return null;
  const lastMessagePreview = latest
    ? latest.deletedAt
      ? "Message deleted"
      : latest.kind === "meeting"
      ? `Google Meet session${latest.meetingAgenda ? ` · ${latest.meetingAgenda}` : ""}`
      : latest.kind === "question"
        ? `Learning question · ${latest.body.trim().replace(/\s+/g, " ").slice(0, 130)}`
        : latest.kind === "question_response"
          ? `Question response · ${latest.body.trim().replace(/\s+/g, " ").slice(0, 130)}`
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
    unreadCount,
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
    deletedAt: mentorshipMessages.deletedAt,
    createdAt: mentorshipMessages.createdAt,
  }).from(mentorshipMessages)
    .where(eq(mentorshipMessages.enrollmentId, enrollment.id))
    .orderBy(mentorshipMessages.enrollmentId, desc(mentorshipMessages.createdAt), desc(mentorshipMessages.id));
  const [summary] = await db.select({ total: count() }).from(mentorshipMessages)
    .where(eq(mentorshipMessages.enrollmentId, enrollment.id));
  return threadView(access.enrollment, access.student, access.guide, user, latest, summary?.total ?? 0, 0);
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
    deletedAt: mentorshipMessages.deletedAt,
    createdAt: mentorshipMessages.createdAt,
  }).from(mentorshipMessages)
    .where(inArray(mentorshipMessages.enrollmentId, enrollmentIds))
    .orderBy(mentorshipMessages.enrollmentId, desc(mentorshipMessages.createdAt), desc(mentorshipMessages.id));
  const latestByEnrollment = new Map(latestRows.map((row) => [row.enrollmentId, row]));
  const countRows = await db.select({ enrollmentId: mentorshipMessages.enrollmentId, total: count() })
    .from(mentorshipMessages).where(inArray(mentorshipMessages.enrollmentId, enrollmentIds))
    .groupBy(mentorshipMessages.enrollmentId);
  const countByEnrollment = new Map(countRows.map((row) => [row.enrollmentId, row.total]));
  const unreadRows = await db.select({
    enrollmentId: mentorshipMessages.enrollmentId,
    total: count(),
  }).from(mentorshipMessages)
    .leftJoin(mentorshipThreadReads, and(
      eq(mentorshipThreadReads.enrollmentId, mentorshipMessages.enrollmentId),
      eq(mentorshipThreadReads.userId, user.id),
    ))
    .where(and(
      inArray(mentorshipMessages.enrollmentId, enrollmentIds),
      ne(mentorshipMessages.senderId, user.id),
      or(
        isNull(mentorshipThreadReads.userId),
        isNull(mentorshipThreadReads.lastReadAt),
        sql`(${mentorshipMessages.createdAt}, ${mentorshipMessages.id}) > (${mentorshipThreadReads.lastReadAt}, ${mentorshipThreadReads.lastReadMessageId})`,
      ),
    ))
    .groupBy(mentorshipMessages.enrollmentId);
  const unreadByEnrollment = new Map(unreadRows.map((row) => [row.enrollmentId, row.total]));

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
      unreadByEnrollment.get(enrollment.id) ?? 0,
    );
    return value ? [value] : [];
  });
  res.set("Cache-Control", "private, no-store");
  res.json(ListMentorshipThreadsResponse.parse(result));
});

router.get("/mentorship/notification-preference", async (req, res): Promise<void> => {
  const user = req.learner!;
  if (!roleCanUseMentorship(user)) {
    res.status(403).json({ error: "Student or assigned guide access is required." });
    return;
  }
  const [preference] = await db.select({
    browserNotificationsEnabled: mentorshipNotificationPreferences.browserNotificationsEnabled,
  }).from(mentorshipNotificationPreferences)
    .where(eq(mentorshipNotificationPreferences.userId, user.id)).limit(1);
  res.set("Cache-Control", "private, no-store");
  res.json({ browserNotificationsEnabled: preference?.browserNotificationsEnabled ?? false });
});

router.put("/mentorship/notification-preference", async (req, res): Promise<void> => {
  const user = req.learner!;
  if (!roleCanUseMentorship(user)) {
    res.status(403).json({ error: "Student or assigned guide access is required." });
    return;
  }
  const parsed = UpdateMentorshipNotificationPreferenceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose whether browser notifications are enabled." });
    return;
  }
  const [preference] = await db.insert(mentorshipNotificationPreferences).values({
    userId: user.id,
    browserNotificationsEnabled: parsed.data.browserNotificationsEnabled,
  }).onConflictDoUpdate({
    target: mentorshipNotificationPreferences.userId,
    set: {
      browserNotificationsEnabled: parsed.data.browserNotificationsEnabled,
      updatedAt: new Date(),
    },
  }).returning({ browserNotificationsEnabled: mentorshipNotificationPreferences.browserNotificationsEnabled });
  res.set("Cache-Control", "private, no-store");
  res.json(preference);
});

router.get("/mentorship/events", async (req, res): Promise<void> => {
  const user = req.learner!;
  if (!roleCanUseMentorship(user)) {
    res.status(403).json({ error: "Student or assigned guide access is required." });
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
  const unsubscribe = subscribeToMentorshipNotifications(user.id, res);
  const heartbeat = setInterval(() => {
    if (!res.destroyed && !res.writableEnded) res.write(": ping\n\n");
  }, 25_000);
  res.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

async function getMessagesForEnrollment(enrollmentId: string, viewerId: string) {
  const rows = await db.select({
    message: mentorshipMessages,
    senderName: learners.name,
  }).from(mentorshipMessages)
    .innerJoin(learners, eq(learners.id, mentorshipMessages.senderId))
    .where(eq(mentorshipMessages.enrollmentId, enrollmentId))
    .orderBy(asc(mentorshipMessages.createdAt), asc(mentorshipMessages.id));
  if (rows.length === 0) return [];
  const messageIds = rows.map((row) => row.message.id);
  const questionIds = rows.filter((row) => row.message.kind === "question").map((row) => row.message.id);
  const [attachments, reactionRows, readRows] = await Promise.all([
    db.select().from(mentorshipAttachments)
      .where(inArray(mentorshipAttachments.messageId, messageIds))
      .orderBy(asc(mentorshipAttachments.createdAt)),
    db.select().from(mentorshipMessageReactions)
      .where(inArray(mentorshipMessageReactions.messageId, messageIds)),
    db.select().from(mentorshipThreadReads)
      .where(and(eq(mentorshipThreadReads.enrollmentId, enrollmentId), ne(mentorshipThreadReads.userId, viewerId))),
  ]);
  const questions = questionIds.length
    ? await db.select().from(mentorshipQuestions).where(inArray(mentorshipQuestions.messageId, questionIds))
    : [];
  const questionsByMessage = new Map(questions.map((question) => [question.messageId, question]));
  const reactionsByMessage = summarizeChatReactions(reactionRows, viewerId);
  const counterpartRead = readRows[0];
  const attachmentsByMessage = new Map<string, typeof attachments>();
  for (const attachment of attachments) {
    const group = attachmentsByMessage.get(attachment.messageId) ?? [];
    group.push(attachment);
    attachmentsByMessage.set(attachment.messageId, group);
  }
  return rows.map(({ message, senderName }) => ({
    ...message,
    body: message.deletedAt ? "" : message.body,
    senderName,
    readByCount: message.senderId === viewerId && readPositionIncludesMessage(
      counterpartRead?.lastReadAt ?? null,
      counterpartRead?.lastReadMessageId ?? null,
      message.createdAt,
      message.id,
    ) ? 1 : 0,
    reactions: message.deletedAt ? [] : reactionsByMessage.get(message.id) ?? [],
    question: questionsByMessage.get(message.id)
      ? {
          type: questionsByMessage.get(message.id)!.type,
          options: questionsByMessage.get(message.id)!.options,
        }
      : null,
    attachments: message.deletedAt ? [] : (attachmentsByMessage.get(message.id) ?? []).map((attachment) => ({
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
  const [latestMessage] = await db.select({
    id: mentorshipMessages.id,
    createdAt: mentorshipMessages.createdAt,
  }).from(mentorshipMessages)
    .where(eq(mentorshipMessages.enrollmentId, access.enrollment.id))
    .orderBy(desc(mentorshipMessages.createdAt), desc(mentorshipMessages.id))
    .limit(1);
  const [previousRead] = await db.select().from(mentorshipThreadReads)
    .where(and(
      eq(mentorshipThreadReads.enrollmentId, access.enrollment.id),
      eq(mentorshipThreadReads.userId, req.learner!.id),
    )).limit(1);
  const readAdvanced = !!latestMessage && !readPositionIncludesMessage(
    previousRead?.lastReadAt ?? null,
    previousRead?.lastReadMessageId ?? null,
    latestMessage.createdAt,
    latestMessage.id,
  );
  if (!previousRead || readAdvanced) {
    await db.insert(mentorshipThreadReads).values({
      enrollmentId: access.enrollment.id,
      userId: req.learner!.id,
      lastReadAt: latestMessage?.createdAt ?? null,
      lastReadMessageId: latestMessage?.id ?? null,
    }).onConflictDoUpdate({
      target: [mentorshipThreadReads.enrollmentId, mentorshipThreadReads.userId],
      set: {
        lastReadAt: latestMessage?.createdAt ?? null,
        lastReadMessageId: latestMessage?.id ?? null,
      },
    });
  }
  const thread = await buildThread(access.enrollment, req.learner!);
  if (readAdvanced) publishMentorshipRead(access.enrollment.id, req.learner!.id);
  const messages = await getMessagesForEnrollment(access.enrollment.id, req.learner!.id);
  res.set("Cache-Control", "private, no-store");
  res.json(ListMentorshipMessagesResponse.parse({ thread, messages }));
});

router.post("/mentorship/threads/:enrollmentId/questions/:questionId/responses", async (req, res): Promise<void> => {
  const params = AnswerMentorshipQuestionParams.safeParse(req.params);
  const parsed = AnswerMentorshipQuestionBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Write a response and try again." });
    return;
  }
  const user = req.learner!;
  if (user.role !== "student") {
    res.status(403).json({ error: "Only the enrolled student can answer this question." });
    return;
  }
  const access = await loadEnrollmentAccess(params.data.enrollmentId, user);
  if (!access) {
    res.status(403).json({ error: "You are not part of this conversation." });
    return;
  }
  if (!access.guide || !canSendMentorshipMessage(user, access.enrollment)) {
    res.status(403).json({ error: "A guide must be assigned before you can answer." });
    return;
  }
  const [question] = await db.select({
    message: mentorshipMessages,
    question: mentorshipQuestions,
  }).from(mentorshipMessages)
    .innerJoin(mentorshipQuestions, eq(mentorshipQuestions.messageId, mentorshipMessages.id))
    .where(and(
      eq(mentorshipMessages.id, params.data.questionId),
      eq(mentorshipMessages.enrollmentId, access.enrollment.id),
      eq(mentorshipMessages.kind, "question"),
    ))
    .limit(1);
  if (!question || question.message.senderRole !== "guide") {
    res.status(404).json({ error: "This question was not found in the conversation." });
    return;
  }
  const responseText = parsed.data.response.trim();
  const normalizedQuestion = {
    type: question.question.type,
    options: question.question.options,
  };
  if (!isValidMentorshipQuestionResponse(normalizedQuestion, responseText)) {
    res.status(400).json({
      error: question.question.type === "multiple_choice"
        ? "Choose one of the options shown."
        : "Write a response of up to 3,000 characters.",
    });
    return;
  }

  const [saved] = await db.insert(mentorshipMessages).values({
    id: randomUUID(),
    enrollmentId: access.enrollment.id,
    senderId: user.id,
    senderRole: "student",
    kind: "question_response",
    body: responseText,
    replyToMessageId: question.message.id,
  }).returning();
  if (!saved) {
    res.status(409).json({ error: "Your response could not be saved. Please try again." });
    return;
  }
  const result = AnswerMentorshipQuestionResponse.parse({
    ...saved,
    senderName: user.name,
    question: null,
    reactions: [],
    readByCount: 0,
    attachments: [],
  });
  publishMentorshipMessage(access.enrollment.id, saved.id);
  if (access.guide) publishMentorshipNotification(access.guide.id, access.enrollment.id, saved.id);
  res.status(201).set("Cache-Control", "private, no-store").json(result);
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
    res.status(400).json({ error: `Use a voice note up to ${MAX_MENTORSHIP_VOICE_NOTE_BYTES / (1024 * 1024)} MB, or an image or document up to ${MAX_MENTORSHIP_ATTACHMENT_BYTES / (1024 * 1024)} MB.` });
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
  let replyToMessageId: string | null = null;
  if (parsed.data.replyToMessageId) {
    if (parsed.data.kind !== "text") {
      res.status(400).json({ error: "Only a regular message can reply to another message." });
      return;
    }
    const [reply] = await db.select({ id: mentorshipMessages.id }).from(mentorshipMessages)
      .where(and(
        eq(mentorshipMessages.id, parsed.data.replyToMessageId),
        eq(mentorshipMessages.enrollmentId, access.enrollment.id),
      )).limit(1);
    if (!reply) {
      res.status(400).json({ error: "Reply to a message in this conversation." });
      return;
    }
    replyToMessageId = reply.id;
  }
  let questionData: ReturnType<typeof normalizeMentorshipQuestion> = null;
  if (parsed.data.kind === "meeting") {
    if (user.role !== "guide") {
      res.status(403).json({ error: "Only the assigned guide can share a Meet session." });
      return;
    }
    if (!parsed.data.meetingUrl || !isGoogleMeetLink(parsed.data.meetingUrl) || uploadTokens.length || parsed.data.question) {
      res.status(400).json({ error: "Paste a valid Google Meet link. Meeting posts cannot include file attachments." });
      return;
    }
  } else if (parsed.data.kind === "question") {
    if (user.role !== "guide") {
      res.status(403).json({ error: "Only the assigned guide can ask a learning question." });
      return;
    }
    if (!body || body.length > 1200 || uploadTokens.length || parsed.data.meetingUrl || parsed.data.meetingStartsAt || meetingAgenda || !parsed.data.question) {
      res.status(400).json({ error: "Add a question of up to 1,200 characters, with no attachments or meeting details." });
      return;
    }
    questionData = normalizeMentorshipQuestion(parsed.data.question.type, parsed.data.question.options);
    if (!questionData) {
      res.status(400).json({ error: "A multiple-choice question needs 2–6 distinct options. Open questions do not use options." });
      return;
    }
  } else if (parsed.data.meetingUrl || parsed.data.meetingStartsAt || parsed.data.meetingAgenda || parsed.data.question) {
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
        replyToMessageId,
      }).returning();
      if (!message) throw new Error("Message insert did not return a row.");
      if (questionData) {
        await tx.insert(mentorshipQuestions).values({
          messageId: message.id,
          type: questionData.type,
          options: questionData.options,
        });
      }
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
    question: questionData,
    reactions: [],
    readByCount: 0,
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
  const recipientId = getMentorshipCounterpartId(user.id, access.student.id, access.guide?.id ?? null);
  if (recipientId) publishMentorshipNotification(recipientId, access.enrollment.id, saved.id);
  res.status(201).set("Cache-Control", "private, no-store").json(response);
});

router.patch("/mentorship/threads/:enrollmentId/messages/:messageId", async (req, res): Promise<void> => {
  const params = EditMentorshipMessageParams.safeParse(req.params);
  const parsed = EditMentorshipMessageBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Write a message of up to 5,000 characters." });
    return;
  }
  const user = req.learner!;
  const access = await loadEnrollmentAccess(params.data.enrollmentId, user);
  if (!access) {
    res.status(403).json({ error: "You are not part of this conversation." });
    return;
  }
  const [message] = await db.select().from(mentorshipMessages)
    .where(and(
      eq(mentorshipMessages.id, params.data.messageId),
      eq(mentorshipMessages.enrollmentId, access.enrollment.id),
    )).limit(1);
  if (!message || message.kind !== "text" || message.deletedAt) {
    res.status(404).json({ error: "This message cannot be edited." });
    return;
  }
  if (message.senderId !== user.id) {
    res.status(403).json({ error: "You can only edit your own messages." });
    return;
  }
  const body = parsed.data.body.trim();
  if (!body) {
    res.status(400).json({ error: "A message cannot be empty." });
    return;
  }
  await db.update(mentorshipMessages).set({ body, editedAt: new Date() })
    .where(eq(mentorshipMessages.id, message.id));
  const updated = (await getMessagesForEnrollment(access.enrollment.id, user.id))
    .find((item) => item.id === message.id);
  if (!updated) {
    res.status(404).json({ error: "This message could not be reloaded." });
    return;
  }
  publishMentorshipMessage(access.enrollment.id, message.id);
  res.set("Cache-Control", "private, no-store").json(EditMentorshipMessageResponse.parse(updated));
});

router.delete("/mentorship/threads/:enrollmentId/messages/:messageId", async (req, res): Promise<void> => {
  const params = DeleteMentorshipMessageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Choose a valid message." });
    return;
  }
  const user = req.learner!;
  const access = await loadEnrollmentAccess(params.data.enrollmentId, user);
  if (!access) {
    res.status(403).json({ error: "You are not part of this conversation." });
    return;
  }
  const [message] = await db.select().from(mentorshipMessages)
    .where(and(
      eq(mentorshipMessages.id, params.data.messageId),
      eq(mentorshipMessages.enrollmentId, access.enrollment.id),
    )).limit(1);
  if (!message || message.kind !== "text" || message.deletedAt) {
    res.status(404).json({ error: "This message cannot be deleted." });
    return;
  }
  if (message.senderId !== user.id) {
    res.status(403).json({ error: "You can only delete your own messages." });
    return;
  }
  await db.update(mentorshipMessages).set({ body: "", deletedAt: new Date() })
    .where(eq(mentorshipMessages.id, message.id));
  const updated = (await getMessagesForEnrollment(access.enrollment.id, user.id))
    .find((item) => item.id === message.id);
  if (!updated) {
    res.status(404).json({ error: "This message could not be reloaded." });
    return;
  }
  publishMentorshipMessage(access.enrollment.id, message.id);
  res.set("Cache-Control", "private, no-store").json(DeleteMentorshipMessageResponse.parse(updated));
});

router.put("/mentorship/threads/:enrollmentId/messages/:messageId/reactions", async (req, res): Promise<void> => {
  const params = ToggleMentorshipMessageReactionParams.safeParse(req.params);
  const parsed = ToggleMentorshipMessageReactionBody.safeParse(req.body);
  if (!params.success || !parsed.success || !CHAT_REACTIONS.includes(parsed.data.reaction)) {
    res.status(400).json({ error: "Choose a supported reaction." });
    return;
  }
  const user = req.learner!;
  const access = await loadEnrollmentAccess(params.data.enrollmentId, user);
  if (!access) {
    res.status(403).json({ error: "You are not part of this conversation." });
    return;
  }
  const [message] = await db.select({ id: mentorshipMessages.id, deletedAt: mentorshipMessages.deletedAt })
    .from(mentorshipMessages)
    .where(and(
      eq(mentorshipMessages.id, params.data.messageId),
      eq(mentorshipMessages.enrollmentId, access.enrollment.id),
    )).limit(1);
  if (!message || message.deletedAt) {
    res.status(404).json({ error: "This message is not available." });
    return;
  }
  const existing = await db.select({ reaction: mentorshipMessageReactions.reaction })
    .from(mentorshipMessageReactions)
    .where(and(
      eq(mentorshipMessageReactions.messageId, message.id),
      eq(mentorshipMessageReactions.userId, user.id),
      eq(mentorshipMessageReactions.reaction, parsed.data.reaction),
    )).limit(1);
  if (existing.length) {
    await db.delete(mentorshipMessageReactions).where(and(
      eq(mentorshipMessageReactions.messageId, message.id),
      eq(mentorshipMessageReactions.userId, user.id),
      eq(mentorshipMessageReactions.reaction, parsed.data.reaction),
    ));
  } else {
    await db.insert(mentorshipMessageReactions).values({
      messageId: message.id,
      userId: user.id,
      reaction: parsed.data.reaction,
    }).onConflictDoNothing();
  }
  const reactionRows = await db.select().from(mentorshipMessageReactions)
    .where(eq(mentorshipMessageReactions.messageId, message.id));
  const reactions = summarizeChatReactions(reactionRows, user.id).get(message.id) ?? [];
  publishMentorshipMessage(access.enrollment.id, message.id);
  res.set("Cache-Control", "private, no-store").json(ToggleMentorshipMessageReactionResponse.parse({
    messageId: message.id,
    reactions,
  }));
});

router.post("/mentorship/threads/:enrollmentId/typing", async (req, res): Promise<void> => {
  const params = UpdateMentorshipTypingParams.safeParse(req.params);
  const parsed = UpdateMentorshipTypingBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Choose a valid conversation." });
    return;
  }
  const user = req.learner!;
  const access = await loadEnrollmentAccess(params.data.enrollmentId, user);
  if (!access || !canSendMentorshipMessage(user, access.enrollment)) {
    res.status(403).json({ error: "You cannot send messages in this conversation." });
    return;
  }
  publishMentorshipTyping(access.enrollment.id, user.id, user.name, parsed.data.typing);
  res.status(204).end();
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
  const unsubscribe = subscribeToMentorshipThread(access.enrollment.id, req.learner!.id, res);
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
    .where(and(
      eq(mentorshipAttachments.id, params.data.attachmentId),
      isNull(mentorshipMessages.deletedAt),
    )).limit(1);
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
  const disposition = row.attachment.contentType.startsWith("image/") || row.attachment.contentType.startsWith("audio/")
    ? "inline"
    : "attachment";
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
