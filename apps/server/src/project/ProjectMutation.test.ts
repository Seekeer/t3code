import { assert, it } from "@effect/vitest";
import { CommandId, ProjectId, type Project } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";

import { projectMutationOperation, workspaceRootFailureFor } from "./ProjectMutation.ts";
import {
  ProjectNotFoundError,
  ProjectOperationError,
  type ProjectService,
} from "./ProjectService.ts";
import {
  WorkspaceRootNotDirectoryError,
  WorkspaceRootNotExistsError,
} from "../workspace/WorkspacePaths.ts";

const projectId = ProjectId.make("project:mutation-mapping");
const project = {
  id: projectId,
  title: "Mapping",
  workspaceRoot: "/work/mapping",
  repositoryIdentity: null,
  faviconPath: null,
  projectIcon: null,
  defaultModelSelection: null,
  defaultThreadEnvMode: null,
  autoPull: false,
  scripts: [],
  createdAt: "2026-09-05T00:00:00.000Z",
  updatedAt: "2026-09-05T00:00:00.000Z",
  deletedAt: null,
} satisfies Project;

it.effect("preserves every project mutation field", () =>
  Effect.gen(function* () {
    const calls = yield* Ref.make<ReadonlyArray<unknown>>([]);
    const projects: Pick<ProjectService["Service"], "create" | "delete" | "update"> = {
      create: (input) =>
        Ref.update(calls, (entries) => [...entries, input]).pipe(Effect.as(project)),
      update: (input) =>
        Ref.update(calls, (entries) => [...entries, input]).pipe(Effect.as(project)),
      delete: (input) =>
        Ref.update(calls, (entries) => [...entries, input]).pipe(Effect.as(project)),
    };

    yield* projectMutationOperation(projects, {
      type: "project.create",
      commandId: CommandId.make("command:create"),
      projectId,
      title: "Created",
      workspaceRoot: "/work/created",
      createWorkspaceRootIfMissing: true,
      defaultModelSelection: null,
      scripts: [],
    });
    yield* projectMutationOperation(projects, {
      type: "project.update",
      commandId: CommandId.make("command:update"),
      projectId,
      title: "Updated",
      workspaceRoot: "/work/updated",
      defaultModelSelection: null,
      autoPull: false,
      projectIcon: null,
      faviconPath: null,
      defaultThreadEnvMode: null,
      scripts: [],
    });
    yield* projectMutationOperation(projects, {
      type: "project.delete",
      commandId: CommandId.make("command:delete"),
      projectId,
      force: true,
    });

    assert.deepEqual(yield* Ref.get(calls), [
      {
        commandId: "command:create",
        projectId,
        title: "Created",
        workspaceRoot: "/work/created",
        createWorkspaceRootIfMissing: true,
        defaultModelSelection: null,
        scripts: [],
      },
      {
        commandId: "command:update",
        projectId,
        title: "Updated",
        workspaceRoot: "/work/updated",
        defaultModelSelection: null,
        autoPull: false,
        projectIcon: null,
        faviconPath: null,
        defaultThreadEnvMode: null,
        scripts: [],
      },
      { commandId: "command:delete", projectId, force: true },
    ]);
  }),
);

it("explains a rejected workspace root in the user's terms", () => {
  const workspaceRoot = "/work/moved-away";
  assert.equal(
    workspaceRootFailureFor(
      new ProjectOperationError({
        operation: "normalize-workspace",
        projectId,
        workspaceRoot,
        cause: new WorkspaceRootNotExistsError({
          workspaceRoot,
          normalizedWorkspaceRoot: workspaceRoot,
        }),
      }),
    ),
    "workspace_root_not_exists",
  );
  assert.equal(
    workspaceRootFailureFor(
      new ProjectOperationError({
        operation: "normalize-workspace",
        projectId,
        workspaceRoot,
        cause: new WorkspaceRootNotDirectoryError({
          workspaceRoot,
          normalizedWorkspaceRoot: workspaceRoot,
        }),
      }),
    ),
    "workspace_root_not_directory",
  );
});

it("leaves failures that are not about the folder without a reason", () => {
  assert.equal(workspaceRootFailureFor(new ProjectNotFoundError({ projectId })), undefined);
  assert.equal(workspaceRootFailureFor(new Error("environment is offline")), undefined);
});
