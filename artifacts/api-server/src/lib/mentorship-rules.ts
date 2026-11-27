const ALLOWED_MENTORSHIP_FILE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export const MAX_MENTORSHIP_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export function canAccessMentorshipThread(
  user: { id: string; role: string },
  enrollment: { userId: string; guideId: string | null },
): boolean {
  if (user.role === "student") return enrollment.userId === user.id;
  if (user.role === "guide") return enrollment.guideId === user.id;
  return false;
}

export function canSendMentorshipMessage(
  user: { id: string; role: string },
  enrollment: { guideId: string | null },
): boolean {
  return (user.role === "student" || user.role === "guide") && enrollment.guideId !== null;
}

export function isAllowedMentorshipAttachment(contentType: string, size: number): boolean {
  return ALLOWED_MENTORSHIP_FILE_TYPES.has(contentType.trim().toLowerCase())
    && Number.isInteger(size)
    && size > 0
    && size <= MAX_MENTORSHIP_ATTACHMENT_BYTES;
}

export function isGoogleMeetLink(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.hostname === "meet.google.com"
      && !url.port
      && !url.username
      && !url.password
      && /^\/[a-z0-9-]+\/?$/i.test(url.pathname);
  } catch {
    return false;
  }
}

export function sanitizeMentorshipFileName(value: string): string {
  return value
    .replace(/[\\/]/g, "_")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 160) || "attachment";
}
