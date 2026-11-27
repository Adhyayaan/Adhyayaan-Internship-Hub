import { pgTable, text, timestamp, integer, doublePrecision, jsonb, uniqueIndex, index, date, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const learners = pgTable("learners", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  college: text("college").notNull().default(""),
  discipline: text("discipline").notNull().default(""),
  assessmentRequired: boolean("assessment_required").notNull().default(false),
  assessmentCompletedAt: timestamp("assessment_completed_at", { withTimezone: true }),
  role: text("role", { enum: ["student", "admin", "guide"] }).notNull().default("student"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const learnerSessions = pgTable("learner_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => learners.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
export const enrollments = pgTable("learning_enrollments", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => learners.id, { onDelete: "cascade" }),
  courseId: text("course_id").notNull(),
  hours: integer("hours").notNull(),
  completedModules: jsonb("completed_modules").$type<string[]>().notNull().default([]),
  projectUrl: text("project_url").notNull().default(""),
  reflection: text("reflection").notNull().default(""),
  status: text("status").notNull().default("in_progress"),
  guideId: text("guide_id").references(() => learners.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("learning_enrollment_user_course").on(t.userId, t.courseId),
  index("learning_enrollment_guide").on(t.guideId),
]);
export const workLogs = pgTable("learning_work_logs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => learners.id, { onDelete: "cascade" }),
  enrollmentId: text("enrollment_id").notNull().references(() => enrollments.id, { onDelete: "cascade" }),
  date: date("date", { mode: "string" }).notNull(),
  hours: doublePrecision("hours").notNull(),
  activity: text("activity").notNull(),
  learning: text("learning").notNull(),
});
export const aiMessages = pgTable("learning_ai_messages", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => learners.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  tool: text("tool").notNull(),
  courseId: text("course_id").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertLearnerSchema = createInsertSchema(learners);
export const insertEnrollmentSchema = createInsertSchema(enrollments);
export const insertWorkLogSchema = createInsertSchema(workLogs);
export type Learner = typeof learners.$inferSelect;
export type LearningEnrollment = typeof enrollments.$inferSelect;
