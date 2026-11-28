import assert from "node:assert/strict";
import test from "node:test";
import { readPositionIncludesMessage, summarizeChatReactions } from "./chat-features.ts";

test("reaction summaries count each participant and mark the viewer's selection", () => {
  const summary = summarizeChatReactions([
    { messageId: "m1", userId: "u1", reaction: "heart" },
    { messageId: "m1", userId: "u2", reaction: "heart" },
    { messageId: "m1", userId: "u2", reaction: "like" },
    { messageId: "m1", userId: "u3", reaction: "unknown" },
  ], "u2");

  assert.deepEqual(summary.get("m1"), [
    { reaction: "like", count: 1, selected: true },
    { reaction: "heart", count: 2, selected: true },
  ]);
});

test("read cursors include earlier messages and tie-break equal timestamps by message id", () => {
  const readAt = new Date("2026-11-28T10:00:00.000Z");
  assert.equal(readPositionIncludesMessage(readAt, "b", new Date("2026-11-28T09:59:59.000Z"), "z"), true);
  assert.equal(readPositionIncludesMessage(readAt, "b", readAt, "a"), true);
  assert.equal(readPositionIncludesMessage(readAt, "b", readAt, "c"), false);
  assert.equal(readPositionIncludesMessage(null, null, readAt, "a"), false);
});
