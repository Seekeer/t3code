import type { OrchestrationMessage, ThreadBranchProvenance } from "@t3tools/contracts";

/**
 * Whether a message can be branched from.
 *
 * A branch copies conversation text, so the reply has to have actually
 * finished: `streaming: false` also describes the partial text a failed or
 * interrupted turn leaves behind. The server decides this again when the command
 * arrives; this only decides what the client offers.
 */
export function canCreateConversationBranchFromMessage(
  message: Pick<OrchestrationMessage, "role" | "streaming" | "completion">,
): boolean {
  return message.role === "assistant" && !message.streaming && message.completion === "completed";
}

export interface ConversationBranchNotice {
  readonly sourceThreadId: ThreadBranchProvenance["sourceThreadId"];
  readonly sourceThreadTitle: ThreadBranchProvenance["sourceThreadTitle"];
  readonly sourceMessageId: ThreadBranchProvenance["sourceMessageId"];
  readonly inheritedMessageCount: ThreadBranchProvenance["inheritedMessageCount"];
  /**
   * False once the source is gone. The branch keeps the conversation either
   * way; only the link back stops resolving.
   */
  readonly sourceAvailable: boolean;
}

/**
 * The notice a branch carries above its conversation. It stays for the life of
 * the branch because the inherited prefix is only ever text: attachments and
 * tool activity were not handed to the agent.
 */
export function conversationBranchNotice(
  branchedFrom: ThreadBranchProvenance | null | undefined,
  sourceThreadExists: boolean,
): ConversationBranchNotice | null {
  if (branchedFrom === null || branchedFrom === undefined) {
    return null;
  }
  return {
    sourceThreadId: branchedFrom.sourceThreadId,
    sourceThreadTitle: branchedFrom.sourceThreadTitle,
    sourceMessageId: branchedFrom.sourceMessageId,
    inheritedMessageCount: branchedFrom.inheritedMessageCount,
    sourceAvailable: sourceThreadExists,
  };
}

/** The notice text both clients show. */
export function conversationBranchNoticeText(notice: ConversationBranchNotice): string {
  const inherited = notice.inheritedMessageCount === 1 ? "this message" : "these messages";
  return `Branched from ${notice.sourceThreadTitle}. The agent received ${inherited} as text — attachments and tool activity were not carried over.`;
}
