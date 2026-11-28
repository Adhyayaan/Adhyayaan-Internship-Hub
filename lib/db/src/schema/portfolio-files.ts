import { createInsertSchema } from "drizzle-zod";
import { index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { enrollments, learners } from "./learning";

export const enrollmentPortfolioFiles = pgTable("learning_enrollment_portfolio_files", {
  id: text("id").primaryKey(),
  enrollmentId: text("enrollment_id").notNull().references(() => enrollments.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => learners.id, { onDelete: "cascade" }),
  objectPath: text("object_path").notNull(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("learning_enrollment_portfolio_files_object_path").on(table.objectPath),
  index("learning_enrollment_portfolio_files_enrollment").on(table.enrollmentId, table.createdAt),
  index("learning_enrollment_portfolio_files_user").on(table.userId),
]);

export const insertEnrollmentPortfolioFileSchema = createInsertSchema(enrollmentPortfolioFiles);
export type EnrollmentPortfolioFile = typeof enrollmentPortfolioFiles.$inferSelect;
