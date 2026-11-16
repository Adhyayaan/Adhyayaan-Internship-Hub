import { pgTable, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { learners } from "./learning";

export type PracticeQuestion = {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  concept: string;
  cognitiveLevel: "understand" | "apply" | "analyze";
};
export const practiceAttempts = pgTable("learning_practice_attempts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => learners.id, { onDelete: "cascade" }),
  courseId: text("course_id").notNull(),
  difficulty: integer("difficulty").notNull(),
  language: text("language").notNull(),
  adaptationReason: text("adaptation_reason").notNull(),
  questions: jsonb("questions").$type<PracticeQuestion[]>().notNull(),
  answers: jsonb("answers").$type<{ questionId: string; selectedIndex: number }[]>(),
  score: integer("score"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
});
