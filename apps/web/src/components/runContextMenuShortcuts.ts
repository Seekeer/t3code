import { isMacPlatform } from "@t3tools/shared/keybindings";

/** Run context digit jumps stop at 9, the last digit a single keystroke can reach. */
export const MAX_RUN_CONTEXT_SHORTCUTS = 9;

const DIGIT_KEY_PATTERN = /^(?:Digit|Numpad)([1-9])$/;
const DIGIT_VALUE_PATTERN = /^[1-9]$/;

/** The command modifier's label on this platform, matching what `runContextShortcutIndex` accepts. */
export function runContextShortcutLabel(index: number, platform: string): string {
  return isMacPlatform(platform) ? `\u2318${index + 1}` : `Ctrl+${index + 1}`;
}

/**
 * Zero-based item index for the digit a keydown selects, or null when the event is not a
 * command-modifier digit press. `platform` decides which modifier counts as the command key.
 */
export function runContextShortcutIndex(
  event: Pick<KeyboardEvent, "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">,
  platform: string,
): number | null {
  if (event.altKey || event.shiftKey) return null;
  const commandModifier = isMacPlatform(platform) ? event.metaKey : event.ctrlKey;
  if (!commandModifier) return null;

  const digit = DIGIT_KEY_PATTERN.exec(event.code)?.[1] ?? event.key;
  if (!DIGIT_VALUE_PATTERN.test(digit)) return null;

  const index = Number(digit) - 1;
  return index < MAX_RUN_CONTEXT_SHORTCUTS ? index : null;
}
