import {
  AuthOrchestrationOperateScope,
  normalizeThreadNote,
  THREAD_NOTE_MAX_LENGTH,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import { PencilIcon, StickyNoteIcon } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { useStableCallback } from "../../hooks/useStableCallback";
import { cn } from "../../lib/utils";
import { useEnvironmentScope } from "../../state/session";
import { Textarea } from "../ui/textarea";
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
  onComposerFocusRequest,
  onEditEnd,
}: {
  readonly threadRef: ScopedThreadRef;
  readonly focusRequest?: number;
  readonly onFocusRequestHandled?: () => void;
  readonly onComposerFocusRequest?: () => void;
  readonly onEditEnd?: (() => void) | undefined;
}) {
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
      title="Thread note"
      showHeading={false}
    >
      <div className="flex flex-col">
        {draft !== null ? (
          <Textarea
            size="sm"
            rows={4}
            aria-label="Thread note"
            placeholder="Add a note for this thread…"
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
                save(event.currentTarget.value);
                unsavedRef.current = null;
                setDraft(null);
                onComposerFocusRequest?.();
                onEditEnd?.();
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
        ) : canEdit ? (
          <ThreadDetailsControl
            multiline
            tone={hasNote ? "default" : "muted"}
            className="group/note items-start"
            onClick={() => {
              beginEdit();
              setDraft(note);
            }}
          >
            <StickyNoteIcon className={`${THREAD_DETAILS_PANEL_ICON_CLASS} mt-px`} aria-hidden />
            <span className={NOTE_TEXT_CLASS}>
              {hasNote ? <span className="sr-only">Edit thread note: </span> : null}
              {hasNote ? note : "Add note"}
            </span>
            <PencilIcon
              aria-hidden
              className="mt-0.5 size-3.5 shrink-0 text-muted-foreground opacity-0 group-hover/note:opacity-100 group-focus-visible/note:opacity-100 pointer-coarse:opacity-100"
            />
          </ThreadDetailsControl>
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
