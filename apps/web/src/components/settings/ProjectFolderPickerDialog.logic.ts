import { resolveAddProjectPath } from "@t3tools/client-runtime/operations/projects";
import { ensureBrowseDirectoryPath } from "@t3tools/client-runtime/state/projects";
import type { WorkspaceRootFailure } from "@t3tools/contracts";
import { msg } from "gt-react";

import { m } from "~/i18n/messages";

const WORKSPACE_ROOT_FAILURE_MESSAGES: Record<WorkspaceRootFailure, string> = {
  workspace_root_not_exists: msg("That folder does not exist. Pick a folder that already exists."),
  workspace_root_not_directory: msg("That path is a file, not a folder. Pick a folder instead."),
  workspace_root_stat_failed: msg(
    "That folder could not be read. Check the environment's permissions.",
  ),
  workspace_root_create_failed: msg("That folder could not be created on the environment."),
};

// Preserve unrelated errors so callers can show the original failure.
export function workspaceRootFailureMessage(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("workspaceRootFailure" in error)) {
    return null;
  }
  const failure: unknown = error.workspaceRootFailure;
  const message =
    failure == null ? undefined : WORKSPACE_ROOT_FAILURE_MESSAGES[failure as WorkspaceRootFailure];
  return message === undefined ? null : m(message);
}

/**
 * Open the picker on the folder the project points at today, with a trailing
 * separator so the dialog lists that folder's subdirectories rather than
 * filtering them by the last path segment. A project whose folder was moved
 * fails to list, which is exactly the state the user has to re-link from.
 */
export function seedProjectFolderQuery(currentPath: string): string {
  return ensureBrowseDirectoryPath(currentPath);
}

export type ProjectFolderSelection =
  | { readonly ok: true; readonly path: string }
  | { readonly ok: false; readonly error: string };

// A trailing separator selects the browsed directory; otherwise prefer an exact entry.
// A bare ~ is expanded by the server when dispatching the command.
export function resolveProjectFolderSelection(input: {
  readonly query: string;
  readonly browseParentPath: string | null;
  readonly exactEntryPath: string | null;
  readonly platform: string;
}): ProjectFolderSelection {
  const query = input.query.trim();
  const candidate =
    query.endsWith("/") || query.endsWith("\\") || query === "~"
      ? (input.browseParentPath ?? query)
      : (input.exactEntryPath ?? query);
  return resolveAddProjectPath({
    rawPath: candidate,
    // A project's folder is never relative to another project, so the picker
    // refuses relative input rather than guessing a base.
    currentProjectCwd: null,
    platform: input.platform,
  });
}
