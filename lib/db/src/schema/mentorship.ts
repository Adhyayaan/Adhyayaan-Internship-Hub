import { boolean, integer, pgTable, text, timestamp, index, primaryKey, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { enrollments, learners } from "./learning";

export const mentorshipMessages = pgTable("learning_mentorship_messages", {
  id: text("id").primaryKey(),
  enrollmentId: text("enrollment_id").notNull().references(() => enrollments.id, { onDelete: "cascade" }),
  senderId: text("sender_id").notNull().references(() => learners.id, { onDelete: "cascade" }),
  senderRole: text("sender_role", { enum: ["student", "guide"] }).notNull(),
  kind: text("kind", { enum: ["text", "meeting"] }).notNull(),
  body: text("body").notNull().default(""),
  meetingUrl: text("meeting_url"),
  meetingStartsAt: timestamp("meeting_starts_at", { withTimezone: true }),
  meetingAgenda: text("meeting_agenda").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("learning_mentorship_messages_enrollment_created").on(table.enrollmentId, table.createdAt),
]);

export const mentorshipAttachments = pgTable("learning_mentorship_attachments", {
  id: text("id").primaryKey(),
  messageId: text("message_id").notNull().references(() => mentorshipMessages.id, { onDelete: "cascade" }),
  objectPath: text("object_path").notNull(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  uploadedBy: text("uploaded_by").notNull().references(() => learners.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("learning_mentorship_attachments_object_path").on(table.objectPath),
  index("learning_mentorship_attachments_message").on(table.messageId),
]);

export const mentorshipThreadReads = pgTable("learning_mentorship_thread_reads", {
  enrollmentId: text("enrollment_id").notNull().references(() => enrollments.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => learners.id, { onDelete: "cascade" }),
  lastReadAt: timestamp("last_read_at", { withTimezone: true }),
  lastReadMessageId: text("last_read_message_id"),
}, (table) => [
  primaryKey({ columns: [table.enrollmentId, table.userId] }),
]);

export const mentorshipNotificationPreferences = pgTable("learning_mentorship_notification_preferences", {
  userId: text("user_id").primaryKey().references(() => learners.id, { onDelete: "cascade" }),
  browserNotificationsEnabled: boolean("browser_notifications_enabled").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMentorshipMessageSchema = createInsertSchema(mentorshipMessages);
export const insertMentorshipAttachmentSchema = createInsertSchema(mentorshipAttachments);
export type MentorshipMessage = typeof mentorshipMessages.$inferSelect;
export type MentorshipAttachment = typeof mentorshipAttachments.$inferSelect;
export type MentorshipThreadRead = typeof mentorshipThreadReads.$inferSelect;
export type MentorshipNotificationPreference = typeof mentorshipNotificationPreferences.$inferSelect;
