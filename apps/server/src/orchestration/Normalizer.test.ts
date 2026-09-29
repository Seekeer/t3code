// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeOS from "node:os";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import {
  CommandId,
  type ClientOrchestrationCommand,
  MessageId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";

import * as ServerConfig from "../config.ts";
import * as WorkspacePaths from "../workspace/WorkspacePaths.ts";
import { canonicalizeClientCommandTimestamps, normalizeDispatchCommand } from "./Normalizer.ts";

const testLayer = Layer.mergeAll(
  WorkspacePaths.layer,
  ServerConfig.layerTest(process.cwd(), { prefix: "t3-normalizer-" }),
).pipe(Layer.provideMerge(NodeServices.layer));

const clientCreatedAt = "2031-01-01T00:00:00.000Z";
const serverReceivedAt = "2026-07-18T00:00:00.000Z";

describe("canonicalizeClientCommandTimestamps", () => {
  it("replaces a client command timestamp with the server receipt timestamp", () => {
    const command: ClientOrchestrationCommand = {
      type: "project.create",
      commandId: CommandId.make("command-1"),
      projectId: ProjectId.make("project-1"),
      title: "Clock-safe project",
      workspaceRoot: "/tmp/clock-safe-project",
      createdAt: clientCreatedAt,
    };

    expect(canonicalizeClientCommandTimestamps(command, serverReceivedAt)).toEqual({
      ...command,
      createdAt: serverReceivedAt,
    });
  });

  it("replaces both timestamps when the first turn bootstraps a thread", () => {
    const command: ClientOrchestrationCommand = {
      type: "thread.turn.start",
      commandId: CommandId.make("command-2"),
      threadId: ThreadId.make("thread-1"),
      message: {
        messageId: MessageId.make("message-1"),
        role: "user",
        text: "Start a thread",
        attachments: [],
      },
      runtimeMode: "full-access",
      interactionMode: "default",
      bootstrap: {
        createThread: {
          projectId: ProjectId.make("project-1"),
          title: "Clock-safe thread",
          modelSelection: {
            instanceId: ProviderInstanceId.make("codex"),
            model: "gpt-5.4",
          },
          runtimeMode: "full-access",
          interactionMode: "default",
          branch: null,
          worktreePath: null,
          createdAt: clientCreatedAt,
        },
      },
      createdAt: clientCreatedAt,
    };

    const result = canonicalizeClientCommandTimestamps(command, serverReceivedAt);

    expect(result.type).toBe("thread.turn.start");
    if (result.type !== "thread.turn.start") {
      throw new Error("Expected a thread.turn.start command");
    }
    expect(result.createdAt).toBe(serverReceivedAt);
    expect(result.bootstrap?.createThread?.createdAt).toBe(serverReceivedAt);
  });
});

function metaUpdateCommand(workspaceRoot: string): ClientOrchestrationCommand {
  return {
    type: "project.meta.update",
    commandId: CommandId.make("command-relink"),
    projectId: ProjectId.make("project-1"),
    workspaceRoot,
  };
}

function dispatchedWorkspaceRootFailure(exit: Exit.Exit<unknown, unknown>) {
  if (Exit.isSuccess(exit)) {
    throw new Error("Expected the dispatch to be rejected.");
  }
  const error = Cause.squash(exit.cause);
  if (typeof error !== "object" || error === null || !("workspaceRootFailure" in error)) {
    throw new Error(`Expected a workspace root failure, got: ${Cause.pretty(exit.cause)}`);
  }
  return error.workspaceRootFailure;
}

describe("normalizeDispatchCommand project re-link", () => {
  it.effect("accepts an existing directory and resolves it to an absolute path", () =>
    Effect.gen(function* () {
      const directory = yield* Effect.promise(() =>
        NodeFS.promises.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-relink-")),
      );

      const normalized = yield* normalizeDispatchCommand(metaUpdateCommand(directory));

      expect(normalized.type).toBe("project.meta.update");
      if (normalized.type !== "project.meta.update") {
        throw new Error("Expected a project.meta.update command.");
      }
      expect(normalized.workspaceRoot).toBe(directory);
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("reports a missing directory so the client can offer a re-link", () =>
    Effect.gen(function* () {
      const parent = yield* Effect.promise(() =>
        NodeFS.promises.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-relink-")),
      );
      const missing = NodePath.join(parent, "moved-away");

      const exit = yield* Effect.exit(normalizeDispatchCommand(metaUpdateCommand(missing)));

      expect(dispatchedWorkspaceRootFailure(exit)).toBe("workspace_root_not_exists");
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("reports a file chosen as the new root", () =>
    Effect.gen(function* () {
      const parent = yield* Effect.promise(() =>
        NodeFS.promises.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-relink-")),
      );
      const filePath = NodePath.join(parent, "not-a-folder");
      yield* Effect.promise(() => NodeFS.promises.writeFile(filePath, "contents"));

      const exit = yield* Effect.exit(normalizeDispatchCommand(metaUpdateCommand(filePath)));

      expect(dispatchedWorkspaceRootFailure(exit)).toBe("workspace_root_not_directory");
    }).pipe(Effect.provide(testLayer)),
  );
});
