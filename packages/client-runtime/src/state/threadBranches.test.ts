import {
  MessageId,
  ThreadId,
  type OrchestrationMessageCompletion,
  type ThreadBranchProvenance,
} from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";

import {
  canCreateConversationBranchFromMessage,
  conversationBranchNotice,
  conversationBranchNoticeText,
} from "./threadBranches.ts";

const branchedFrom: ThreadBranchProvenance = {
  sourceThreadId: ThreadId.make("source-thread"),
  sourceThreadTitle: "Source thread",
  sourceMessageId: MessageId.make("assistant-reply"),
  inheritedMessageCount: 2,
  inheritedContextState: "pending",
  createdAt: "2026-06-06T00:00:00.000Z",
};

describe("canCreateConversationBranchFromMessage", () => {
  it("offers branching only for a reply that finished successfully", () => {
    expect(
      canCreateConversationBranchFromMessage({
        role: "assistant",
        streaming: false,
        completion: "completed",
      }),
    ).toBe(true);
  });

  it("refuses a reply whose streaming stopped without a settled outcome", () => {
    // An interrupted or failed turn also leaves streaming false, so the flag
    // alone must not offer the action.
    expect(
      canCreateConversationBranchFromMessage({
        role: "assistant",
        streaming: false,
        completion: undefined,
      }),
    ).toBe(false);
    for (const completion of [
      "interrupted",
      "failed",
    ] as ReadonlyArray<OrchestrationMessageCompletion>) {
      expect(
        canCreateConversationBranchFromMessage({
          role: "assistant",
          streaming: false,
          completion,
        }),
      ).toBe(false);
    }
  });

  it("refuses a live reply and anything that is not an agent reply", () => {
    expect(
      canCreateConversationBranchFromMessage({
        role: "assistant",
        streaming: true,
        completion: "completed",
      }),
    ).toBe(false);
    expect(
      canCreateConversationBranchFromMessage({
        role: "user",
        streaming: false,
        completion: "completed",
      }),
    ).toBe(false);
    expect(
      canCreateConversationBranchFromMessage({
        role: "reasoning",
        streaming: false,
        completion: "completed",
      }),
    ).toBe(false);
  });
});

describe("conversationBranchNotice", () => {
  it("reports the inherited prefix and whether the source still resolves", () => {
    expect(conversationBranchNotice(branchedFrom, true)).toEqual({
      sourceThreadId: branchedFrom.sourceThreadId,
      sourceThreadTitle: "Source thread",
      sourceMessageId: branchedFrom.sourceMessageId,
      inheritedMessageCount: 2,
      sourceAvailable: true,
    });
    expect(conversationBranchNotice(branchedFrom, false)?.sourceAvailable).toBe(false);
  });

  it("shows nothing for a thread that is not a branch", () => {
    expect(conversationBranchNotice(null, true)).toBeNull();
    expect(conversationBranchNotice(undefined, true)).toBeNull();
  });

  it("states the text-only limit and counts the inherited messages", () => {
    const notice = conversationBranchNotice(branchedFrom, true)!;
    expect(conversationBranchNoticeText(notice)).toBe(
      "Branched from Source thread. The agent received these messages as text — attachments and tool activity were not carried over.",
    );
    expect(
      conversationBranchNoticeText({
        ...notice,
        inheritedMessageCount: 1,
      }),
    ).toContain("this message");
  });
});
