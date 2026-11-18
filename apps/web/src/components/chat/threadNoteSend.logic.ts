import { normalizeThreadNote } from "@t3tools/contracts";

/**
 * The composer text after sending a thread note: the draft stays, and the note follows it,
 * unless the note is already the whole prompt.
 */
export function composePromptWithNote(draftPrompt: string, note: string): string {
  const noteText = normalizeThreadNote(note)?.trim();
  if (noteText === undefined || noteText.length === 0) return draftPrompt;
  const draft = draftPrompt.trim();
  if (draft.length === 0) return noteText;
  // Re-sending an unchanged note must not pile copies of itself into the draft.
  if (draft === noteText) return draftPrompt;
  return `${draft}\n\n${noteText}`;
}
