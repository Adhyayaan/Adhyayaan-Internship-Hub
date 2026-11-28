export const CHAT_REACTIONS = ["like", "heart", "laugh", "surprise", "celebrate"] as const;
export type ChatReactionValue = typeof CHAT_REACTIONS[number];
export type ChatReactionView = { reaction: ChatReactionValue; count: number; selected: boolean };

type ReactionRow = { messageId: string; userId: string; reaction: string };

export function summarizeChatReactions(rows: ReactionRow[], viewerId: string): Map<string, ChatReactionView[]> {
  const grouped = new Map<string, Map<ChatReactionValue, { count: number; selected: boolean }>>();
  for (const row of rows) {
    if (!CHAT_REACTIONS.includes(row.reaction as ChatReactionValue)) continue;
    const reaction = row.reaction as ChatReactionValue;
    const message = grouped.get(row.messageId) ?? new Map();
    const summary = message.get(reaction) ?? { count: 0, selected: false };
    summary.count += 1;
    summary.selected ||= row.userId === viewerId;
    message.set(reaction, summary);
    grouped.set(row.messageId, message);
  }
  return new Map([...grouped].map(([messageId, message]) => [
    messageId,
    CHAT_REACTIONS.flatMap((reaction) => {
      const summary = message.get(reaction);
      return summary ? [{ reaction, ...summary }] : [];
    }),
  ]));
}

export function readPositionIncludesMessage(
  lastReadAt: Date | null,
  lastReadMessageId: string | null,
  createdAt: Date,
  messageId: string,
): boolean {
  if (!lastReadAt || !lastReadMessageId) return false;
  const delta = lastReadAt.getTime() - createdAt.getTime();
  return delta > 0 || (delta === 0 && lastReadMessageId.localeCompare(messageId) >= 0);
}
