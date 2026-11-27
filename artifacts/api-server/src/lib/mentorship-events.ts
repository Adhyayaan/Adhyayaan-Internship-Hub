import type { Response } from "express";

const subscribers = new Map<string, Set<Response>>();
const notificationSubscribers = new Map<string, Set<Response>>();

export function subscribeToMentorshipThread(enrollmentId: string, response: Response): () => void {
  const room = subscribers.get(enrollmentId) ?? new Set<Response>();
  room.add(response);
  subscribers.set(enrollmentId, room);
  return () => {
    room.delete(response);
    if (room.size === 0) subscribers.delete(enrollmentId);
  };
}

export function publishMentorshipMessage(enrollmentId: string, messageId: string): void {
  const room = subscribers.get(enrollmentId);
  if (!room) return;
  const event = `event: message\ndata: ${JSON.stringify({ messageId })}\n\n`;
  for (const response of room) {
    if (response.destroyed || response.writableEnded) {
      room.delete(response);
      continue;
    }
    response.write(event);
  }
  if (room.size === 0) subscribers.delete(enrollmentId);
}

export function subscribeToMentorshipNotifications(userId: string, response: Response): () => void {
  const room = notificationSubscribers.get(userId) ?? new Set<Response>();
  room.add(response);
  notificationSubscribers.set(userId, room);
  return () => {
    room.delete(response);
    if (room.size === 0) notificationSubscribers.delete(userId);
  };
}

export function publishMentorshipNotification(userId: string, enrollmentId: string, messageId: string): void {
  const room = notificationSubscribers.get(userId);
  if (!room) return;
  const event = `event: message\ndata: ${JSON.stringify({ enrollmentId, messageId })}\n\n`;
  for (const response of room) {
    if (response.destroyed || response.writableEnded) {
      room.delete(response);
      continue;
    }
    response.write(event);
  }
  if (room.size === 0) notificationSubscribers.delete(userId);
}
