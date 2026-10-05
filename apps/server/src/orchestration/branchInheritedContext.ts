import { PROVIDER_SEND_TURN_MAX_INPUT_CHARS } from "@t3tools/contracts";

const BRANCH_FIRST_PROMPT_RESERVE_CHARS = 8_000;

/**
 * Room held back from the provider's input budget for the branch's own first
 * prompt. The inherited conversation and that prompt travel as one message, so
 * a prefix that fills the whole budget would leave nothing to answer with -
 * accepted at creation, then refused at send. Refusing up front is the point.
 */
export const BRANCH_INHERITED_CONTEXT_MAX_CHARS =
  PROVIDER_SEND_TURN_MAX_INPUT_CHARS - BRANCH_FIRST_PROMPT_RESERVE_CHARS;

const INHERITED_CONTEXT_PREAMBLE =
  "The conversation below was inherited from an earlier thread. Treat it as " +
  "context for the message that follows; it is not a request on its own.";

/**
 * A branch's inherited conversation, as the provider will receive it. Only
 * roles and text are serialized: attachments and tool activity are deliberately
 * absent, which is what the limited-context notice tells the user.
 *
 * The prefix is a prefix of the branch's own messages rather than a stored
 * copy, so what the provider reads cannot drift from what the user sees.
 */
export function inheritedPrefixOf(
  messages: ReadonlyArray<{ role: string; text: string }>,
  count: number,
): string | undefined {
  const inherited = messages
    .slice(0, count)
    .filter(
      (message): message is { role: "user" | "assistant"; text: string } =>
        message.role === "user" || message.role === "assistant",
    );
  if (inherited.length === 0) {
    return undefined;
  }
  const sections = inherited.map((message) => `${roleLabel(message.role)}:\n${message.text}`);
  return `${INHERITED_CONTEXT_PREAMBLE}\n\n${sections.join("\n\n")}`;
}

function roleLabel(role: "user" | "assistant"): string {
  return role === "user" ? "User" : "Assistant";
}

export function exceedsBranchInheritedContextBudget(context: string): boolean {
  return context.length > BRANCH_INHERITED_CONTEXT_MAX_CHARS;
}

/**
 * Prefixes a first prompt with the inherited context. Only the prompt that
 * first reaches the provider carries it; the branch records acceptance
 * separately so a restart or a failed first turn re-supplies it and later turns
 * never repeat it.
 */
export function withBranchInheritedContext(context: string, prompt: string): string {
  return prompt.length === 0 ? context : `${context}\n\n${prompt}`;
}
