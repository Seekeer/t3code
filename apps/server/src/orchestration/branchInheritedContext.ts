import { PROVIDER_SEND_TURN_MAX_INPUT_CHARS } from "@t3tools/contracts";

/**
 * A branch inherits conversation text, not provider state. Where a provider
 * cannot fork its conversation through the selected reply, the copied prefix
 * rides along with the branch's first new prompt instead. That fallback is
 * measured against the same input budget every turn is already held to, so a
 * branch that would not fit is refused at creation rather than failing its
 * first prompt later. There is no truncation: history that does not fit is
 * refused.
 */
export const BRANCH_INHERITED_CONTEXT_MAX_CHARS = PROVIDER_SEND_TURN_MAX_INPUT_CHARS;

const INHERITED_CONTEXT_PREAMBLE =
  "The conversation below was inherited from an earlier thread. Treat it as " +
  "context for the message that follows; it is not a request on its own.";

export interface BranchInheritedContextMessage {
  readonly role: "user" | "assistant";
  readonly text: string;
}

function roleLabel(role: BranchInheritedContextMessage["role"]): string {
  return role === "user" ? "User" : "Assistant";
}

/**
 * Renders the copied prefix as role-labelled text. Only roles and text are
 * serialized: attachments and tool activity are deliberately absent from the
 * fallback, which is what the limited-context notice tells the user.
 */
export function renderBranchInheritedContext(
  messages: ReadonlyArray<BranchInheritedContextMessage>,
): string {
  const sections = messages.map((message) => `${roleLabel(message.role)}:\n${message.text}`);
  return `${INHERITED_CONTEXT_PREAMBLE}\n\n${sections.join("\n\n")}`;
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
