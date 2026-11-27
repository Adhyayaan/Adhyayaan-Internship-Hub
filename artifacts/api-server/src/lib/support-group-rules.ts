export function supportGroupAccess(
  user: { id: string; role: string },
  group: { guideId: string },
  isMember: boolean,
) {
  const guide = user.role === "guide" && user.id === group.guideId;
  const allowed = guide || (user.role === "student" && isMember);
  return { allowed, guide };
}

export function canPostSupportGroupKind(role: string, kind: "text" | "meeting" | "question") {
  if (kind === "text") return role === "student" || role === "guide";
  return role === "guide";
}
