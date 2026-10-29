import { isMacPlatform } from "@t3tools/shared/keybindings";
import type { RefObject } from "react";
import { useEffect } from "react";

import { MenuShortcut } from "./ui/menu";

/** Run context digit jumps stop at 9, the last digit a single keystroke can reach. */
const MAX_RUN_CONTEXT_SHORTCUTS = 9;

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

/** The digit a row shows, numbered across both groups so Ctrl+1 always hits the first visible row. */
export function RunContextShortcut({ index }: { index: number }) {
  if (index >= MAX_RUN_CONTEXT_SHORTCUTS) return null;
  const label = runContextShortcutLabel(index, navigator.platform);
  return (
    <MenuShortcut aria-hidden="true" className="shrink-0">
      {label}
    </MenuShortcut>
  );
}

const RUN_CONTEXT_OPEN_ITEM_SELECTOR = [
  '[data-slot="menu-radio-item"]:not([data-disabled])',
  '[data-slot="menu-item"]:not([data-disabled])',
  '[data-slot="select-item"]:not([data-disabled])',
].join(", ");

/**
 * Cmd/Ctrl digits pick a row while the menu is open. Base UI routes popup keys to list
 * navigation and typeahead without cancelling them, so the window-level resolver would otherwise
 * claim the same chord for a thread jump before the menu sees it.
 */
export function useRunContextDigitShortcuts({
  open,
  popupRef,
}: {
  open: boolean;
  popupRef: RefObject<HTMLDivElement | null>;
}) {
  const platform = navigator.platform;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- keeps a window keydown listener in step with the menu's open state while it is mounted
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const index = runContextShortcutIndex(event, platform);
      const item =
        index === null
          ? null
          : popupRef.current?.querySelectorAll(RUN_CONTEXT_OPEN_ITEM_SELECTOR)[index];
      if (!item) return;
      event.preventDefault();
      event.stopPropagation();
      item.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, view: window }),
      );
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, platform, popupRef]);
}
