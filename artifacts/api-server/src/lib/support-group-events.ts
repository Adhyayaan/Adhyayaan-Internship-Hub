import type { Response } from "express";
import {
  publishSupportGroupRealtimeMessage,
  publishSupportGroupRealtimeRead,
  publishSupportGroupRealtimeTyping,
  revokeSupportGroupRealtimeAccess,
} from "./chat-realtime";

type Subscriber = { userId: string; response: Response };
const subscribers = new Map<string, Set<Subscriber>>();

export function subscribeToSupportGroup(groupId: string, userId: string, response: Response) {
  const group = subscribers.get(groupId) ?? new Set<Subscriber>();
  const subscriber = { userId, response };
  group.add(subscriber);
  subscribers.set(groupId, group);
  return () => {
    group.delete(subscriber);
    if (!group.size) subscribers.delete(groupId);
  };
}

export function publishSupportGroupMessage(groupId: string, messageId: string) {
  publishSupportGroupRealtimeMessage(groupId, messageId, "");
  const group = subscribers.get(groupId);
  if (!group) return;
  const event = `event: support-group-message\ndata: ${JSON.stringify({ messageId })}\n\n`;
  for (const subscriber of group) {
    const { response } = subscriber;
    if (response.destroyed || response.writableEnded) {
      group.delete(subscriber);
      continue;
    }
    response.write(event);
  }
  if (!group.size) subscribers.delete(groupId);
}

function publishGroupEvent(groupId: string, eventName: string, data: Record<string, unknown>, exceptUserId?: string) {
  const group = subscribers.get(groupId);
  if (!group) return;
  const event = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const subscriber of group) {
    if (subscriber.userId === exceptUserId) continue;
    const { response } = subscriber;
    if (response.destroyed || response.writableEnded) {
      group.delete(subscriber);
      continue;
    }
    response.write(event);
  }
  if (!group.size) subscribers.delete(groupId);
}

export function publishSupportGroupRead(groupId: string, userId: string) {
  publishSupportGroupRealtimeRead(groupId, userId);
  publishGroupEvent(groupId, "support-group-read", { userId }, userId);
}

export function publishSupportGroupTyping(groupId: string, userId: string, name: string, typing: boolean) {
  publishSupportGroupRealtimeTyping(groupId, userId, name, typing);
  publishGroupEvent(groupId, "support-group-typing", { userId, name, typing }, userId);
}

export function revokeSupportGroupMembers(groupId: string, userIds: string[]) {
  revokeSupportGroupRealtimeAccess(groupId, userIds);
  const group = subscribers.get(groupId);
  if (!group || !userIds.length) return;
  const removed = new Set(userIds);
  for (const subscriber of group) {
    if (!removed.has(subscriber.userId)) continue;
    const { response } = subscriber;
    if (!response.destroyed && !response.writableEnded) {
      response.write("event: support-group-access-revoked\ndata: {}\n\n");
      response.end();
    }
    group.delete(subscriber);
  }
  if (!group.size) subscribers.delete(groupId);
}
