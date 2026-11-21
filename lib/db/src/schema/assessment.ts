import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { learners } from "./learning";

export const assessmentAttempts = pgTable("learning_assessment_attempts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => learners.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  answers: jsonb("answers").$type<{ questionId: string; choice: number }[]>().notNull().default([]),
  report: jsonb("report"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("learning_assessment_open_draft").on(t.userId).where(sql`${t.completedAt} IS NULL`),
  index("learning_assessment_history").on(t.userId, t.completedAt),
]);

export const insertAssessmentAttemptSchema = createInsertSchema(assessmentAttempts);
export type AssessmentAttempt = typeof assessmentAttempts.$inferSelect;
