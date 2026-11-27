import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { learners } from "./learning";
import { assessmentAttempts } from "./assessment";

export const adminReportAccess = pgTable("learning_admin_report_access", {
  id: text("id").primaryKey(),
  adminId: text("admin_id").references(() => learners.id, { onDelete: "set null" }),
  learnerId: text("learner_id").references(() => learners.id, { onDelete: "set null" }),
  reportId: text("report_id").references(() => assessmentAttempts.id, { onDelete: "set null" }),
  viewedAt: timestamp("viewed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const guideReportAccess = pgTable("learning_guide_report_access", {
  id: text("id").primaryKey(),
  guideId: text("guide_id").references(() => learners.id, { onDelete: "set null" }),
  learnerId: text("learner_id").references(() => learners.id, { onDelete: "set null" }),
  reportId: text("report_id").references(() => assessmentAttempts.id, { onDelete: "set null" }),
  viewedAt: timestamp("viewed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAdminReportAccessSchema = createInsertSchema(adminReportAccess);
export type AdminReportAccess = typeof adminReportAccess.$inferSelect;
export const insertGuideReportAccessSchema = createInsertSchema(guideReportAccess);
export type GuideReportAccess = typeof guideReportAccess.$inferSelect;
