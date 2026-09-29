import { canCreateProjectInEnvironment } from "@t3tools/client-runtime/operations/projects";
import type { EnvironmentConnectionPhase } from "@t3tools/client-runtime/connection";
import {
  getBrowseLeafPathSegment,
  getBrowseParentPath,
} from "@t3tools/client-runtime/state/projects";
import type { EnvironmentId } from "@t3tools/contracts";

export function resolveAddProjectEnvironment<
  T extends {
    readonly environmentId: EnvironmentId;
    readonly connectionState: EnvironmentConnectionPhase;
  },
>(environmentOptions: ReadonlyArray<T>, requestedEnvironmentId: EnvironmentId | null): T | null {
  if (requestedEnvironmentId !== null) {
    return (
      environmentOptions.find(
        (environment) =>
          environment.environmentId === requestedEnvironmentId &&
          canCreateProjectInEnvironment(environment.connectionState),
      ) ?? null
    );
  }

  return (
    environmentOptions.find((environment) =>
      canCreateProjectInEnvironment(environment.connectionState),
    ) ?? null
  );
}

/**
 * Where the re-link picker starts, and what it keeps proposing as the user
 * browses.
 *
 * A moved folder is usually the same folder under a new parent, so opening on
 * the current path and pinning its leaf name means browsing up to where the
 * project landed proposes the expected directory instead of a blank one. The
 * seed is the parent because the pinned name is appended to it.
 */
export function resolveProjectFolderReLinkSeed(currentPath: string): {
  readonly initialDirectoryPath: string;
  readonly pinnedDirectoryName: string;
} {
  const leafName = getBrowseLeafPathSegment(currentPath);
  return {
    initialDirectoryPath: getBrowseParentPath(currentPath) ?? "~/",
    pinnedDirectoryName: leafName.length > 0 ? leafName : "",
  };
}
