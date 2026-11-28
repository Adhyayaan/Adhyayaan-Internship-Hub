import test from "node:test";
import assert from "node:assert/strict";
import {
  getProjectFileExtension,
  isAllowedProjectFile,
  isSafeArchiveEntryName,
  isTextProjectEntry,
  sanitizeProjectFileName,
} from "./project-rules.ts";
import {
  CreateGuideProjectAssignmentBody,
  RequestStudentProjectUploadBody,
  SubmitStudentProjectBody,
} from "../../../../lib/api-zod/src/generated/api.ts";

test("supported evidence types and bounded sizes are accepted", () => {
  assert.equal(isAllowedProjectFile("survey.csv", "text/csv", 1024), true);
  assert.equal(isAllowedProjectFile("notes.pdf", "application/pdf", 1024), true);
  assert.equal(isAllowedProjectFile("fieldwork.zip", "application/zip", 2048), true);
  assert.equal(isAllowedProjectFile("chart.png", "image/png", 1024), true);
  assert.equal(isAllowedProjectFile("report.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", 1024), true);
  assert.equal(isAllowedProjectFile("analysis.py", "text/x-python", 1024), true);
});

test("unsupported, mismatched and oversized uploads are rejected", () => {
  assert.equal(isAllowedProjectFile("virus.exe", "application/octet-stream", 1024), false);
  assert.equal(isAllowedProjectFile("image.svg", "image/svg+xml", 1024), false);
  assert.equal(isAllowedProjectFile("report.pdf", "text/plain", 1024), false);
  assert.equal(isAllowedProjectFile("report.pdf", "application/pdf", 25 * 1024 * 1024 + 1), false);
  assert.equal(isAllowedProjectFile("empty.txt", "text/plain", 0), false);
  assert.equal(isAllowedProjectFile("report.txt", "text/plain", 1.5), false);
});

test("archive paths cannot escape through absolute or parent-directory names", () => {
  assert.equal(isSafeArchiveEntryName("notes/readme.txt"), true);
  assert.equal(isSafeArchiveEntryName("C:/temp/report.txt"), false);
  assert.equal(isSafeArchiveEntryName("/etc/passwd"), false);
  assert.equal(isSafeArchiveEntryName("../outside.txt"), false);
  assert.equal(isSafeArchiveEntryName("folder/../../outside.txt"), false);
  assert.equal(isSafeArchiveEntryName(""), false);
});

test("file metadata helpers retain safe names and recognize supported archive contents", () => {
  assert.equal(getProjectFileExtension("plan.DOCX"), ".docx");
  assert.equal(sanitizeProjectFileName("../folder/notes\n.pdf"), ".._folder_notes.pdf");
  assert.equal(isTextProjectEntry("proposal.docx"), true);
  assert.equal(isTextProjectEntry("slides.pptx"), true);
  assert.equal(isTextProjectEntry("photo.png"), false);
});

test("generated contracts bound recipients, uploads and submission tokens", () => {
  const enrollmentId = "11111111-1111-4111-8111-111111111111";
  assert.equal(CreateGuideProjectAssignmentBody.safeParse({
    courseId: "01",
    title: "Community field notes",
    instructions: "Collect and summarize a small set of observations.",
    rubric: "Clarity, method, and evidence.",
    enrollmentIds: [enrollmentId],
  }).success, true);
  assert.equal(RequestStudentProjectUploadBody.safeParse({
    fileName: "evidence.zip", contentType: "application/zip", size: 500,
  }).success, true);
  assert.equal(SubmitStudentProjectBody.safeParse({
    uploadTokens: ["signed-upload-token"],
    reflection: "I compared two sources and checked for missing responses.",
  }).success, true);
  assert.equal(SubmitStudentProjectBody.safeParse({ uploadTokens: [] }).success, false);
});
