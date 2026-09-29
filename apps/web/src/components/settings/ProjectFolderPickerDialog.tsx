import { useAtomValue } from "@effect/atom-react";
import {
  filterFilesystemBrowseEntries,
  getFilesystemBrowsePath,
  isMissingDirectoryBrowseError,
} from "@t3tools/client-runtime/state/filesystem";
import {
  appendBrowsePathSegment,
  canNavigateUp,
  getBrowseParentPath,
} from "@t3tools/client-runtime/state/projects";
import type { EnvironmentId } from "@t3tools/contracts";
import { CornerLeftUpIcon, FolderIcon } from "lucide-react";
import { useCallback, useMemo, useState, type KeyboardEvent } from "react";

import { primaryServerKeybindingsAtom } from "~/state/server";
import { filesystemEnvironment } from "~/state/filesystem";
import { useEnvironmentQuery } from "~/state/query";
import { CommandPaletteContent } from "../CommandPaletteContent";
import { buildBrowseGroups, ITEM_ICON_CLASS } from "../CommandPalette.logic";
import { CommandPaletteResults } from "../CommandPaletteResults";
import { Button } from "../ui/button";
import { CommandDialog, CommandDialogPopup } from "../ui/command";
import { Kbd, KbdGroup } from "../ui/kbd";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  resolveProjectFolderSelection,
  seedProjectFolderQuery,
} from "./ProjectFolderPickerDialog.logic";

/**
 * Pick the folder a project's checkout points at.
 *
 * Every path here is resolved by the project's own environment, so a remote or
 * tunneled project lists that machine's filesystem rather than the client's.
 * The server alone decides whether a path is usable, so this dialog hands over
 * a path and lets the dispatch result speak.
 */
export function ProjectFolderPickerDialog(props: {
  readonly currentPath: string;
  readonly environmentId: EnvironmentId;
  readonly onClose: () => void;
  readonly onSelect: (path: string) => void;
  readonly open: boolean;
  readonly platform: string;
  readonly projectName: string;
}) {
  return (
    <CommandDialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open) {
          props.onClose();
        }
      }}
    >
      {props.open ? (
        <ProjectFolderPickerBody
          currentPath={props.currentPath}
          environmentId={props.environmentId}
          onClose={props.onClose}
          onSelect={props.onSelect}
          platform={props.platform}
          projectName={props.projectName}
        />
      ) : null}
    </CommandDialog>
  );
}

/**
 * Mounted only while the dialog is open so every visit starts from the folder
 * the project points at now, rather than wherever the last visit wandered to.
 */
function ProjectFolderPickerBody(props: {
  readonly currentPath: string;
  readonly environmentId: EnvironmentId;
  readonly onClose: () => void;
  readonly onSelect: (path: string) => void;
  readonly platform: string;
  readonly projectName: string;
}) {
  const [query, setQuery] = useState(() => seedProjectFolderQuery(props.currentPath));
  const [highlightedItemValue, setHighlightedItemValue] = useState<string | null>(null);
  const { onClose, onSelect, platform } = props;
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);

  const browsePath = useMemo(() => getFilesystemBrowsePath(query, platform), [platform, query]);
  const browseState = useEnvironmentQuery(
    browsePath.directoryPath.length > 0
      ? filesystemEnvironment.browse({
          environmentId: props.environmentId,
          input: { partialPath: browsePath.directoryPath },
        })
      : null,
  );
  const browseResult = browseState.data;
  // Only the environment saying "I cannot read this directory" means the folder
  // is gone. An unreachable environment fails the same request in a different
  // shape, and blaming the folder for that sends the user to the wrong place.
  const browseDirectoryIsMissing = isMissingDirectoryBrowseError(browseState.cause);

  const { visibleEntries, exactEntry } = useMemo(
    () => filterFilesystemBrowseEntries(browseResult?.entries ?? [], browsePath.filterQuery),
    [browsePath.filterQuery, browseResult?.entries],
  );

  const selection = resolveProjectFolderSelection({
    query,
    browseParentPath: browseResult?.parentPath ?? null,
    exactEntryPath: exactEntry?.fullPath ?? null,
    platform,
  });

  const canSubmitSelection = selection.ok && !browseState.isPending;

  const selectResolvedFolder = useCallback(() => {
    if (selection.ok) {
      onSelect(selection.path);
    }
  }, [onSelect, selection]);

  /**
   * Enter takes the folder the input points at, which is the whole point of the
   * dialog. Descending into a subfolder needs an explicit highlight, because
   * auto-highlighting one would turn a typed path into a surprise.
   */
  const handleInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Enter" || highlightedItemValue !== null) {
        return;
      }
      if (!canSubmitSelection) {
        return;
      }
      event.preventDefault();
      selectResolvedFolder();
    },
    [canSubmitSelection, highlightedItemValue, selectResolvedFolder],
  );

  const browseTo = useCallback(
    (name: string) => {
      setHighlightedItemValue(null);
      setQuery(appendBrowsePathSegment(query, name));
    },
    [query],
  );

  const browseUp = useCallback(() => {
    const parentPath = getBrowseParentPath(query);
    if (parentPath === null) {
      return;
    }
    setHighlightedItemValue(null);
    setQuery(parentPath);
  }, [query]);

  const groups = useMemo(
    () =>
      buildBrowseGroups({
        browseEntries: visibleEntries,
        browseQuery: query,
        canBrowseUp: canNavigateUp(query),
        upIcon: <CornerLeftUpIcon className={ITEM_ICON_CLASS} />,
        directoryIcon: <FolderIcon className={ITEM_ICON_CLASS} />,
        browseUp,
        browseTo,
      }),
    [browseTo, browseUp, query, visibleEntries],
  );

  const ariaLabel = `Change folder for ${props.projectName}`;

  return (
    <CommandDialogPopup
      aria-label={ariaLabel}
      className="overflow-hidden p-0"
      onBackdropPointerDown={onClose}
    >
      <CommandPaletteContent
        aria-label={ariaLabel}
        autoHighlight={false}
        escapeLabel="Close"
        footerActionLabel={selection.ok ? "Use folder" : undefined}
        inputAccessory={
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="xs"
                  tabIndex={-1}
                  className="absolute inset-e-2.5 top-1/2 pe-1 ps-2 -translate-y-1/2"
                  aria-label="Use folder (Enter)"
                  disabled={!canSubmitSelection}
                  onMouseDown={(event) => {
                    event.preventDefault();
                  }}
                  onClick={selectResolvedFolder}
                />
              }
            >
              <span>{selection.ok ? "Use folder" : "Invalid path"}</span>
              <KbdGroup className="pointer-events-none -me-0.5 items-center gap-1">
                <Kbd>Enter</Kbd>
              </KbdGroup>
            </TooltipTrigger>
            <TooltipPopup side="top">
              {selection.ok ? "Use folder (Enter)" : selection.error}
            </TooltipPopup>
          </Tooltip>
        }
        inputProps={{ onKeyDown: handleInputKeyDown, placeholder: "~/projects/my-app/" }}
        mode="none"
        onItemHighlighted={(value) => {
          setHighlightedItemValue(typeof value === "string" ? value : null);
        }}
        onValueChange={(value) => {
          setHighlightedItemValue(null);
          setQuery(value);
        }}
        panelClassName="max-h-[min(34rem,76vh)]"
        testId="project-folder-picker"
        value={query}
      >
        <CommandPaletteResults
          groups={groups}
          highlightedItemValue={highlightedItemValue}
          isActionsOnly={false}
          keybindings={keybindings}
          onExecuteItem={(item) => {
            if (item.kind === "action") {
              void item.run();
            }
          }}
          emptyStateMessage={projectFolderPickerEmptyMessage({
            cause: browseState.cause,
            isPending: browseState.isPending,
            isBrowsingADirectory: browsePath.directoryPath.length > 0,
          })}
        />
      </CommandPaletteContent>
    </CommandDialogPopup>
  );
}

function projectFolderPickerEmptyMessage(input: {
  readonly cause: unknown;
  readonly isPending: boolean;
  readonly isBrowsingADirectory: boolean;
}): string {
  if (isMissingDirectoryBrowseError(input.cause)) {
    return "This folder is not available. Choose another folder.";
  }
  if (input.cause !== null) {
    return "The environment could not be reached. Try again once it is connected.";
  }
  if (input.isPending) {
    return "Loading folders…";
  }
  return input.isBrowsingADirectory ? "No subfolders here." : "Type or paste a folder path.";
}
