import { resolveAddProjectPath } from "@t3tools/client-runtime/operations/projects";
import { ensureBrowseDirectoryPath } from "@t3tools/client-runtime/state/projects";
import type { WorkspaceRootFailure } from "@t3tools/contracts";

const WORKSPACE_ROOT_FAILURE_MESSAGES: Record<WorkspaceRootFailure, string> = {
  workspace_root_not_exists: "That folder does not exist. Pick a folder that already exists.",
  workspace_root_not_directory: "That path is a file, not a folder. Pick a folder instead.",
  workspace_root_stat_failed: "That folder could not be read. Check the environment's permissions.",
  workspace_root_create_failed: "That folder could not be created on the environment.",
};

/**
 * Explain a rejected folder in the user's terms, or return null when the
 * failure is something else (an offline environment, an auth failure) whose own
 * message is the more useful thing to show.
 *
 * Changing a project's folder only ever points at a directory that already
 * exists, so a missing path is a wrong turn rather than a server fault.
 */
export function workspaceRootFailureMessage(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("workspaceRootFailure" in error)) {
    return null;
  }
  const failure: unknown = error.workspaceRootFailure;
  return failure === undefined || failure === null
    ? null
    : (WORKSPACE_ROOT_FAILURE_MESSAGES[failure as WorkspaceRootFailure] ?? null);
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

/**
 * Resolve the folder the user is pointing at.
 *
 * A trailing separator means "the directory I typed" and the browse result's
 * parent path is the canonical form of it. Otherwise the query is a partial
 * leaf name, so an exact directory match wins over the raw text. A bare `~` is
 * not a browse query, so the server expands it when the command is dispatched.
 */
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
