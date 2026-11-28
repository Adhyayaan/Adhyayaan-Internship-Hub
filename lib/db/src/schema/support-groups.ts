import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  index,
  primaryKey,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { enrollments, learners } from "./learning";

export const supportGroups = pgTable("learning_support_groups", {
  id: text("id").primaryKey(),
  courseId: text("course_id").notNull(),
  guideId: text("guide_id").notNull().references(() => learners.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  purpose: text("purpose").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("learning_support_groups_guide_course").on(table.guideId, table.courseId),
]);

export const supportGroupMembers = pgTable("learning_support_group_members", {
  groupId: text("group_id").notNull().references(() => supportGroups.id, { onDelete: "cascade" }),
  enrollmentId: text("enrollment_id").notNull().references(() => enrollments.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => learners.id, { onDelete: "cascade" }),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.groupId, table.userId] }),
  uniqueIndex("learning_support_group_members_enrollment").on(table.groupId, table.enrollmentId),
  index("learning_support_group_members_user").on(table.userId, table.groupId),
]);

export const supportGroupMessages = pgTable("learning_support_group_messages", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull().references(() => supportGroups.id, { onDelete: "cascade" }),
  senderId: text("sender_id").notNull().references(() => learners.id, { onDelete: "cascade" }),
  senderRole: text("sender_role", { enum: ["student", "guide"] }).notNull(),
  kind: text("kind", { enum: ["text", "meeting", "question", "question_response"] }).notNull(),
  body: text("body").notNull().default(""),
  meetingUrl: text("meeting_url"),
  meetingStartsAt: timestamp("meeting_starts_at", { withTimezone: true }),
  meetingAgenda: text("meeting_agenda").notNull().default(""),
  replyToMessageId: text("reply_to_message_id").references((): AnyPgColumn => supportGroupMessages.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  editedAt: timestamp("edited_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [
  index("learning_support_group_messages_group_created").on(table.groupId, table.createdAt),
]);

export const supportGroupMessageReactions = pgTable("learning_support_group_message_reactions", {
  messageId: text("message_id").notNull().references(() => supportGroupMessages.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => learners.id, { onDelete: "cascade" }),
  reaction: text("reaction").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.messageId, table.userId, table.reaction] }),
  index("learning_support_group_message_reactions_message").on(table.messageId),
]);

export const supportGroupReads = pgTable("learning_support_group_reads", {
  groupId: text("group_id").notNull().references(() => supportGroups.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => learners.id, { onDelete: "cascade" }),
  lastReadAt: timestamp("last_read_at", { withTimezone: true }),
  lastReadMessageId: text("last_read_message_id"),
}, (table) => [
  primaryKey({ columns: [table.groupId, table.userId] }),
]);

export const supportGroupQuestions = pgTable("learning_support_group_questions", {
  messageId: text("message_id").primaryKey().references(() => supportGroupMessages.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["multiple_choice", "open_response"] }).notNull(),
  options: jsonb("options").$type<string[]>().notNull().default([]),
});

export const supportGroupAttachments = pgTable("learning_support_group_attachments", {
  id: text("id").primaryKey(),
  messageId: text("message_id").notNull().references(() => supportGroupMessages.id, { onDelete: "cascade" }),
  objectPath: text("object_path").notNull(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  uploadedBy: text("uploaded_by").notNull().references(() => learners.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("learning_support_group_attachments_object_path").on(table.objectPath),
  index("learning_support_group_attachments_message").on(table.messageId),
]);

export const insertSupportGroupSchema = createInsertSchema(supportGroups);
export const insertSupportGroupMemberSchema = createInsertSchema(supportGroupMembers);
export const insertSupportGroupMessageSchema = createInsertSchema(supportGroupMessages);
export const insertSupportGroupQuestionSchema = createInsertSchema(supportGroupQuestions);
export const insertSupportGroupAttachmentSchema = createInsertSchema(supportGroupAttachments);

export type SupportGroupRow = typeof supportGroups.$inferSelect;
export type SupportGroupMemberRow = typeof supportGroupMembers.$inferSelect;
export type SupportGroupMessageRow = typeof supportGroupMessages.$inferSelect;
export type SupportGroupQuestionRow = typeof supportGroupQuestions.$inferSelect;
export type SupportGroupAttachmentRow = typeof supportGroupAttachments.$inferSelect;
