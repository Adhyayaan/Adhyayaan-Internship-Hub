import {
  publishMentorshipRealtimeMessage,
  publishMentorshipRealtimeNotification,
  publishMentorshipRealtimeRead,
} from "./chat-realtime";

export function publishMentorshipMessage(enrollmentId: string, messageId: string): void {
  publishMentorshipRealtimeMessage(enrollmentId, messageId);
}

export function publishMentorshipRead(enrollmentId: string, userId: string): void {
  publishMentorshipRealtimeRead(enrollmentId, userId);
}

export function publishMentorshipNotification(userId: string, enrollmentId: string, messageId: string): void {
  publishMentorshipRealtimeNotification(userId, enrollmentId, messageId);
}
