import { pgTable, text, boolean, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { learners } from "./learning";

export const studyProgress = pgTable("learning_study_progress", {
  userId: text("user_id").notNull().references(() => learners.id, { onDelete: "cascade" }),
  courseId: text("course_id").notNull(),
  lessonId: text("lesson_id").notNull(),
  read: boolean("read").notNull().default(false),
  bookmarked: boolean("bookmarked").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.courseId, t.lessonId] })]);
export const insertStudyProgressSchema = createInsertSchema(studyProgress);
export type StudyProgressRow = typeof studyProgress.$inferSelect;

export const studyTeaching = pgTable("learning_study_teaching", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => learners.id, { onDelete: "cascade" }),
  courseId: text("course_id").notNull(),
  moduleId: text("module_id").notNull(),
  level: text("level").notNull(),
  answer: text("answer").notNull(),
  feedback: text("feedback").notNull(),
  verdict: text("verdict").notNull(),
  nextLevel: text("next_level").notNull(),
  nextPrompt: text("next_prompt").notNull(),
  revisit: text("revisit").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertStudyTeachingSchema = createInsertSchema(studyTeaching);
export type StudyTeachingRow = typeof studyTeaching.$inferSelect;
