import {
  AuthOrchestrationOperateScope,
  normalizeThreadNote,
  THREAD_NOTE_MAX_LENGTH,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import { PencilIcon, SendHorizonalIcon, StickyNoteIcon } from "lucide-react";
import { useGT } from "gt-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { useStableCallback } from "../../hooks/useStableCallback";
import { cn } from "../../lib/utils";
import { useEnvironmentScope } from "../../state/session";
import { Textarea } from "../ui/textarea";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { ThreadDetailsControl } from "./ThreadDetailsControl";
import { ThreadDetailsSection } from "./ThreadDetailsSection";
import {
  THREAD_DETAILS_PANEL_ICON_CLASS,
  THREAD_DETAILS_PANEL_LOCKED_ROW_CLASS,
} from "./threadDetailsPanelStyles";
import { useThreadNoteSave } from "./useThreadNoteSave";

// Module-level so React calls it once on mount, not on every render.
function focusAtEnd(textarea: HTMLTextAreaElement | null) {
  if (!textarea) return;
  textarea.focus({ preventScroll: true });
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
}

const NOTE_TEXT_CLASS = "line-clamp-3 min-w-0 flex-1 font-normal break-words whitespace-pre-wrap";

/** Key it by thread: the panel outlives thread switches, and a draft must not. */
export function ThreadDetailsNote({
  threadRef,
  focusRequest = 0,
  onFocusRequestHandled,
  onSendNote,
  sendDisabledReason = null,
  onEditEnd,
}: {
  readonly threadRef: ScopedThreadRef;
  readonly focusRequest?: number;
  readonly onFocusRequestHandled?: () => void;
  /** Sends the note as the composer's prompt; absent when the thread cannot send. */
  readonly onSendNote?: ((note: string) => Promise<boolean>) | undefined;
  readonly sendDisabledReason?: string | null;
  readonly onEditEnd?: (() => void) | undefined;
}) {
  const gt = useGT();
  const canEdit = useEnvironmentScope(threadRef.environmentId, AuthOrchestrationOperateScope);
  // Null while reading; a string is the text being edited.
  const [draft, setDraft] = useState<string | null>(null);
  const { note, save, beginEdit } = useThreadNoteSave(threadRef, canEdit, setDraft);
  const unsavedRef = useRef<{ text: string; save: (text: string) => void } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const attachTextarea = useStableCallback((element: HTMLTextAreaElement | null) => {
    textareaRef.current = element;
    focusAtEnd(element);
  });
  const focusNote = useEffectEvent(() => {
    if (!canEdit) return;
    if (textareaRef.current) focusAtEnd(textareaRef.current);
    else {
      beginEdit();
      setDraft(note);
    }
    onFocusRequestHandled?.();
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- fulfills keyboard focus requests from the chat, including when the details panel mounts
  useEffect(() => {
    if (focusRequest > 0) focusNote();
  }, [focusRequest]);
  const endEdit = useEffectEvent(() => onEditEnd?.());
  const hasNote = normalizeThreadNote(note) !== null;
  const canSend = onSendNote !== undefined && sendDisabledReason === null;

  const sendNote = (text: string) => {
    if (!canSend) return;
    // The note leaves the composer's draft as the prompt, then clears so it is not sent twice.
    save(text);
    void onSendNote(text).then((sent) => {
      if (sent) save("");
    });
    onEditEnd?.();
  };
  const sendNoteFromRow = useEffectEvent(() => sendNote(note));
  const sendLabel = sendDisabledReason ?? gt("Send note as prompt");

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- saves an edit still open when the section unmounts (panel closed by keyboard, density change), where no blur fires
  useEffect(
    () => () => {
      const unsaved = unsavedRef.current;
      if (unsaved) unsaved.save(unsaved.text);
      endEdit();
    },
    [],
  );

  if (!hasNote && !canEdit) return null;

  return (
    <ThreadDetailsSection
      headingId="thread-details-note-heading"
      title={gt("Thread note")}
      showHeading={false}
    >
      <div className="flex flex-col">
        {draft !== null ? (
          <div className="flex flex-col gap-1">
            <Textarea
              size="sm"
              rows={4}
              aria-label={gt("Thread note")}
              placeholder={gt("Add a note for this thread…")}
              maxLength={THREAD_NOTE_MAX_LENGTH}
              ref={attachTextarea}
              value={draft}
              onChange={(event) => {
                setDraft(event.currentTarget.value);
                unsavedRef.current = { text: event.currentTarget.value, save };
              }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if (
                  event.key === "Enter" &&
                  event.ctrlKey &&
                  !event.altKey &&
                  !event.shiftKey &&
                  !event.metaKey
                ) {
                  event.preventDefault();
                  event.stopPropagation();
                  if (!canSend) return;
                  // The note is the prompt now, so the editor closes rather than saving a draft.
                  unsavedRef.current = null;
                  setDraft(null);
                  sendNote(event.currentTarget.value);
                  return;
                }
                if (event.key !== "Escape") return;
                // Escape cancels the edit; it must not also close the details popover.
                event.preventDefault();
                event.stopPropagation();
                unsavedRef.current = null;
                setDraft(null);
                onEditEnd?.();
              }}
              onBlur={(event) => {
                save(event.currentTarget.value);
                unsavedRef.current = null;
                // Leaving the window keeps the editor open, so coming back continues the edit.
                if (document.hasFocus()) {
                  setDraft(null);
                  onEditEnd?.();
                }
              }}
            />
            {onSendNote !== undefined ? (
              <div className="flex justify-end">
                <ThreadDetailsControl
                  type="button"
                  variant="ghost"
                  size="sm"
                  part="meta"
                  tone="primary"
                  disabled={!canSend || normalizeThreadNote(draft) === null}
                  onClick={() => sendNote(draft)}
                >
                  <SendHorizonalIcon aria-hidden className="size-3.5" />
                  <span>{sendLabel}</span>
                </ThreadDetailsControl>
              </div>
            ) : null}
          </div>
        ) : canEdit ? (
          <div className="group/note relative flex items-start gap-1">
            <ThreadDetailsControl
              multiline
              tone={hasNote ? "default" : "muted"}
              className="group/note-row min-w-0 flex-1 items-start"
              onClick={() => {
                beginEdit();
                setDraft(note);
              }}
            >
              <StickyNoteIcon className={`${THREAD_DETAILS_PANEL_ICON_CLASS} mt-px`} aria-hidden />
              <span className={NOTE_TEXT_CLASS}>
                {hasNote ? <span className="sr-only">{gt("Edit thread note:")} </span> : null}
                {hasNote ? note : gt("Add note")}
              </span>
              <PencilIcon
                aria-hidden
                className="mt-0.5 size-3.5 shrink-0 text-muted-foreground opacity-0 group-hover/note-row:opacity-100 group-focus-visible/note-row:opacity-100 pointer-coarse:opacity-100"
              />
            </ThreadDetailsControl>
            {hasNote && onSendNote !== undefined ? (
              <span className="mt-0.5 shrink-0 opacity-0 group-hover/note:opacity-100 group-focus-within/note:opacity-100 pointer-coarse:opacity-100">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <ThreadDetailsControl
                        type="button"
                        variant="ghost"
                        size="sm"
                        part="meta"
                        tone="primary"
                        disabled={!canSend}
                        onClick={sendNoteFromRow}
                      />
                    }
                  >
                    <SendHorizonalIcon aria-hidden className="size-3.5" />
                    <span className="sr-only">{sendLabel}</span>
                  </TooltipTrigger>
                  <TooltipPopup side="top">{sendLabel}</TooltipPopup>
                </Tooltip>
              </span>
            ) : null}
          </div>
        ) : (
          <div
            className={cn(
              THREAD_DETAILS_PANEL_LOCKED_ROW_CLASS,
              "flex h-auto items-start py-1.5 sm:h-auto",
            )}
          >
            <StickyNoteIcon className={`${THREAD_DETAILS_PANEL_ICON_CLASS} mt-px`} aria-hidden />
            <span className={NOTE_TEXT_CLASS}>{note}</span>
          </div>
        )}
      </div>
    </ThreadDetailsSection>
  );
}
