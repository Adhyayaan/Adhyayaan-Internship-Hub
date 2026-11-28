import type { Response } from "express";

type ThreadSubscriber = { userId: string; response: Response };
const subscribers = new Map<string, Set<ThreadSubscriber>>();
const notificationSubscribers = new Map<string, Set<Response>>();

export function subscribeToMentorshipThread(enrollmentId: string, userId: string, response: Response): () => void {
  const room = subscribers.get(enrollmentId) ?? new Set<ThreadSubscriber>();
  const subscriber = { userId, response };
  room.add(subscriber);
  subscribers.set(enrollmentId, room);
  return () => {
    room.delete(subscriber);
    if (room.size === 0) subscribers.delete(enrollmentId);
  };
}

function publishThreadEvent(enrollmentId: string, eventName: string, data: Record<string, unknown>, exceptUserId?: string): void {
  const room = subscribers.get(enrollmentId);
  if (!room) return;
  const event = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const subscriber of room) {
    const { response } = subscriber;
    if (subscriber.userId === exceptUserId) continue;
    if (response.destroyed || response.writableEnded) {
      room.delete(subscriber);
      continue;
    }
    response.write(event);
  }
  if (room.size === 0) subscribers.delete(enrollmentId);
}

export function publishMentorshipMessage(enrollmentId: string, messageId: string): void {
  publishThreadEvent(enrollmentId, "message", { messageId });
}

export function publishMentorshipRead(enrollmentId: string, userId: string): void {
  publishThreadEvent(enrollmentId, "read", { userId }, userId);
}

export function publishMentorshipTyping(enrollmentId: string, userId: string, name: string, typing: boolean): void {
  publishThreadEvent(enrollmentId, "typing", { userId, name, typing }, userId);
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
