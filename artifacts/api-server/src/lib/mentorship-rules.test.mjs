import test from "node:test";
import assert from "node:assert/strict";
import {
  canAccessMentorshipThread,
  canSendMentorshipMessage,
  isAllowedMentorshipAttachment,
  isGoogleMeetLink,
  isValidMentorshipQuestionResponse,
  normalizeMentorshipQuestion,
  sanitizeMentorshipFileName,
} from "./mentorship-rules.ts";
import {
  AnswerMentorshipQuestionBody,
  AnswerMentorshipQuestionResponse,
  SendMentorshipMessageBody,
  SendMentorshipMessageResponse,
} from "../../../../lib/api-zod/src/generated/api.ts";

const enrollment = { userId: "student-a", guideId: "guide-a" };

test("only the enrolled student and currently assigned guide can read a thread", () => {
  assert.equal(canAccessMentorshipThread({ id: "student-a", role: "student" }, enrollment), true);
  assert.equal(canAccessMentorshipThread({ id: "guide-a", role: "guide" }, enrollment), true);
  assert.equal(canAccessMentorshipThread({ id: "student-b", role: "student" }, enrollment), false);
  assert.equal(canAccessMentorshipThread({ id: "guide-b", role: "guide" }, enrollment), false);
  assert.equal(canAccessMentorshipThread({ id: "admin-a", role: "admin" }, enrollment), false);
  assert.equal(canAccessMentorshipThread({ id: "superadmin-a", role: "superadmin" }, enrollment), false);
});

test("a conversation cannot send until its assigned guide exists", () => {
  assert.equal(canSendMentorshipMessage({ id: "student-a", role: "student" }, enrollment), true);
  assert.equal(canSendMentorshipMessage({ id: "guide-a", role: "guide" }, enrollment), true);
  assert.equal(canSendMentorshipMessage({ id: "student-a", role: "student" }, { guideId: null }), false);
  assert.equal(canSendMentorshipMessage({ id: "admin-a", role: "admin" }, enrollment), false);
});

test("attachments allow common images, documents and short audio notes within their size limits", () => {
  assert.equal(isAllowedMentorshipAttachment("image/png", 1024), true);
  assert.equal(isAllowedMentorshipAttachment("application/pdf", 2048), true);
  assert.equal(isAllowedMentorshipAttachment("audio/webm", 2048), true);
  assert.equal(isAllowedMentorshipAttachment("audio/webm;codecs=opus", 2048), true);
  assert.equal(isAllowedMentorshipAttachment("audio/mp4", 5 * 1024 * 1024), true);
  assert.equal(isAllowedMentorshipAttachment("audio/webm", 5 * 1024 * 1024 + 1), false);
  assert.equal(isAllowedMentorshipAttachment("image/svg+xml", 1024), false);
  assert.equal(isAllowedMentorshipAttachment("audio/mpeg", 1024), false);
  assert.equal(isAllowedMentorshipAttachment("application/x-msdownload", 1024), false);
  assert.equal(isAllowedMentorshipAttachment("image/jpeg", 11 * 1024 * 1024), false);
});

test("meeting links must be secure links on the Google Meet host", () => {
  assert.equal(isGoogleMeetLink("https://meet.google.com/abc-defg-hij"), true);
  assert.equal(isGoogleMeetLink("https://meet.google.com/abc-defg-hij?authuser=0"), true);
  assert.equal(isGoogleMeetLink("http://meet.google.com/abc-defg-hij"), false);
  assert.equal(isGoogleMeetLink("https://meet.google.com.example.com/abc-defg-hij"), false);
  assert.equal(isGoogleMeetLink("https://example.com/abc-defg-hij"), false);
});

test("file names cannot carry paths or header control characters", () => {
  assert.equal(sanitizeMentorshipFileName("../folder/report.pdf"), ".._folder_report.pdf");
  assert.equal(sanitizeMentorshipFileName("notes\n.pdf"), "notes.pdf");
  assert.equal(sanitizeMentorshipFileName(""), "attachment");
});

test("multiple-choice questions require distinct, usable options", () => {
  assert.deepEqual(normalizeMentorshipQuestion("multiple_choice", ["  Field note  ", "Map"]), {
    type: "multiple_choice",
    options: ["Field note", "Map"],
  });
  assert.equal(normalizeMentorshipQuestion("multiple_choice", ["Same", " same "]), null);
  assert.equal(normalizeMentorshipQuestion("multiple_choice", ["Only one"]), null);
  assert.equal(normalizeMentorshipQuestion("multiple_choice", ["1", "2", "3", "4", "5", "6", "7"]), null);
});

test("open-response questions have no choices and responses remain formative text", () => {
  const question = normalizeMentorshipQuestion("open_response");
  assert.deepEqual(question, { type: "open_response", options: [] });
  assert.equal(normalizeMentorshipQuestion("open_response", ["Not allowed"]), null);
  assert.equal(isValidMentorshipQuestionResponse(question, "  I would compare the survey groups.  "), true);
  assert.equal(isValidMentorshipQuestionResponse(question, "   "), false);
  assert.equal(isValidMentorshipQuestionResponse(question, "x".repeat(3001)), false);
});

test("multiple-choice responses must match a displayed option", () => {
  const question = normalizeMentorshipQuestion("multiple_choice", ["Observe", "Ask"]);
  assert.ok(question);
  assert.equal(isValidMentorshipQuestionResponse(question, "Ask"), true);
  assert.equal(isValidMentorshipQuestionResponse(question, "Guess"), false);
});

test("generated API contracts accept question prompts and linked student replies", () => {
  const questionId = "11111111-1111-4111-8111-111111111111";
  const enrollmentId = "22222222-2222-4222-8222-222222222222";
  const guideId = "33333333-3333-4333-8333-333333333333";
  const studentId = "44444444-4444-4444-8444-444444444444";
  assert.equal(SendMentorshipMessageBody.safeParse({
    kind: "question",
    body: "How would you compare these findings?",
    question: { type: "multiple_choice", options: ["Compare both groups", "Ask a follow-up"] },
  }).success, true);
  assert.equal(AnswerMentorshipQuestionBody.safeParse({ response: "Compare both groups." }).success, true);

  const baseMessage = {
    id: questionId,
    enrollmentId,
    senderId: guideId,
    senderName: "Guide",
    senderRole: "guide",
    body: "How would you compare these findings?",
    meetingUrl: null,
    meetingStartsAt: null,
    meetingAgenda: "",
    attachments: [],
    reactions: [],
    readByCount: 0,
    editedAt: null,
    deletedAt: null,
    createdAt: new Date(),
  };
  assert.equal(SendMentorshipMessageResponse.safeParse({
    ...baseMessage,
    kind: "question",
    question: { type: "multiple_choice", options: ["Compare both groups", "Ask a follow-up"] },
    replyToMessageId: null,
  }).success, true);
  assert.equal(AnswerMentorshipQuestionResponse.safeParse({
    ...baseMessage,
    id: "55555555-5555-4555-8555-555555555555",
    senderId: studentId,
    senderName: "Learner",
    senderRole: "student",
    kind: "question_response",
    body: "Compare both groups.",
    question: null,
    replyToMessageId: questionId,
  }).success, true);
});
