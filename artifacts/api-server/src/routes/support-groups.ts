import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream";
import { Router, type IRouter } from "express";
import { and, asc, count, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import {
  db,
  enrollments,
  internshipGuides,
  learners,
  studyTeaching,
  supportGroupAttachments,
  supportGroupMembers,
  supportGroupMessages,
  supportGroupMessageReactions,
  supportGroupQuestions,
  supportGroupReads,
  supportGroups,
  type Learner,
} from "@workspace/db";
import {
  AnswerSupportGroupQuestionBody,
  AnswerSupportGroupQuestionParams,
  AnswerSupportGroupQuestionResponse,
  CreateGuideSupportGroupBody,
  CreateGuideSupportGroupResponse,
  DeleteSupportGroupMessageParams,
  DeleteSupportGroupMessageResponse,
  DownloadSupportGroupAttachmentParams,
  EditSupportGroupMessageBody,
  EditSupportGroupMessageParams,
  EditSupportGroupMessageResponse,
  GetGuideSupportReviewQueryParams,
  GetGuideSupportReviewResponse,
  ListSupportGroupMessagesParams,
  ListSupportGroupMessagesResponse,
  ListSupportGroupsResponse,
  RequestSupportGroupUploadBody,
  RequestSupportGroupUploadParams,
  RequestSupportGroupUploadResponse,
  SendSupportGroupMessageBody,
  SendSupportGroupMessageResponse,
  StreamSupportGroupEventsParams,
  ToggleSupportGroupMessageReactionBody,
  ToggleSupportGroupMessageReactionParams,
  ToggleSupportGroupMessageReactionResponse,
  UpdateSupportGroupTypingBody,
  UpdateSupportGroupTypingParams,
  UpdateGuideSupportGroupMembersBody,
  UpdateGuideSupportGroupMembersParams,
  UpdateGuideSupportGroupMembersResponse,
} from "@workspace/api-zod";
import { checkAssessment, requireGuide, requireLearner } from "../lib/auth";
import { courses, findCourse } from "../lib/catalog";
import { enrollmentViews } from "../lib/learning";
import {
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
import {
  publishSupportGroupMessage,
  publishSupportGroupRead,
  publishSupportGroupTyping,
  revokeSupportGroupMembers,
  subscribeToSupportGroup,
} from "../lib/support-group-events";
import { canPostSupportGroupKind, supportGroupAccess } from "../lib/support-group-rules";
import { supportReviewSignals } from "../lib/support-review";
import { CHAT_REACTIONS, readPositionIncludesMessage, summarizeChatReactions } from "../lib/chat-features";

const router: IRouter = Router();
router.use("/support-groups", requireLearner, checkAssessment);
router.use("/guide/support-groups", requireGuide);

type GroupRow = typeof supportGroups.$inferSelect;
type GroupMessageRow = typeof supportGroupMessages.$inferSelect;
type GroupQuestion = { type: "multiple_choice" | "open_response"; options: string[] };

async function groupAccess(groupId: string, user: Learner) {
  const [group] = await db.select().from(supportGroups)
    .where(eq(supportGroups.id, groupId)).limit(1);
  if (!group) return { group: null, allowed: false, guide: false };
  let isMember = false;
  if (user.role === "student") {
    const [membership] = await db.select({ userId: supportGroupMembers.userId })
      .from(supportGroupMembers)
      .where(and(eq(supportGroupMembers.groupId, groupId), eq(supportGroupMembers.userId, user.id)))
      .limit(1);
    isMember = !!membership;
  }
  return { group, ...supportGroupAccess(user, group, isMember) };
}

async function freshGroupAccess(groupId: string, userId: string) {
  const [user] = await db.select().from(learners).where(eq(learners.id, userId)).limit(1);
  return user ? groupAccess(groupId, user) : null;
}

async function membersForGroup(groupId: string) {
  return db.select({
    userId: learners.id,
    name: learners.name,
    enrollmentId: supportGroupMembers.enrollmentId,
    joinedAt: supportGroupMembers.joinedAt,
  }).from(supportGroupMembers)
    .innerJoin(learners, eq(learners.id, supportGroupMembers.userId))
    .where(eq(supportGroupMembers.groupId, groupId))
    .orderBy(asc(learners.name));
}

function messagePreview(message: Pick<GroupMessageRow, "kind" | "body" | "meetingAgenda" | "deletedAt">) {
  if (message.deletedAt) return "Message deleted";
  if (message.kind === "meeting") {
    return `Google Meet session${message.meetingAgenda ? ` · ${message.meetingAgenda}` : ""}`.slice(0, 160);
  }
  if (message.kind === "question") return `Learning question · ${message.body.trim().replace(/\s+/g, " ").slice(0, 130)}`;
  if (message.kind === "question_response") return `Question response · ${message.body.trim().replace(/\s+/g, " ").slice(0, 130)}`;
  return message.body.trim().replace(/\s+/g, " ").slice(0, 160) || "Shared an attachment";
}

async function groupView(group: GroupRow, user: Learner) {
  const course = findCourse(group.courseId);
  const [guideRow, memberCountRow, messageCountRow, unreadCountRow, latestRows] = await Promise.all([
    db.select({ id: learners.id, name: learners.name }).from(learners)
      .where(eq(learners.id, group.guideId)).limit(1),
    db.select({ total: count() }).from(supportGroupMembers)
      .where(eq(supportGroupMembers.groupId, group.id)),
    db.select({ total: count() }).from(supportGroupMessages)
      .where(eq(supportGroupMessages.groupId, group.id)),
    db.select({ total: count() }).from(supportGroupMessages)
      .leftJoin(supportGroupReads, and(
        eq(supportGroupReads.groupId, group.id),
        eq(supportGroupReads.userId, user.id),
      ))
      .where(and(
        eq(supportGroupMessages.groupId, group.id),
        ne(supportGroupMessages.senderId, user.id),
        or(
          isNull(supportGroupReads.lastReadAt),
          sql`(${supportGroupMessages.createdAt}, ${supportGroupMessages.id}) > (${supportGroupReads.lastReadAt}, ${supportGroupReads.lastReadMessageId})`,
        ),
      )),
    db.select({
      kind: supportGroupMessages.kind,
      body: supportGroupMessages.body,
      meetingAgenda: supportGroupMessages.meetingAgenda,
      deletedAt: supportGroupMessages.deletedAt,
      createdAt: supportGroupMessages.createdAt,
    }).from(supportGroupMessages)
      .where(eq(supportGroupMessages.groupId, group.id))
      .orderBy(desc(supportGroupMessages.createdAt)).limit(1),
  ]);
  const guide = guideRow[0];
  if (!course || !guide) return null;
  const latest = latestRows[0];
  return {
    id: group.id,
    courseId: group.courseId,
    courseTitle: course.title,
    name: group.name,
    purpose: group.purpose,
    guideId: group.guideId,
    guideName: guide.name,
    memberCount: Number(memberCountRow[0]?.total ?? 0),
    messageCount: Number(messageCountRow[0]?.total ?? 0),
    unreadCount: Number(unreadCountRow[0]?.total ?? 0),
    lastMessagePreview: latest ? messagePreview(latest) : null,
    lastMessageAt: latest?.createdAt.toISOString() ?? null,
    canManageMembers: user.role === "guide" && user.id === group.guideId,
    createdAt: group.createdAt.toISOString(),
  };
}

async function attachmentsForMessages(messageIds: string[]) {
  if (!messageIds.length) return new Map<string, typeof supportGroupAttachments.$inferSelect[]>();
  const rows = await db.select().from(supportGroupAttachments)
    .where(inArray(supportGroupAttachments.messageId, messageIds));
  const result = new Map<string, typeof supportGroupAttachments.$inferSelect[]>();
  for (const row of rows) result.set(row.messageId, [...(result.get(row.messageId) ?? []), row]);
  return result;
}

async function messageViews(groupId: string, viewerId: string, limit = 100) {
  const recent = await db.select().from(supportGroupMessages)
    .where(eq(supportGroupMessages.groupId, groupId))
    .orderBy(desc(supportGroupMessages.createdAt)).limit(limit);
  const rows = recent.reverse();
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const senderIds = [...new Set(rows.map((row) => row.senderId))];
  const [senderRows, questionRows, attachmentMap, reactionRows, readRows] = await Promise.all([
    db.select({ id: learners.id, name: learners.name }).from(learners).where(inArray(learners.id, senderIds)),
    db.select().from(supportGroupQuestions).where(inArray(supportGroupQuestions.messageId, ids)),
    attachmentsForMessages(ids),
    db.select().from(supportGroupMessageReactions).where(inArray(supportGroupMessageReactions.messageId, ids)),
    db.select().from(supportGroupReads).where(eq(supportGroupReads.groupId, groupId)),
  ]);
  const senderMap = new Map(senderRows.map((row) => [row.id, row.name]));
  const questionMap = new Map(questionRows.map((row) => [row.messageId, row]));
  const reactionsByMessage = summarizeChatReactions(reactionRows, viewerId);
  return rows.map((row) => {
    const question = questionMap.get(row.id);
    const attachments = attachmentMap.get(row.id) ?? [];
    return {
      ...row,
      body: row.deletedAt ? "" : row.body,
      senderName: senderMap.get(row.senderId) ?? "Group member",
      readByCount: readRows.filter((read) => read.userId !== row.senderId
        && readPositionIncludesMessage(read.lastReadAt, read.lastReadMessageId, row.createdAt, row.id)).length,
      reactions: row.deletedAt ? [] : reactionsByMessage.get(row.id) ?? [],
      question: question ? { type: question.type, options: question.options } : null,
      replyToMessageId: row.replyToMessageId,
      attachments: row.deletedAt ? [] : attachments.map((attachment) => ({
        id: attachment.id,
        fileName: attachment.fileName,
        contentType: attachment.contentType,
        size: attachment.size,
        downloadUrl: `/api/support-groups/attachments/${attachment.id}`,
        isImage: attachment.contentType.startsWith("image/"),
      })),
    };
  });
}

async function groupResponse(group: GroupRow, user: Learner) {
  const [latestMessage] = await db.select({
    id: supportGroupMessages.id,
    createdAt: supportGroupMessages.createdAt,
  }).from(supportGroupMessages)
    .where(eq(supportGroupMessages.groupId, group.id))
    .orderBy(desc(supportGroupMessages.createdAt), desc(supportGroupMessages.id))
    .limit(1);
  const [previousRead] = await db.select().from(supportGroupReads)
    .where(and(eq(supportGroupReads.groupId, group.id), eq(supportGroupReads.userId, user.id)))
    .limit(1);
  const readAdvanced = !!latestMessage && !readPositionIncludesMessage(
    previousRead?.lastReadAt ?? null,
    previousRead?.lastReadMessageId ?? null,
    latestMessage.createdAt,
    latestMessage.id,
  );
  if (!previousRead || readAdvanced) {
    await db.insert(supportGroupReads).values({
      groupId: group.id,
      userId: user.id,
      lastReadAt: latestMessage?.createdAt ?? null,
      lastReadMessageId: latestMessage?.id ?? null,
    }).onConflictDoUpdate({
      target: [supportGroupReads.groupId, supportGroupReads.userId],
      set: {
        lastReadAt: latestMessage?.createdAt ?? null,
        lastReadMessageId: latestMessage?.id ?? null,
      },
    });
  }
  if (readAdvanced) publishSupportGroupRead(group.id, user.id);
  const [view, members, messages] = await Promise.all([
    groupView(group, user),
    membersForGroup(group.id),
    messageViews(group.id, user.id),
  ]);
  if (!view) return null;
  return {
    group: view,
    members: members.map((member) => ({
      userId: member.userId,
      name: member.name,
      enrollmentId: member.enrollmentId,
      joinedAt: member.joinedAt.toISOString(),
    })),
    messages,
  };
}

router.get("/guide/support-review", requireGuide, async (req, res): Promise<void> => {
  const parsed = GetGuideSupportReviewQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose a supported course." });
    return;
  }
  const user = req.learner!;
  const [guide] = await db.select({ supportedCourseIds: internshipGuides.supportedCourseIds })
    .from(internshipGuides).where(eq(internshipGuides.userId, user.id)).limit(1);
  if (!guide) {
    res.status(403).json({ error: "Your guide account is not set up yet." });
    return;
  }
  const allAssignments = await db.select().from(enrollments)
    .where(eq(enrollments.guideId, user.id))
    .orderBy(asc(enrollments.createdAt));
  const supportedIds = new Set([
    ...(Array.isArray(guide.supportedCourseIds) ? guide.supportedCourseIds : []),
    ...allAssignments.map((row) => row.courseId),
  ]);
  const supportedCourses = courses.filter((course) => supportedIds.has(course.id))
    .map(({ id, title }) => ({ id, title }));
  if (parsed.data.courseId && !supportedIds.has(parsed.data.courseId)) {
    res.status(400).json({ error: "That course is not in your guide coverage." });
    return;
  }
  const selectedCourseId = parsed.data.courseId ?? allAssignments[0]?.courseId ?? supportedCourses[0]?.id ?? null;
  if (!selectedCourseId) {
    res.set("Cache-Control", "private, no-store");
    res.json(GetGuideSupportReviewResponse.parse({
      supportedCourses,
      selectedCourseId: null,
      learners: [],
    }));
    return;
  }
  if (!supportedIds.has(selectedCourseId)) {
    res.status(400).json({ error: "That course is not in your guide coverage." });
    return;
  }
  const assignments = allAssignments.filter((row) => row.courseId === selectedCourseId);
  const course = findCourse(selectedCourseId);
  if (!course) {
    res.status(400).json({ error: "That course is not available." });
    return;
  }
  if (!assignments.length) {
    res.set("Cache-Control", "private, no-store");
    res.json(GetGuideSupportReviewResponse.parse({
      supportedCourses,
      selectedCourseId,
      learners: [],
    }));
    return;
  }

  const learnerIds = [...new Set(assignments.map((row) => row.userId))];
  const [learnerRows, checkRows, pacingViews] = await Promise.all([
    db.select({
      id: learners.id,
      name: learners.name,
      email: learners.email,
    }).from(learners).where(inArray(learners.id, learnerIds)),
    db.select({
      userId: studyTeaching.userId,
      total: count(),
      secure: sql<number>`count(*) filter (where ${studyTeaching.verdict} = 'secure')`.mapWith(Number),
    }).from(studyTeaching)
      .where(and(inArray(studyTeaching.userId, learnerIds), eq(studyTeaching.courseId, course.id)))
      .groupBy(studyTeaching.userId),
    enrollmentViews(assignments, []),
  ]);
  const learnersById = new Map(learnerRows.map((row) => [row.id, row]));
  const checksById = new Map(checkRows.map((row) => [row.userId, row]));
  const learnersForReview = assignments.flatMap((assignment, index) => {
    const learner = learnersById.get(assignment.userId);
    const pacing = pacingViews[index]?.pacing;
    if (!learner || !pacing) return [];
    const check = checksById.get(assignment.userId);
    const signals = supportReviewSignals({
      courseStatus: assignment.status,
      paceStatus: pacing.status,
      deltaDays: pacing.deltaDays,
      studyChecks: Number(check?.total ?? 0),
      secureChecks: Number(check?.secure ?? 0),
    });
    return [{
      id: learner.id,
      name: learner.name,
      email: learner.email,
      enrollmentId: assignment.id,
      courseId: course.id,
      courseTitle: course.title,
      hours: assignment.hours,
      courseStatus: assignment.status,
      completedPercent: pacing.completedPercent,
      expectedPercent: pacing.expectedPercent,
      ...signals,
    }];
  }).sort((a, b) => {
    if (a.needsSupportReview !== b.needsSupportReview) return a.needsSupportReview ? -1 : 1;
    const aSignals = Number(a.pace.triggered) + Number(a.learningChecks.triggered);
    const bSignals = Number(b.pace.triggered) + Number(b.learningChecks.triggered);
    return bSignals - aSignals || a.name.localeCompare(b.name);
  });

  res.set("Cache-Control", "private, no-store");
  res.json(GetGuideSupportReviewResponse.parse({
    supportedCourses,
    selectedCourseId: course.id,
    learners: learnersForReview,
  }));
});

router.post("/guide/support-groups", async (req, res): Promise<void> => {
  const parsed = CreateGuideSupportGroupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Check the group name, purpose, course, and learner selection." });
    return;
  }
  const user = req.learner!;
  const { courseId, name, purpose } = parsed.data;
  const enrollmentIds = [...new Set(parsed.data.enrollmentIds)];
  if (enrollmentIds.length < 2 || enrollmentIds.length > 20) {
    res.status(400).json({ error: "Select between 2 and 20 learners for a group." });
    return;
  }
  const assignments = await db.select().from(enrollments)
    .where(and(
      inArray(enrollments.id, enrollmentIds),
      eq(enrollments.guideId, user.id),
      eq(enrollments.courseId, courseId),
    ));
  const distinctLearners = new Set(assignments.map((row) => row.userId));
  if (assignments.length !== enrollmentIds.length || distinctLearners.size !== enrollmentIds.length) {
    res.status(400).json({ error: "Choose learners assigned to you in the same course." });
    return;
  }
  const course = findCourse(courseId);
  if (!course) {
    res.status(400).json({ error: "Choose a supported course." });
    return;
  }
  const groupId = randomUUID();
  try {
    const group = await db.transaction(async (tx) => {
      const [created] = await tx.insert(supportGroups).values({
        id: groupId,
        courseId,
        guideId: user.id,
        name: name.trim(),
        purpose: purpose.trim(),
      }).returning();
      if (!created) throw new Error("Support group insert did not return a row.");
      await tx.insert(supportGroupMembers).values(assignments.map((assignment) => ({
        groupId,
        enrollmentId: assignment.id,
        userId: assignment.userId,
      })));
      return created;
    });
    const view = await groupView(group, user);
    if (!view) {
      res.status(409).json({ error: "The group was created but could not be loaded." });
      return;
    }
    res.status(201).set("Cache-Control", "private, no-store")
      .json(CreateGuideSupportGroupResponse.parse(view));
  } catch (error) {
    req.log.error({ err: error }, "Could not create course support group");
    res.status(409).json({ error: "The support group could not be created. Please try again." });
  }
});

router.patch("/guide/support-groups/:groupId/members", async (req, res): Promise<void> => {
  const params = UpdateGuideSupportGroupMembersParams.safeParse(req.params);
  const parsed = UpdateGuideSupportGroupMembersBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Check the group and member changes." });
    return;
  }
  const user = req.learner!;
  const access = await groupAccess(params.data.groupId, user);
  if (!access.group) {
    res.status(404).json({ error: "Support group not found." });
    return;
  }
  if (!access.allowed || !access.guide) {
    res.status(403).json({ error: "Only the guide who created this group can manage its members." });
    return;
  }
  const addIds = [...new Set(parsed.data.addEnrollmentIds ?? [])];
  const removeIds = [...new Set(parsed.data.removeUserIds ?? [])];
  if (!addIds.length && !removeIds.length) {
    res.status(400).json({ error: "Choose at least one member change." });
    return;
  }
  if (addIds.length > 20 || removeIds.length > 20) {
    res.status(400).json({ error: "Change up to 20 members at a time." });
    return;
  }
  const addRows = addIds.length
    ? await db.select().from(enrollments).where(and(
      inArray(enrollments.id, addIds),
      eq(enrollments.guideId, user.id),
      eq(enrollments.courseId, access.group.courseId),
    ))
    : [];
  if (addRows.length !== addIds.length || new Set(addRows.map((row) => row.userId)).size !== addRows.length) {
    res.status(400).json({ error: "New learners must be assigned to you in this course." });
    return;
  }
  if (addRows.some((row) => removeIds.includes(row.userId))) {
    res.status(400).json({ error: "A learner cannot be added and removed in the same change." });
    return;
  }
  const toRemove = removeIds.length
    ? await db.select({ userId: supportGroupMembers.userId }).from(supportGroupMembers)
      .where(and(eq(supportGroupMembers.groupId, access.group.id), inArray(supportGroupMembers.userId, removeIds)))
    : [];
  const removable = new Set(toRemove.map((row) => row.userId));
  const existing = await db.select({ userId: supportGroupMembers.userId })
    .from(supportGroupMembers).where(eq(supportGroupMembers.groupId, access.group.id));
  const addedUsers = new Set(addRows.map((row) => row.userId));
  const finalCount = new Set([
    ...existing.map((row) => row.userId).filter((id) => !removable.has(id)),
    ...addedUsers,
  ]).size;
  if (finalCount < 2) {
    res.status(400).json({ error: "Keep at least two learners in a support group." });
    return;
  }
  try {
    await db.transaction(async (tx) => {
      if (addRows.length) {
        await tx.insert(supportGroupMembers).values(addRows.map((row) => ({
          groupId: access.group!.id,
          enrollmentId: row.id,
          userId: row.userId,
        }))).onConflictDoNothing();
      }
      if (removeIds.length) {
        await tx.delete(supportGroupMembers).where(and(
          eq(supportGroupMembers.groupId, access.group!.id),
          inArray(supportGroupMembers.userId, removeIds),
        ));
      }
      await tx.update(supportGroups).set({ updatedAt: new Date() })
        .where(eq(supportGroups.id, access.group!.id));
    });
  } catch (error) {
    req.log.error({ err: error }, "Could not update support group members");
    res.status(409).json({ error: "The member changes could not be saved." });
    return;
  }
  revokeSupportGroupMembers(access.group.id, toRemove.map((row) => row.userId));
  const [view, members] = await Promise.all([
    groupView(access.group, user),
    membersForGroup(access.group.id),
  ]);
  if (!view) {
    res.status(404).json({ error: "Support group not found." });
    return;
  }
  res.set("Cache-Control", "private, no-store").json(UpdateGuideSupportGroupMembersResponse.parse({
    group: view,
    members: members.map((member) => ({
      userId: member.userId,
      name: member.name,
      enrollmentId: member.enrollmentId,
      joinedAt: member.joinedAt.toISOString(),
    })),
  }));
});

router.get("/support-groups", async (req, res): Promise<void> => {
  const user = req.learner!;
  if (user.role !== "student" && user.role !== "guide") {
    res.status(403).json({ error: "Student or guide access is required." });
    return;
  }
  const groups = user.role === "guide"
    ? await db.select().from(supportGroups).where(eq(supportGroups.guideId, user.id))
      .orderBy(desc(supportGroups.updatedAt))
    : await db.select({ group: supportGroups }).from(supportGroupMembers)
      .innerJoin(supportGroups, eq(supportGroups.id, supportGroupMembers.groupId))
      .where(eq(supportGroupMembers.userId, user.id))
      .orderBy(desc(supportGroups.updatedAt))
      .then((rows) => rows.map((row) => row.group));
  const views = await Promise.all(groups.map((group) => groupView(group, user)));
  res.set("Cache-Control", "private, no-store").json(ListSupportGroupsResponse.parse(views.filter(Boolean)));
});

router.get("/support-groups/:groupId/messages", async (req, res): Promise<void> => {
  const params = ListSupportGroupMessagesParams.safeParse(req.params);
  if (!params.success) {
    res.status(404).json({ error: "Support group not found." });
    return;
  }
  const access = await groupAccess(params.data.groupId, req.learner!);
  if (!access.group) {
    res.status(404).json({ error: "Support group not found." });
    return;
  }
  if (!access.allowed) {
    res.status(403).json({ error: "You are not a member of this support group." });
    return;
  }
  const response = await groupResponse(access.group, req.learner!);
  if (!response) {
    res.status(404).json({ error: "Support group not found." });
    return;
  }
  res.set("Cache-Control", "private, no-store").json(ListSupportGroupMessagesResponse.parse(response));
});

router.post("/support-groups/:groupId/uploads", async (req, res): Promise<void> => {
  const params = RequestSupportGroupUploadParams.safeParse(req.params);
  const parsed = RequestSupportGroupUploadBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Choose a supported file." });
    return;
  }
  const access = await groupAccess(params.data.groupId, req.learner!);
  if (!access.group) {
    res.status(404).json({ error: "Support group not found." });
    return;
  }
  if (!access.allowed) {
    res.status(403).json({ error: "You are not a member of this support group." });
    return;
  }
  if (!isAllowedMentorshipAttachment(parsed.data.contentType, parsed.data.size)) {
    res.status(400).json({ error: `Use a voice note up to ${MAX_MENTORSHIP_VOICE_NOTE_BYTES / (1024 * 1024)} MB, or an image or document up to ${MAX_MENTORSHIP_ATTACHMENT_BYTES / (1024 * 1024)} MB.` });
    return;
  }
  try {
    const upload = await createMentorshipUpload({
      enrollmentId: params.data.groupId,
      userId: req.learner!.id,
      fileName: parsed.data.fileName,
      contentType: parsed.data.contentType,
      size: parsed.data.size,
    });
    res.status(201).json(RequestSupportGroupUploadResponse.parse(upload));
  } catch (error) {
    req.log.error({ err: error }, "Could not create support group upload");
    res.status(503).json({ error: "File uploads are temporarily unavailable. Please try again." });
  }
});

router.post("/support-groups/:groupId/messages", async (req, res): Promise<void> => {
  const params = ListSupportGroupMessagesParams.safeParse(req.params);
  const parsed = SendSupportGroupMessageBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Check the message and try again." });
    return;
  }
  const access = await groupAccess(params.data.groupId, req.learner!);
  if (!access.group) {
    res.status(404).json({ error: "Support group not found." });
    return;
  }
  if (!access.allowed) {
    res.status(403).json({ error: "You are not a member of this support group." });
    return;
  }
  const user = req.learner!;
  if (!canPostSupportGroupKind(user.role, parsed.data.kind)) {
    res.status(403).json({ error: "Only this group's guide can share Meet links or ask questions." });
    return;
  }
  const body = (parsed.data.body ?? "").trim();
  const meetingAgenda = (parsed.data.meetingAgenda ?? "").trim();
  const uploadTokens = parsed.data.uploadTokens ?? [];
  let questionData: GroupQuestion | null = null;
  if (parsed.data.kind === "meeting") {
    if (!access.guide) {
      res.status(403).json({ error: "Only this group's guide can share a Meet link." });
      return;
    }
    if (!parsed.data.meetingUrl || !isGoogleMeetLink(parsed.data.meetingUrl)
      || uploadTokens.length || parsed.data.question || parsed.data.replyToMessageId) {
      res.status(400).json({ error: "Paste a valid Google Meet link without attachments or a question." });
      return;
    }
  } else if (parsed.data.kind === "question") {
    if (!access.guide) {
      res.status(403).json({ error: "Only this group's guide can ask a formative question." });
      return;
    }
    if (!body || body.length > 1200 || uploadTokens.length || parsed.data.meetingUrl
      || parsed.data.meetingStartsAt || meetingAgenda || !parsed.data.question || parsed.data.replyToMessageId) {
      res.status(400).json({ error: "Add a question up to 1,200 characters, without files or meeting details." });
      return;
    }
    questionData = normalizeMentorshipQuestion(parsed.data.question.type, parsed.data.question.options);
    if (!questionData) {
      res.status(400).json({ error: "A multiple-choice question needs 2–6 distinct options. Open questions use no options." });
      return;
    }
  } else if (parsed.data.meetingUrl || parsed.data.meetingStartsAt || meetingAgenda || parsed.data.question) {
    res.status(400).json({ error: "Meeting details can only be sent with a Meet post." });
    return;
  }

  let replyToMessageId: string | null = null;
  if (parsed.data.replyToMessageId) {
    const [reply] = await db.select({ id: supportGroupMessages.id }).from(supportGroupMessages)
      .where(and(
        eq(supportGroupMessages.id, parsed.data.replyToMessageId),
        eq(supportGroupMessages.groupId, access.group.id),
      )).limit(1);
    if (!reply) {
      res.status(400).json({ error: "Reply to a message in this group." });
      return;
    }
    replyToMessageId = reply.id;
  }

  const claims: MentorshipUploadClaims[] = [];
  for (const token of uploadTokens) {
    const claim = verifyMentorshipUploadToken(token, {
      enrollmentId: params.data.groupId,
      userId: user.id,
    });
    if (!claim || !await verifyUploadedMentorshipFile(claim)) {
      res.status(400).json({ error: "An attachment is missing, expired or invalid. Upload it again." });
      return;
    }
    claims.push(claim);
  }
  if (parsed.data.kind === "text" && !body && !claims.length) {
    res.status(400).json({ error: "Write a message or add a file before sending." });
    return;
  }
  if (claims.length) {
    const reused = await db.select({ id: supportGroupAttachments.id }).from(supportGroupAttachments)
      .where(inArray(supportGroupAttachments.objectPath, claims.map((claim) => claim.objectPath))).limit(1);
    if (reused.length) {
      res.status(409).json({ error: "An uploaded file was already sent. Upload it again to share it." });
      return;
    }
  }

  try {
    const saved = await db.transaction(async (tx) => {
      const [message] = await tx.insert(supportGroupMessages).values({
        id: randomUUID(),
        groupId: access.group!.id,
        senderId: user.id,
        senderRole: access.guide ? "guide" : "student",
        kind: parsed.data.kind,
        body,
        meetingUrl: parsed.data.kind === "meeting" ? parsed.data.meetingUrl! : null,
        meetingStartsAt: parsed.data.kind === "meeting" ? parsed.data.meetingStartsAt ?? null : null,
        meetingAgenda: parsed.data.kind === "meeting" ? meetingAgenda : "",
        replyToMessageId,
      }).returning();
      if (!message) throw new Error("Group message insert did not return a row.");
      if (questionData) {
        await tx.insert(supportGroupQuestions).values({
          messageId: message.id,
          type: questionData.type,
          options: questionData.options,
        });
      }
      const attachments = claims.length
        ? await tx.insert(supportGroupAttachments).values(claims.map((claim) => ({
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
    const response = SendSupportGroupMessageResponse.parse({
      ...saved.message,
      senderName: user.name,
      question: questionData,
      reactions: [],
      readByCount: 0,
      attachments: saved.attachments.map((attachment) => ({
        id: attachment.id,
        fileName: attachment.fileName,
        contentType: attachment.contentType,
        size: attachment.size,
        downloadUrl: `/api/support-groups/attachments/${attachment.id}`,
        isImage: attachment.contentType.startsWith("image/"),
      })),
    });
    await db.update(supportGroups).set({ updatedAt: new Date() })
      .where(eq(supportGroups.id, access.group.id));
    publishSupportGroupMessage(access.group.id, saved.message.id);
    res.status(201).set("Cache-Control", "private, no-store").json(response);
  } catch (error) {
    req.log.error({ err: error }, "Could not save support group message");
    res.status(409).json({ error: "The message could not be saved. Check the files and try again." });
  }
});

router.patch("/support-groups/:groupId/messages/:messageId", async (req, res): Promise<void> => {
  const params = EditSupportGroupMessageParams.safeParse(req.params);
  const parsed = EditSupportGroupMessageBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Write a message of up to 5,000 characters." });
    return;
  }
  const user = req.learner!;
  const access = await groupAccess(params.data.groupId, user);
  if (!access.group) {
    res.status(404).json({ error: "Support group not found." });
    return;
  }
  if (!access.allowed) {
    res.status(403).json({ error: "You are not a member of this support group." });
    return;
  }
  const [message] = await db.select().from(supportGroupMessages)
    .where(and(
      eq(supportGroupMessages.id, params.data.messageId),
      eq(supportGroupMessages.groupId, access.group.id),
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
  await db.update(supportGroupMessages).set({ body, editedAt: new Date() })
    .where(eq(supportGroupMessages.id, message.id));
  const updated = (await messageViews(access.group.id, user.id)).find((item) => item.id === message.id);
  if (!updated) {
    res.status(404).json({ error: "This message could not be reloaded." });
    return;
  }
  publishSupportGroupMessage(access.group.id, message.id);
  res.set("Cache-Control", "private, no-store").json(EditSupportGroupMessageResponse.parse(updated));
});

router.delete("/support-groups/:groupId/messages/:messageId", async (req, res): Promise<void> => {
  const params = DeleteSupportGroupMessageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Choose a valid message." });
    return;
  }
  const user = req.learner!;
  const access = await groupAccess(params.data.groupId, user);
  if (!access.group) {
    res.status(404).json({ error: "Support group not found." });
    return;
  }
  if (!access.allowed) {
    res.status(403).json({ error: "You are not a member of this support group." });
    return;
  }
  const [message] = await db.select().from(supportGroupMessages)
    .where(and(
      eq(supportGroupMessages.id, params.data.messageId),
      eq(supportGroupMessages.groupId, access.group.id),
    )).limit(1);
  if (!message || message.kind !== "text" || message.deletedAt) {
    res.status(404).json({ error: "This message cannot be deleted." });
    return;
  }
  if (message.senderId !== user.id) {
    res.status(403).json({ error: "You can only delete your own messages." });
    return;
  }
  await db.update(supportGroupMessages).set({ body: "", deletedAt: new Date() })
    .where(eq(supportGroupMessages.id, message.id));
  const updated = (await messageViews(access.group.id, user.id)).find((item) => item.id === message.id);
  if (!updated) {
    res.status(404).json({ error: "This message could not be reloaded." });
    return;
  }
  publishSupportGroupMessage(access.group.id, message.id);
  res.set("Cache-Control", "private, no-store").json(DeleteSupportGroupMessageResponse.parse(updated));
});

router.put("/support-groups/:groupId/messages/:messageId/reactions", async (req, res): Promise<void> => {
  const params = ToggleSupportGroupMessageReactionParams.safeParse(req.params);
  const parsed = ToggleSupportGroupMessageReactionBody.safeParse(req.body);
  if (!params.success || !parsed.success || !CHAT_REACTIONS.includes(parsed.data.reaction)) {
    res.status(400).json({ error: "Choose a supported reaction." });
    return;
  }
  const user = req.learner!;
  const access = await groupAccess(params.data.groupId, user);
  if (!access.group) {
    res.status(404).json({ error: "Support group not found." });
    return;
  }
  if (!access.allowed) {
    res.status(403).json({ error: "You are not a member of this support group." });
    return;
  }
  const [message] = await db.select({ id: supportGroupMessages.id, deletedAt: supportGroupMessages.deletedAt })
    .from(supportGroupMessages)
    .where(and(
      eq(supportGroupMessages.id, params.data.messageId),
      eq(supportGroupMessages.groupId, access.group.id),
    )).limit(1);
  if (!message || message.deletedAt) {
    res.status(404).json({ error: "This message is not available." });
    return;
  }
  const existing = await db.select({ reaction: supportGroupMessageReactions.reaction })
    .from(supportGroupMessageReactions)
    .where(and(
      eq(supportGroupMessageReactions.messageId, message.id),
      eq(supportGroupMessageReactions.userId, user.id),
      eq(supportGroupMessageReactions.reaction, parsed.data.reaction),
    )).limit(1);
  if (existing.length) {
    await db.delete(supportGroupMessageReactions).where(and(
      eq(supportGroupMessageReactions.messageId, message.id),
      eq(supportGroupMessageReactions.userId, user.id),
      eq(supportGroupMessageReactions.reaction, parsed.data.reaction),
    ));
  } else {
    await db.insert(supportGroupMessageReactions).values({
      messageId: message.id,
      userId: user.id,
      reaction: parsed.data.reaction,
    }).onConflictDoNothing();
  }
  const reactionRows = await db.select().from(supportGroupMessageReactions)
    .where(eq(supportGroupMessageReactions.messageId, message.id));
  const reactions = summarizeChatReactions(reactionRows, user.id).get(message.id) ?? [];
  publishSupportGroupMessage(access.group.id, message.id);
  res.set("Cache-Control", "private, no-store").json(ToggleSupportGroupMessageReactionResponse.parse({
    messageId: message.id,
    reactions,
  }));
});

router.post("/support-groups/:groupId/typing", async (req, res): Promise<void> => {
  const params = UpdateSupportGroupTypingParams.safeParse(req.params);
  const parsed = UpdateSupportGroupTypingBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Choose a valid group." });
    return;
  }
  const user = req.learner!;
  const access = await groupAccess(params.data.groupId, user);
  if (!access.group) {
    res.status(404).json({ error: "Support group not found." });
    return;
  }
  if (!access.allowed) {
    res.status(403).json({ error: "You are not a member of this support group." });
    return;
  }
  publishSupportGroupTyping(access.group.id, user.id, user.name, parsed.data.typing);
  res.status(204).end();
});

router.post("/support-groups/:groupId/questions/:questionId/responses", async (req, res): Promise<void> => {
  const params = AnswerSupportGroupQuestionParams.safeParse(req.params);
  const parsed = AnswerSupportGroupQuestionBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Write a response to this question." });
    return;
  }
  const access = await groupAccess(params.data.groupId, req.learner!);
  if (!access.group) {
    res.status(404).json({ error: "Support group not found." });
    return;
  }
  if (!access.allowed) {
    res.status(403).json({ error: "You are not a member of this support group." });
    return;
  }
  if (req.learner!.role !== "student") {
    res.status(403).json({ error: "Only learners can answer group questions." });
    return;
  }
  const [questionRow] = await db.select({
    message: supportGroupMessages,
    question: supportGroupQuestions,
  }).from(supportGroupQuestions)
    .innerJoin(supportGroupMessages, eq(supportGroupMessages.id, supportGroupQuestions.messageId))
    .where(and(
      eq(supportGroupQuestions.messageId, params.data.questionId),
      eq(supportGroupMessages.groupId, access.group.id),
      eq(supportGroupMessages.kind, "question"),
    )).limit(1);
  if (!questionRow) {
    res.status(404).json({ error: "That question was not found in this group." });
    return;
  }
  const question = {
    type: questionRow.question.type,
    options: questionRow.question.options,
  };
  if (!isValidMentorshipQuestionResponse(question, parsed.data.response)) {
    res.status(400).json({
      error: question.type === "multiple_choice"
        ? "Choose one of the options shown."
        : "Write a response of up to 3,000 characters.",
    });
    return;
  }
  const [saved] = await db.insert(supportGroupMessages).values({
    id: randomUUID(),
    groupId: access.group.id,
    senderId: req.learner!.id,
    senderRole: "student",
    kind: "question_response",
    body: parsed.data.response.trim(),
    replyToMessageId: questionRow.message.id,
  }).returning();
  if (!saved) {
    res.status(409).json({ error: "Your response could not be saved. Please try again." });
    return;
  }
  const response = AnswerSupportGroupQuestionResponse.parse({
    ...saved,
    senderName: req.learner!.name,
    question: null,
    reactions: [],
    readByCount: 0,
    attachments: [],
  });
  await db.update(supportGroups).set({ updatedAt: new Date() })
    .where(eq(supportGroups.id, access.group.id));
  publishSupportGroupMessage(access.group.id, saved.id);
  res.status(201).set("Cache-Control", "private, no-store").json(response);
});

router.get("/support-groups/:groupId/events", async (req, res): Promise<void> => {
  const params = StreamSupportGroupEventsParams.safeParse(req.params);
  if (!params.success) {
    res.status(404).json({ error: "Support group not found." });
    return;
  }
  const access = await groupAccess(params.data.groupId, req.learner!);
  if (!access.group) {
    res.status(404).json({ error: "Support group not found." });
    return;
  }
  if (!access.allowed) {
    res.status(403).json({ error: "You are not a member of this support group." });
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
  const unsubscribe = subscribeToSupportGroup(access.group.id, req.learner!.id, res);
  let ended = false;
  const heartbeat = setInterval(() => {
    if (ended || res.destroyed || res.writableEnded) return;
    void freshGroupAccess(access.group!.id, req.learner!.id).then((current) => {
      if (!current?.group || !current.allowed) {
        res.write("event: support-group-access-revoked\ndata: {}\n\n");
        res.end();
        ended = true;
        clearInterval(heartbeat);
        unsubscribe();
        return;
      }
      if (!res.destroyed && !res.writableEnded) res.write(": ping\n\n");
    }).catch((error: unknown) => {
      req.log.warn({ err: error }, "Could not recheck support group stream access");
      ended = true;
      clearInterval(heartbeat);
      unsubscribe();
      res.end();
    });
  }, 25_000);
  res.on("close", () => {
    ended = true;
    clearInterval(heartbeat);
    unsubscribe();
  });
});

router.get("/support-groups/attachments/:attachmentId", async (req, res): Promise<void> => {
  const params = DownloadSupportGroupAttachmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(404).json({ error: "Attachment not found." });
    return;
  }
  const [row] = await db.select({
    attachment: supportGroupAttachments,
    groupId: supportGroupMessages.groupId,
  }).from(supportGroupAttachments)
    .innerJoin(supportGroupMessages, eq(supportGroupMessages.id, supportGroupAttachments.messageId))
    .where(and(
      eq(supportGroupAttachments.id, params.data.attachmentId),
      isNull(supportGroupMessages.deletedAt),
    )).limit(1);
  if (!row) {
    res.status(404).json({ error: "Attachment not found." });
    return;
  }
  const access = await groupAccess(row.groupId, req.learner!);
  if (!access.group || !access.allowed) {
    res.status(403).json({ error: "You are not a member of this support group." });
    return;
  }
  const file = await mentorshipObjectFile(row.attachment.objectPath);
  if (!file) {
    res.status(404).json({ error: "The attachment file is no longer available." });
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
    if (error) req.log.warn({ err: error }, "Could not stream support group attachment");
  });
});

export default router;
