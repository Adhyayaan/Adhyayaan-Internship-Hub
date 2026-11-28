import { createInsertSchema } from "drizzle-zod";
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { enrollments, learners } from "./learning";

export type ProjectCriterionEvaluation = {
  criterion: string;
  score: number;
  maxScore: number;
  feedback: string;
  evidence: string;
};

export type ProjectAiEvaluation = {
  overallScore: number | null;
  summary: string;
  criteria: ProjectCriterionEvaluation[];
  strengths: string[];
  improvements: string[];
  guideQuestions: string[];
  limitations: string[];
};

export const guideProjectAssignments = pgTable("learning_guide_project_assignments", {
  id: text("id").primaryKey(),
  guideId: text("guide_id").notNull().references(() => learners.id, { onDelete: "cascade" }),
  courseId: text("course_id").notNull(),
  title: text("title").notNull(),
  instructions: text("instructions").notNull(),
  rubric: text("rubric").notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("learning_guide_project_assignments_guide_created").on(table.guideId, table.createdAt),
  index("learning_guide_project_assignments_course").on(table.courseId),
]);

export const guideProjectTargets = pgTable("learning_guide_project_targets", {
  id: text("id").primaryKey(),
  assignmentId: text("assignment_id").notNull().references(() => guideProjectAssignments.id, { onDelete: "cascade" }),
  enrollmentId: text("enrollment_id").notNull().references(() => enrollments.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => learners.id, { onDelete: "cascade" }),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("learning_guide_project_targets_assignment_enrollment").on(table.assignmentId, table.enrollmentId),
  index("learning_guide_project_targets_student").on(table.userId, table.assignedAt),
  index("learning_guide_project_targets_assignment").on(table.assignmentId),
]);

export const guideProjectSubmissions = pgTable("learning_guide_project_submissions", {
  id: text("id").primaryKey(),
  targetId: text("target_id").notNull().references(() => guideProjectTargets.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  reflection: text("reflection").notNull().default(""),
  projectUrl: text("project_url").notNull().default(""),
  evaluationStatus: text("evaluation_status", { enum: ["pending", "ready", "failed"] }).notNull().default("pending"),
  evaluation: jsonb("evaluation").$type<ProjectAiEvaluation>(),
  evaluationStartedAt: timestamp("evaluation_started_at", { withTimezone: true }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  evaluatedAt: timestamp("evaluated_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("learning_guide_project_submissions_target_version").on(table.targetId, table.version),
  index("learning_guide_project_submissions_target_submitted").on(table.targetId, table.submittedAt),
]);

export const guideProjectSubmissionFiles = pgTable("learning_guide_project_submission_files", {
  id: text("id").primaryKey(),
  submissionId: text("submission_id").notNull().references(() => guideProjectSubmissions.id, { onDelete: "cascade" }),
  objectPath: text("object_path").notNull(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  uploadedBy: text("uploaded_by").notNull().references(() => learners.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("learning_guide_project_submission_files_object_path").on(table.objectPath),
  index("learning_guide_project_submission_files_submission").on(table.submissionId),
]);

export const insertGuideProjectAssignmentSchema = createInsertSchema(guideProjectAssignments);
export const insertGuideProjectTargetSchema = createInsertSchema(guideProjectTargets);
export const insertGuideProjectSubmissionSchema = createInsertSchema(guideProjectSubmissions);
export const insertGuideProjectSubmissionFileSchema = createInsertSchema(guideProjectSubmissionFiles);

export type GuideProjectAssignment = typeof guideProjectAssignments.$inferSelect;
export type GuideProjectTarget = typeof guideProjectTargets.$inferSelect;
export type GuideProjectSubmission = typeof guideProjectSubmissions.$inferSelect;
export type GuideProjectSubmissionFile = typeof guideProjectSubmissionFiles.$inferSelect;
