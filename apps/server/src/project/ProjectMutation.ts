import { type ProjectMutation, type WorkspaceRootFailure } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { type ProjectService } from "./ProjectService.ts";

type ProjectMutations = Pick<ProjectService["Service"], "create" | "delete" | "update">;

const workspaceRootFailureTag = (error: unknown): WorkspaceRootFailure | undefined => {
  if (typeof error !== "object" || error === null || !("_tag" in error)) return undefined;
  switch (error._tag) {
    case "WorkspaceRootNotExistsError":
      return "workspace_root_not_exists";
    case "WorkspaceRootNotDirectoryError":
      return "workspace_root_not_directory";
    case "WorkspaceRootStatFailedError":
      return "workspace_root_stat_failed";
    case "WorkspaceRootCreateFailedError":
      return "workspace_root_create_failed";
    default:
      return undefined;
  }
};

/**
 * Projects can be re-pointed at a folder the user just picked, so a rejected
 * workspace root is an expected outcome the client explains inline rather than
 * an opaque "Failed to mutate project." toast.
 */
export const workspaceRootFailureFor = (cause: unknown): WorkspaceRootFailure | undefined => {
  if (typeof cause !== "object" || cause === null || !("cause" in cause)) return undefined;
  if (!("operation" in cause) || cause.operation !== "normalize-workspace") return undefined;
  return workspaceRootFailureTag(cause.cause);
};

export const projectMutationOperation = Effect.fn("projectMutationOperation")(function* (
  projects: ProjectMutations,
  mutation: ProjectMutation,
) {
  switch (mutation.type) {
    case "project.create":
      return yield* projects.create({
        commandId: mutation.commandId,
        projectId: mutation.projectId,
        title: mutation.title,
        workspaceRoot: mutation.workspaceRoot,
        ...(mutation.createWorkspaceRootIfMissing === undefined
          ? {}
          : { createWorkspaceRootIfMissing: mutation.createWorkspaceRootIfMissing }),
        ...(mutation.defaultModelSelection === undefined
          ? {}
          : { defaultModelSelection: mutation.defaultModelSelection }),
        ...(mutation.scripts === undefined ? {} : { scripts: mutation.scripts }),
      });

    case "project.update":
      return yield* projects.update({
        commandId: mutation.commandId,
        projectId: mutation.projectId,
        ...(mutation.title === undefined ? {} : { title: mutation.title }),
        ...(mutation.workspaceRoot === undefined ? {} : { workspaceRoot: mutation.workspaceRoot }),
        ...(mutation.defaultModelSelection === undefined
          ? {}
          : { defaultModelSelection: mutation.defaultModelSelection }),
        ...(mutation.autoPull === undefined ? {} : { autoPull: mutation.autoPull }),
        ...(mutation.projectIcon === undefined ? {} : { projectIcon: mutation.projectIcon }),
        ...(mutation.faviconPath === undefined ? {} : { faviconPath: mutation.faviconPath }),
        ...(mutation.defaultThreadEnvMode === undefined
          ? {}
          : { defaultThreadEnvMode: mutation.defaultThreadEnvMode }),
        ...(mutation.scripts === undefined ? {} : { scripts: mutation.scripts }),
      });

    case "project.delete":
      return yield* projects.delete({
        commandId: mutation.commandId,
        projectId: mutation.projectId,
        ...(mutation.force === undefined ? {} : { force: mutation.force }),
      });
  }
});
