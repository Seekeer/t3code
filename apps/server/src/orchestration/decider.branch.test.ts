import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import {
  ChatAttachment,
  ChatImageAttachment,
  CommandId,
  EventId,
  MessageId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationEvent,
  type OrchestrationMessageCompletion,
  type OrchestrationReadModel,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { decideOrchestrationCommand } from "./decider.ts";
import { createEmptyReadModel, projectEvent } from "./projector.ts";
import { BRANCH_INHERITED_CONTEXT_MAX_CHARS } from "./branchInheritedContext.ts";

const PROJECT_ID = ProjectId.make("project-1");
const SOURCE_THREAD_ID = ThreadId.make("source-thread");
const BRANCH_THREAD_ID = ThreadId.make("branch-thread");
const CREATED_AT = "2026-09-01T10:00:00.000Z";

const IMAGE_ATTACHMENT: ChatImageAttachment = {
  type: "image",
  id: "attachment-1",
  name: "diagram.png",
  mimeType: "image/png",
  sizeBytes: 1024,
};

interface SourceMessageSpec {
  readonly id: string;
  readonly role: "user" | "assistant" | "reasoning";
  readonly text: string;
  readonly streaming?: boolean;
  readonly completion?: OrchestrationMessageCompletion;
  readonly attachments?: ReadonlyArray<ChatAttachment>;
}

/**
 * A source thread carrying `messages` in order, in the source's own project,
 * provider instance, model and worktree.
 */
function makeSourceReadModel(messages: ReadonlyArray<SourceMessageSpec>) {
  return Effect.gen(function* () {
    let readModel: OrchestrationReadModel = yield* projectEvent(createEmptyReadModel(CREATED_AT), {
      sequence: 1,
      eventId: EventId.make("event-project-created"),
      aggregateKind: "project",
      aggregateId: PROJECT_ID,
      type: "project.created",
      occurredAt: CREATED_AT,
      commandId: CommandId.make("command-project-created"),
      causationEventId: null,
      correlationId: CommandId.make("command-project-created"),
      metadata: {},
      payload: {
        projectId: PROJECT_ID,
        title: "Project",
        workspaceRoot: "/tmp/project",
        defaultModelSelection: null,
        scripts: [],
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      },
    });
    readModel = yield* projectEvent(readModel, {
      sequence: 2,
      eventId: EventId.make("event-thread-created"),
      aggregateKind: "thread",
      aggregateId: SOURCE_THREAD_ID,
      type: "thread.created",
      occurredAt: CREATED_AT,
      commandId: CommandId.make("command-thread-created"),
      causationEventId: null,
      correlationId: CommandId.make("command-thread-created"),
      metadata: {},
      payload: {
        threadId: SOURCE_THREAD_ID,
        projectId: PROJECT_ID,
        title: "Source thread",
        modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5" },
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: "feature/source",
        worktreePath: "/tmp/project/.worktrees/source",
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      },
    });

    for (const [index, message] of messages.entries()) {
      readModel = yield* projectEvent(readModel, {
        sequence: 3 + index,
        eventId: EventId.make(`event-message-${message.id}`),
        aggregateKind: "thread",
        aggregateId: SOURCE_THREAD_ID,
        type: "thread.message-sent",
        occurredAt: CREATED_AT,
        commandId: CommandId.make(`command-message-${message.id}`),
        causationEventId: null,
        correlationId: CommandId.make(`command-message-${message.id}`),
        metadata: {},
        payload: {
          threadId: SOURCE_THREAD_ID,
          messageId: MessageId.make(message.id),
          role: message.role,
          text: message.text,
          turnId: null,
          streaming: message.streaming ?? false,
          ...(message.completion !== undefined ? { completion: message.completion } : {}),
          ...(message.attachments !== undefined ? { attachments: message.attachments } : {}),
          createdAt: CREATED_AT,
          updatedAt: CREATED_AT,
        },
      });
    }
    return readModel;
  });
}

/** A completed first reply followed by a second turn of conversation. */
const COMPLETED_FIRST_REPLY: ReadonlyArray<SourceMessageSpec> = [
  { id: "message-user-1", role: "user", text: "First question" },
  {
    id: "message-assistant-1",
    role: "assistant",
    text: "First answer",
    completion: "completed",
  },
  { id: "message-user-2", role: "user", text: "Later question" },
  {
    id: "message-assistant-2",
    role: "assistant",
    text: "Later answer",
    completion: "completed",
  },
];

function branchCommand(
  overrides: Partial<{
    threadId: ThreadId;
    sourceThreadId: ThreadId;
    sourceMessageId: MessageId;
  }> = {},
) {
  return {
    type: "thread.branch.create" as const,
    commandId: CommandId.make("command-branch-create"),
    threadId: overrides.threadId ?? BRANCH_THREAD_ID,
    sourceThreadId: overrides.sourceThreadId ?? SOURCE_THREAD_ID,
    sourceMessageId: overrides.sourceMessageId ?? MessageId.make("message-assistant-1"),
    createdAt: "2026-09-01T11:00:00.000Z",
  };
}

const projectAll = Effect.fn("projectAll")(function* (
  readModel: OrchestrationReadModel,
  events: ReadonlyArray<OrchestrationEvent>,
) {
  let model = readModel;
  for (const [index, event] of events.entries()) {
    model = yield* projectEvent(model, { ...event, sequence: index + 100 });
  }
  return model;
});

/** The copied-message events of a branch-creation plan, with typed payloads. */
function copiedMessageEvents(events: ReadonlyArray<OrchestrationEvent>) {
  return events.flatMap((event) =>
    event.type === "thread.message-sent" && "messageId" in event.payload
      ? [{ event, payload: event.payload }]
      : [],
  );
}

it.layer(NodeServices.layer)("thread.branch.create", (it) => {
  it.effect("copies the ordered prefix, keeps the source, and opens idle", () =>
    Effect.gen(function* () {
      const readModel = yield* makeSourceReadModel(COMPLETED_FIRST_REPLY);
      const sourceBefore = readModel.threads[0];

      const events = yield* decideOrchestrationCommand({ command: branchCommand(), readModel });
      expect(Array.isArray(events)).toBe(true);
      const planned = events as ReadonlyArray<OrchestrationEvent>;

      expect(planned.map((event) => event.type)).toEqual([
        "thread.created",
        "thread.message-sent",
        "thread.message-sent",
        "thread.branched",
        "thread.settled",
      ]);
      // Everything through the selected reply, nothing after it.
      expect(copiedMessageEvents(planned).map(({ payload }) => payload)).toMatchObject([
        { role: "user", text: "First question", turnId: null, streaming: false },
        {
          role: "assistant",
          text: "First answer",
          turnId: null,
          streaming: false,
          completion: "completed",
        },
      ]);
      // Destination-owned identities, in the namespace that keeps copied
      // history out of queued work and checkpoint baselines.
      expect(copiedMessageEvents(planned).map(({ payload }) => payload.messageId)).toEqual([
        "import:branch-thread:000000",
        "import:branch-thread:000001",
      ]);

      expect(planned[3]?.payload).toMatchObject({
        branchedFrom: {
          sourceThreadId: SOURCE_THREAD_ID,
          sourceThreadTitle: "Source thread",
          sourceMessageId: "message-assistant-1",
          strategy: "text-context",
          inheritedMessageCount: 2,
          inheritedContextState: "pending",
        },
      });
      // Same project, provider instance, model and current workspace. No Git
      // branch and no file restore are part of creation.
      expect(planned[0]?.payload).toMatchObject({
        projectId: PROJECT_ID,
        modelSelection: { instanceId: "codex", model: "gpt-5" },
        branch: "feature/source",
        worktreePath: "/tmp/project/.worktrees/source",
      });

      const projected = yield* projectAll(readModel, planned);
      const source = projected.threads.find((thread) => thread.id === SOURCE_THREAD_ID);
      expect(source).toEqual(sourceBefore);

      const branch = projected.threads.find((thread) => thread.id === BRANCH_THREAD_ID);
      expect(branch?.branchedFrom?.sourceThreadId).toBe(SOURCE_THREAD_ID);
      expect(branch?.session).toBeNull();
      expect(branch?.latestTurn).toBeNull();
      expect(branch?.settledOverride).toBe("settled");
      expect(branch?.checkpoints).toEqual([]);
      expect(branch?.activities).toEqual([]);
    }),
  );

  it.effect("keeps an earlier completed reply eligible while a later reply streams", () =>
    Effect.gen(function* () {
      const readModel = yield* makeSourceReadModel([
        ...COMPLETED_FIRST_REPLY,
        { id: "message-assistant-3", role: "assistant", text: "Still working", streaming: true },
      ]);
      const events = yield* decideOrchestrationCommand({ command: branchCommand(), readModel });
      const projected = yield* projectAll(readModel, events as ReadonlyArray<OrchestrationEvent>);
      const branch = projected.threads.find((thread) => thread.id === BRANCH_THREAD_ID);
      expect(branch?.messages.map((message) => message.text)).toEqual([
        "First question",
        "First answer",
      ]);
    }),
  );

  it.effect("leaves reasoning traces out of the copied prefix", () =>
    Effect.gen(function* () {
      const readModel = yield* makeSourceReadModel([
        { id: "message-user-1", role: "user", text: "First question" },
        { id: "message-reasoning-1", role: "reasoning", text: "Thinking about it" },
        {
          id: "message-assistant-1",
          role: "assistant",
          text: "First answer",
          completion: "completed",
        },
      ]);
      const events = yield* decideOrchestrationCommand({ command: branchCommand(), readModel });
      const projected = yield* projectAll(readModel, events as ReadonlyArray<OrchestrationEvent>);
      const branch = projected.threads.find((thread) => thread.id === BRANCH_THREAD_ID);
      expect(branch?.messages.map((message) => message.text)).toEqual([
        "First question",
        "First answer",
      ]);
      expect(branch?.branchedFrom?.inheritedMessageCount).toBe(2);
    }),
  );

  it.effect("rejects a partial reply whose streaming stopped", () =>
    Effect.gen(function* () {
      const readModel = yield* makeSourceReadModel([
        { id: "message-user-1", role: "user", text: "First question" },
        {
          id: "message-assistant-1",
          role: "assistant",
          text: "Half an answer",
          completion: "interrupted",
        },
      ]);
      const error = yield* Effect.flip(
        decideOrchestrationCommand({ command: branchCommand(), readModel }),
      );
      expect(error._tag).toBe("OrchestrationCommandInvariantError");
      expect(error.message).toContain("is not a completed agent reply");
    }),
  );

  it.effect("rejects a reply that never recorded an outcome", () =>
    Effect.gen(function* () {
      const readModel = yield* makeSourceReadModel([
        { id: "message-user-1", role: "user", text: "First question" },
        { id: "message-assistant-1", role: "assistant", text: "Partial" },
      ]);
      const error = yield* Effect.flip(
        decideOrchestrationCommand({ command: branchCommand(), readModel }),
      );
      expect(error._tag).toBe("OrchestrationCommandInvariantError");
    }),
  );

  it.effect("rejects a user message", () =>
    Effect.gen(function* () {
      const readModel = yield* makeSourceReadModel(COMPLETED_FIRST_REPLY);
      const error = yield* Effect.flip(
        decideOrchestrationCommand({
          command: branchCommand({ sourceMessageId: MessageId.make("message-user-1") }),
          readModel,
        }),
      );
      expect(error._tag).toBe("OrchestrationCommandInvariantError");
    }),
  );

  it.effect("rejects a message that belongs to another thread", () =>
    Effect.gen(function* () {
      const readModel = yield* makeSourceReadModel(COMPLETED_FIRST_REPLY);
      const error = yield* Effect.flip(
        decideOrchestrationCommand({
          command: branchCommand({ sourceMessageId: MessageId.make("message-from-elsewhere") }),
          readModel,
        }),
      );
      expect(error.message).toContain("is not a completed agent reply");
    }),
  );

  it.effect("rejects a prefix carrying attachments instead of dropping them", () =>
    Effect.gen(function* () {
      const readModel = yield* makeSourceReadModel([
        { id: "message-user-1", role: "user", text: "See this", attachments: [IMAGE_ATTACHMENT] },
        {
          id: "message-assistant-1",
          role: "assistant",
          text: "First answer",
          completion: "completed",
        },
      ]);
      const error = yield* Effect.flip(
        decideOrchestrationCommand({ command: branchCommand(), readModel }),
      );
      expect(error.message).toContain("not supported for conversations with attachments");
    }),
  );

  it.effect("refuses an oversized inherited context without truncating", () =>
    Effect.gen(function* () {
      const readModel = yield* makeSourceReadModel([
        { id: "message-user-1", role: "user", text: "First question" },
        {
          id: "message-assistant-1",
          role: "assistant",
          text: "x".repeat(BRANCH_INHERITED_CONTEXT_MAX_CHARS),
          completion: "completed",
        },
      ]);
      const error = yield* Effect.flip(
        decideOrchestrationCommand({ command: branchCommand(), readModel }),
      );
      expect(error.message).toContain("too long to inherit");
    }),
  );

  it.effect("refuses a destination id that already holds the source", () =>
    Effect.gen(function* () {
      const readModel = yield* makeSourceReadModel(COMPLETED_FIRST_REPLY);
      const error = yield* Effect.flip(
        decideOrchestrationCommand({
          command: branchCommand({ threadId: SOURCE_THREAD_ID }),
          readModel,
        }),
      );
      expect(error.message).toContain("must be created in a new thread");
    }),
  );

  it.effect("refuses a source that no longer exists", () =>
    Effect.gen(function* () {
      const readModel = yield* makeSourceReadModel(COMPLETED_FIRST_REPLY);
      const deleted = yield* projectEvent(readModel, {
        sequence: 40,
        eventId: EventId.make("event-source-deleted"),
        aggregateKind: "thread",
        aggregateId: SOURCE_THREAD_ID,
        type: "thread.deleted",
        occurredAt: "2026-09-01T12:30:00.000Z",
        commandId: CommandId.make("command-source-deleted"),
        causationEventId: null,
        correlationId: CommandId.make("command-source-deleted"),
        metadata: {},
        payload: {
          threadId: SOURCE_THREAD_ID,
          deletedAt: "2026-09-01T12:30:00.000Z",
        },
      });
      const error = yield* Effect.flip(
        decideOrchestrationCommand({ command: branchCommand(), readModel: deleted }),
      );
      expect(error.message).toContain("no longer exists");
    }),
  );

  it.effect("keeps a branch that can itself be branched from", () =>
    Effect.gen(function* () {
      const readModel = yield* makeSourceReadModel(COMPLETED_FIRST_REPLY);
      const events = yield* decideOrchestrationCommand({ command: branchCommand(), readModel });
      const projected = yield* projectAll(readModel, events as ReadonlyArray<OrchestrationEvent>);
      const nested = yield* decideOrchestrationCommand({
        command: branchCommand({
          threadId: ThreadId.make("nested-branch"),
          sourceThreadId: BRANCH_THREAD_ID,
          sourceMessageId: MessageId.make("import:branch-thread:000001"),
        }),
        readModel: projected,
      });
      expect(Array.isArray(nested)).toBe(true);
      const nestedProjected = yield* projectAll(
        projected,
        nested as ReadonlyArray<OrchestrationEvent>,
      );
      expect(
        nestedProjected.threads.find((thread) => thread.id === "nested-branch")?.branchedFrom
          ?.sourceThreadId,
      ).toBe(BRANCH_THREAD_ID);
    }),
  );

  it.effect("records the inherited context as accepted exactly once", () =>
    Effect.gen(function* () {
      const readModel = yield* makeSourceReadModel(COMPLETED_FIRST_REPLY);
      const events = yield* decideOrchestrationCommand({ command: branchCommand(), readModel });
      const created = yield* projectAll(readModel, events as ReadonlyArray<OrchestrationEvent>);
      expect(
        created.threads.find((thread) => thread.id === BRANCH_THREAD_ID)?.branchedFrom
          ?.inheritedContextState,
      ).toBe("pending");

      const accepted = yield* decideOrchestrationCommand({
        command: {
          type: "thread.branch.inherited-context.accepted",
          commandId: CommandId.make("command-branch-accepted"),
          threadId: BRANCH_THREAD_ID,
          createdAt: "2026-09-01T12:00:00.000Z",
        },
        readModel: created,
      });
      expect(accepted).toMatchObject({
        type: "thread.branch-inherited-context-accepted",
        payload: { inheritedContextState: "accepted" },
      });
      const projected = yield* projectAll(created, [accepted as OrchestrationEvent]);
      expect(
        projected.threads.find((thread) => thread.id === BRANCH_THREAD_ID)?.branchedFrom
          ?.inheritedContextState,
      ).toBe("accepted");
    }),
  );
});
