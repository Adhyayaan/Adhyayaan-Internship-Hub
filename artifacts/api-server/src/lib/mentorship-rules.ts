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
const ALLOWED_MENTORSHIP_AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
]);

export const MAX_MENTORSHIP_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_MENTORSHIP_VOICE_NOTE_BYTES = 5 * 1024 * 1024;
export type MentorshipQuestionType = "multiple_choice" | "open_response";

export type NormalizedMentorshipQuestion = {
  type: MentorshipQuestionType;
  options: string[];
};

export function normalizeMentorshipQuestion(
  type: MentorshipQuestionType,
  options: string[] = [],
): NormalizedMentorshipQuestion | null {
  const cleanOptions = options.map((option) => option.trim());
  if (type === "open_response") {
    return cleanOptions.length === 0 ? { type, options: [] } : null;
  }
  if (
    cleanOptions.length < 2
    || cleanOptions.length > 6
    || cleanOptions.some((option) => !option || option.length > 200)
    || new Set(cleanOptions.map((option) => option.toLocaleLowerCase())).size !== cleanOptions.length
  ) {
    return null;
  }
  return { type, options: cleanOptions };
}

export function isValidMentorshipQuestionResponse(
  question: NormalizedMentorshipQuestion,
  response: string,
): boolean {
  const cleanResponse = response.trim();
  if (!cleanResponse || cleanResponse.length > 3000) return false;
  return question.type === "open_response" || question.options.includes(cleanResponse);
}

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
  const normalizedType = contentType.trim().toLowerCase().split(";")[0];
  const validSize = Number.isInteger(size) && size > 0;
  if (ALLOWED_MENTORSHIP_AUDIO_TYPES.has(normalizedType)) {
    return validSize && size <= MAX_MENTORSHIP_VOICE_NOTE_BYTES;
  }
  return ALLOWED_MENTORSHIP_FILE_TYPES.has(normalizedType)
    && validSize
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
