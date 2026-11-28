import {
  publishSupportGroupRealtimeMessage,
  publishSupportGroupRealtimeRead,
  revokeSupportGroupRealtimeAccess,
} from "./chat-realtime";

export function publishSupportGroupMessage(groupId: string, messageId: string) {
  publishSupportGroupRealtimeMessage(groupId, messageId);
}

export function publishSupportGroupRead(groupId: string, userId: string) {
  publishSupportGroupRealtimeRead(groupId, userId);
}

export function revokeSupportGroupMembers(groupId: string, userIds: string[]) {
  revokeSupportGroupRealtimeAccess(groupId, userIds);
}
