import {
  AuthOrchestrationOperateScope,
  normalizeThreadNote,
  THREAD_NOTE_MAX_LENGTH,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import { PencilIcon, StickyNoteIcon } from "lucide-react";
import { useState } from "react";

import { useEnvironmentScope } from "../../state/session";
import { Textarea } from "../ui/textarea";
import { ThreadDetailsControl } from "./ThreadDetailsControl";
import { ThreadDetailsSection } from "./ThreadDetailsSection";
import { useThreadNoteSave } from "./ThreadNoteButton";
import { THREAD_DETAILS_PANEL_ICON_CLASS } from "./threadDetailsPanelStyles";

/** The thread note as a short preview that turns into an editor in place. */
export function ThreadDetailsNote({ threadRef }: { readonly threadRef: ScopedThreadRef }) {
  const canEdit = useEnvironmentScope(threadRef.environmentId, AuthOrchestrationOperateScope);
  // Null while reading; a string is the text being edited.
  const [draft, setDraft] = useState<string | null>(null);
  const { note, save, beginEdit } = useThreadNoteSave(threadRef, canEdit, setDraft);
  const hasNote = normalizeThreadNote(note) !== null;

  if (!hasNote && !canEdit && draft === null) return null;

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
            autoFocus
            value={draft}
            onFocus={(event) => {
              const end = event.currentTarget.value.length;
              event.currentTarget.setSelectionRange(end, end);
            }}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              // Escape cancels the edit; it must not also close the details popover.
              event.preventDefault();
              event.stopPropagation();
              setDraft(null);
            }}
            onBlur={(event) => {
              save(event.currentTarget.value);
              // Leaving the window keeps the editor open, so coming back continues the edit.
              if (document.hasFocus()) setDraft(null);
            }}
          />
        ) : (
          <ThreadDetailsControl
            multiline
            tone={hasNote ? "default" : "muted"}
            disabled={!canEdit}
            aria-label={hasNote ? "Edit thread note" : "Add thread note"}
            className="group/note items-start disabled:cursor-default"
            onClick={() => {
              beginEdit();
              setDraft(note);
            }}
          >
            <StickyNoteIcon className={`${THREAD_DETAILS_PANEL_ICON_CLASS} mt-px`} aria-hidden />
            <span className="line-clamp-3 min-w-0 flex-1 font-normal break-words whitespace-pre-wrap">
              {hasNote ? note : "Add note"}
            </span>
            {canEdit ? (
              <PencilIcon
                aria-hidden
                className="mt-0.5 size-3.5 shrink-0 text-muted-foreground opacity-0 group-hover/note:opacity-100 group-focus-visible/note:opacity-100"
              />
            ) : null}
          </ThreadDetailsControl>
        )}
      </div>
    </ThreadDetailsSection>
  );
}
