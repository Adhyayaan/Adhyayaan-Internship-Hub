import test from "node:test";
import assert from "node:assert/strict";
import {
  canAccessMentorshipThread,
  canSendMentorshipMessage,
  isAllowedMentorshipAttachment,
  isGoogleMeetLink,
  sanitizeMentorshipFileName,
} from "./mentorship-rules.ts";

const enrollment = { userId: "student-a", guideId: "guide-a" };

test("only the enrolled student and currently assigned guide can read a thread", () => {
  assert.equal(canAccessMentorshipThread({ id: "student-a", role: "student" }, enrollment), true);
  assert.equal(canAccessMentorshipThread({ id: "guide-a", role: "guide" }, enrollment), true);
  assert.equal(canAccessMentorshipThread({ id: "student-b", role: "student" }, enrollment), false);
  assert.equal(canAccessMentorshipThread({ id: "guide-b", role: "guide" }, enrollment), false);
  assert.equal(canAccessMentorshipThread({ id: "admin-a", role: "admin" }, enrollment), false);
});

test("a conversation cannot send until its assigned guide exists", () => {
  assert.equal(canSendMentorshipMessage({ id: "student-a", role: "student" }, enrollment), true);
  assert.equal(canSendMentorshipMessage({ id: "guide-a", role: "guide" }, enrollment), true);
  assert.equal(canSendMentorshipMessage({ id: "student-a", role: "student" }, { guideId: null }), false);
  assert.equal(canSendMentorshipMessage({ id: "admin-a", role: "admin" }, enrollment), false);
});

test("attachments allow common images and documents within the size limit", () => {
  assert.equal(isAllowedMentorshipAttachment("image/png", 1024), true);
  assert.equal(isAllowedMentorshipAttachment("application/pdf", 2048), true);
  assert.equal(isAllowedMentorshipAttachment("image/svg+xml", 1024), false);
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
