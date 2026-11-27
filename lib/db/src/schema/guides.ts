import { pgTable, text, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { learners } from "./learning";

export const internshipGuides = pgTable("learning_internship_guides", {
  userId: text("user_id").primaryKey().references(() => learners.id, { onDelete: "cascade" }),
  supportedCourseIds: jsonb("supported_course_ids").$type<string[]>().notNull().default([]),
  availableForAssignments: boolean("available_for_assignments").notNull().default(true),
  lastAssignedAt: timestamp("last_assigned_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertInternshipGuideSchema = createInsertSchema(internshipGuides);
export type InternshipGuide = typeof internshipGuides.$inferSelect;
