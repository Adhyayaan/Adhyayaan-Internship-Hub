export function getMentorshipCounterpartId(
  senderId: string,
  studentId: string,
  guideId: string | null,
): string | null {
  if (senderId === studentId) return guideId;
  if (senderId === guideId) return studentId;
  return null;
}

export function isAfterMentorshipReadCursor(
  createdAt: Date,
  messageId: string,
  lastReadAt: Date | null,
  lastReadMessageId: string | null,
): boolean {
  if (!lastReadAt) return true;
  const timeDifference = createdAt.getTime() - lastReadAt.getTime();
  return timeDifference > 0 || (timeDifference === 0 && messageId > (lastReadMessageId ?? ""));
}
