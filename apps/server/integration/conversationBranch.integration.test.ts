// @effect-diagnostics nodeBuiltinImport:off
import {
  CommandId,
  DEFAULT_MODEL,
  DEFAULT_MODEL_BY_PROVIDER,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  EventId,
  MessageId,
  OrchestrationMessageCompletion,
  ProjectId,
  ProviderDriverKind,
  ThreadId,
  defaultInstanceIdForDriver,
} from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { inheritedPrefixOf } from "../src/orchestration/branchInheritedContext.ts";
import {
  makeOrchestrationIntegrationHarness,
  type OrchestrationIntegrationHarness,
} from "./OrchestrationEngineHarness.integration.ts";
import type { TurnProcessingQuiescedReceipt } from "../src/orchestration/Services/RuntimeReceiptBus.ts";
import type {
  FixtureProviderRuntimeEvent,
  TestTurnResponse,
} from "./TestProviderAdapter.integration.ts";

const PROJECT_ID = ProjectId.make("branch-project");
const SOURCE_THREAD_ID = ThreadId.make("branch-source");
const BRANCH_THREAD_ID = ThreadId.make("branch-destination");
const CODEX_PROVIDER = ProviderDriverKind.make("codex");

const SOURCE_QUESTION = "The original question";
const SOURCE_ANSWER = "The answer you can branch from.";

function nowIso() {
  return "2026-05-01T00:00:00.000Z";
}

function runtimeBase(eventId: string) {
  return {
    eventId: EventId.make(eventId),
    provider: CODEX_PROVIDER,
    createdAt: nowIso(),
  };
}

function withHarness<A, E>(
  use: (harness: OrchestrationIntegrationHarness) => Effect.Effect<A, E>,
  options?: { readonly rootDir?: string },
) {
  return Effect.acquireUseRelease(
    makeOrchestrationIntegrationHarness({
      provider: CODEX_PROVIDER,
      ...(options?.rootDir !== undefined
        ? { rootDir: options.rootDir, initializeWorkspace: false }
        : {}),
    }),
    use,
    (harness) => harness.dispose,
  ).pipe(Effect.provide(NodeServices.layer));
}

const seedProject = (harness: OrchestrationIntegrationHarness) =>
  Effect.gen(function* () {
    const provider = harness.adapterHarness?.provider ?? CODEX_PROVIDER;
    yield* harness.engine.dispatch({
      type: "project.create",
      commandId: CommandId.make("cmd-branch-project"),
      projectId: PROJECT_ID,
      title: "Branch Project",
      workspaceRoot: harness.workspaceDir,
      defaultModelSelection: {
        instanceId: defaultInstanceIdForDriver(provider),
        model: DEFAULT_MODEL_BY_PROVIDER[provider] ?? DEFAULT_MODEL,
      },
      createdAt: nowIso(),
    });
    yield* harness.engine.dispatch({
      type: "thread.create",
      commandId: CommandId.make("cmd-branch-source"),
      threadId: SOURCE_THREAD_ID,
      projectId: PROJECT_ID,
      title: "Source thread",
      modelSelection: {
        instanceId: defaultInstanceIdForDriver(provider),
        model: DEFAULT_MODEL_BY_PROVIDER[provider] ?? DEFAULT_MODEL,
      },
      interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
      runtimeMode: "full-access",
      branch: null,
      worktreePath: null,
      createdAt: nowIso(),
    });
  });

/** A turn that streams `answer` and ends with a completed agent message. */
function turnResponse(input: {
  readonly idPrefix: string;
  readonly threadId: ThreadId;
  readonly answer: string;
  readonly status?: "completed" | "failed" | "interrupted";
  /**
   * Whether the provider closed the reply itself. A reply left open when the
   * turn ends is a partial one, whatever the turn's outcome.
   */
  readonly providerClosedReply?: boolean;
}): TestTurnResponse {
  return {
    events: [
      {
        type: "turn.started",
        ...runtimeBase(`${input.idPrefix}-started`),
        threadId: input.threadId,
        turnId: `${input.idPrefix}-turn`,
      },
      {
        type: "message.delta",
        ...runtimeBase(`${input.idPrefix}-delta`),
        threadId: input.threadId,
        turnId: `${input.idPrefix}-turn`,
        delta: input.answer,
      },
      ...(input.providerClosedReply === false
        ? []
        : [
            {
              type: "message.completed",
              ...runtimeBase(`${input.idPrefix}-message`),
              threadId: input.threadId,
              turnId: `${input.idPrefix}-turn`,
            },
          ]),
      {
        type: "turn.completed",
        ...runtimeBase(`${input.idPrefix}-completed`),
        threadId: input.threadId,
        turnId: `${input.idPrefix}-turn`,
        status: input.status ?? "completed",
      },
    ] satisfies ReadonlyArray<FixtureProviderRuntimeEvent>,
  };
}

const startTurn = (input: {
  readonly harness: OrchestrationIntegrationHarness;
  readonly threadId: ThreadId;
  readonly commandId: string;
  readonly messageId: string;
  readonly text: string;
}) =>
  input.harness.engine.dispatch({
    type: "thread.turn.start",
    commandId: CommandId.make(input.commandId),
    threadId: input.threadId,
    message: {
      messageId: MessageId.make(input.messageId),
      role: "user",
      text: input.text,
      attachments: [],
    },
    interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
    runtimeMode: "full-access",
    createdAt: nowIso(),
  });

const readThreadDetail = (harness: OrchestrationIntegrationHarness, threadId: ThreadId) =>
  harness.snapshotQuery
    .getThreadDetailById(threadId, { activityKinds: [] })
    .pipe(Effect.map(Option.getOrUndefined));

/**
 * The worker's own signal that a turn finished, rather than polling for a state
 * that happens to look right.
 */
const awaitTurnQuiesced = (
  harness: OrchestrationIntegrationHarness,
  threadId: ThreadId,
  turnCount: number,
) =>
  harness.waitForReceipt(
    (receipt): receipt is TurnProcessingQuiescedReceipt =>
      receipt.type === "turn.processing.quiesced" &&
      receipt.threadId === threadId &&
      receipt.checkpointTurnCount === turnCount,
  );

/** The event that records how a reply ended. */
const awaitReplyOutcome = (
  harness: OrchestrationIntegrationHarness,
  threadId: ThreadId,
  completion: OrchestrationMessageCompletion,
) =>
  harness.waitForDomainEvent(
    (event) =>
      event.type === "thread.message-sent" &&
      event.aggregateId === threadId &&
      "completion" in event.payload &&
      event.payload.completion === completion,
  );

const awaitBranchContextAccepted = (harness: OrchestrationIntegrationHarness) =>
  harness.waitForDomainEvent(
    (event) =>
      event.type === "thread.branch-inherited-context-accepted" &&
      event.aggregateId === BRANCH_THREAD_ID,
  );

/** Seeds a source thread whose first turn finished, then reports its reply id. */
const seedCompletedSourceReply = (harness: OrchestrationIntegrationHarness) =>
  Effect.gen(function* () {
    yield* seedProject(harness);
    yield* harness.adapterHarness!.queueTurnResponseForNextSession(
      turnResponse({
        idPrefix: "source",
        threadId: SOURCE_THREAD_ID,
        answer: SOURCE_ANSWER,
      }),
    );
    yield* startTurn({
      harness,
      threadId: SOURCE_THREAD_ID,
      commandId: "cmd-branch-source-turn",
      messageId: "msg-source-user",
      text: SOURCE_QUESTION,
    });
    yield* awaitReplyOutcome(harness, SOURCE_THREAD_ID, "completed");
    yield* awaitTurnQuiesced(harness, SOURCE_THREAD_ID, 1);
    const thread = yield* readThreadDetail(harness, SOURCE_THREAD_ID);
    const reply = thread?.messages.find(
      (message) => message.role === "assistant" && !message.streaming,
    );
    assert.isDefined(reply);
    // A completed turn ends its reply with an outcome, which is what makes it
    // branchable.
    assert.strictEqual(reply.completion, "completed");
    return reply.id;
  });

const createBranch = (input: {
  readonly harness: OrchestrationIntegrationHarness;
  readonly commandId: string;
  readonly sourceMessageId: MessageId;
}) =>
  input.harness.engine.dispatch({
    type: "thread.branch.create",
    commandId: CommandId.make(input.commandId),
    threadId: BRANCH_THREAD_ID,
    sourceThreadId: SOURCE_THREAD_ID,
    sourceMessageId: input.sourceMessageId,
    createdAt: nowIso(),
  });

it.live("branches from a completed reply and continues with the inherited text", () =>
  withHarness((harness) =>
    Effect.gen(function* () {
      const replyId = yield* seedCompletedSourceReply(harness);
      const sourceBefore = yield* readThreadDetail(harness, SOURCE_THREAD_ID);

      yield* createBranch({ harness, commandId: "cmd-branch-create", sourceMessageId: replyId });

      const branch = yield* readThreadDetail(harness, BRANCH_THREAD_ID);
      assert.isDefined(branch);
      assert.strictEqual(branch.branchedFrom?.sourceThreadId, SOURCE_THREAD_ID);
      assert.strictEqual(branch.branchedFrom?.inheritedContextState, "pending");
      assert.strictEqual(branch.projectId, PROJECT_ID);
      assert.deepStrictEqual(branch.modelSelection, sourceBefore?.modelSelection);
      assert.strictEqual(branch.worktreePath, sourceBefore?.worktreePath);
      // Copied prefix only, and no inherited work.
      assert.deepStrictEqual(
        branch.messages.map((message) => [message.role, message.text]),
        [
          ["user", SOURCE_QUESTION],
          ["assistant", SOURCE_ANSWER],
        ],
      );
      assert.strictEqual(branch.checkpoints.length, 0);
      assert.strictEqual(branch.session, null);
      assert.strictEqual(branch.latestTurn, null);
      // Copied history is not queued work.
      const branchShell = yield* harness.snapshotQuery
        .getShellSnapshot()
        .pipe(
          Effect.map(
            (shell) => shell.threads.find((thread) => thread.id === BRANCH_THREAD_ID) ?? null,
          ),
        );
      assert.isNotNull(branchShell);
      assert.isNull(branchShell.latestUserMessageAt);

      // The source is untouched.
      const sourceAfter = yield* readThreadDetail(harness, SOURCE_THREAD_ID);
      assert.deepStrictEqual(
        sourceAfter?.messages.map((message) => [message.role, message.text]),
        sourceBefore?.messages.map((message) => [message.role, message.text]),
      );
      assert.isNull(sourceAfter?.branchedFrom ?? null);

      // The first new prompt carries the copied conversation, in role order,
      // as hidden context ahead of what the user typed.
      yield* harness.adapterHarness!.queueTurnResponseForNextSession(
        turnResponse({
          idPrefix: "branch-1",
          threadId: BRANCH_THREAD_ID,
          answer: "Exploring the other approach.",
        }),
      );
      yield* startTurn({
        harness,
        threadId: BRANCH_THREAD_ID,
        commandId: "cmd-branch-turn-1",
        messageId: "msg-branch-user-1",
        text: "Try the other approach",
      });
      yield* awaitBranchContextAccepted(harness);
      yield* awaitTurnQuiesced(harness, BRANCH_THREAD_ID, 1);

      const firstPrompt = harness.adapterHarness!.getSentTurns(BRANCH_THREAD_ID);
      assert.strictEqual(firstPrompt.length, 1);
      assert.strictEqual(
        firstPrompt[0],
        `${inheritedPrefixOf(
          [
            { role: "user", text: SOURCE_QUESTION },
            { role: "assistant", text: SOURCE_ANSWER },
          ],
          2,
        )}\n\nTry the other approach`,
      );

      // A later turn must not repeat the inherited context.
      yield* harness.adapterHarness!.queueTurnResponse(
        BRANCH_THREAD_ID,
        turnResponse({
          idPrefix: "branch-2",
          threadId: BRANCH_THREAD_ID,
          answer: "One more thing, handled.",
        }),
      );
      yield* startTurn({
        harness,
        threadId: BRANCH_THREAD_ID,
        commandId: "cmd-branch-turn-2",
        messageId: "msg-branch-user-2",
        text: "One more thing",
      });
      yield* awaitTurnQuiesced(harness, BRANCH_THREAD_ID, 2);
      const allPrompts = harness.adapterHarness!.getSentTurns(BRANCH_THREAD_ID);
      assert.strictEqual(allPrompts.length, 2);
      assert.strictEqual(allPrompts[1], "One more thing");
    }),
  ),
);

it.live("re-supplies the inherited context after a failed first turn", () =>
  withHarness((harness) =>
    Effect.gen(function* () {
      const replyId = yield* seedCompletedSourceReply(harness);
      yield* createBranch({
        harness,
        commandId: "cmd-branch-retry-create",
        sourceMessageId: replyId,
      });

      // No queued provider response: the send fails and the branch never
      // reaches the provider, so it still owes its context.
      yield* startTurn({
        harness,
        threadId: BRANCH_THREAD_ID,
        commandId: "cmd-branch-retry-turn-1",
        messageId: "msg-branch-retry-user-1",
        text: "Try the other approach",
      });
      const afterFailure = yield* harness.waitForDomainEvent(
        (event) =>
          event.type === "thread.session-set" &&
          event.aggregateId === BRANCH_THREAD_ID &&
          event.payload.session.status === "error",
      );
      assert.isDefined(afterFailure);
      assert.strictEqual(harness.adapterHarness!.getSentTurns(BRANCH_THREAD_ID).length, 0);

      // The errored session is reused, so the retry queues against the thread.
      yield* harness.adapterHarness!.queueTurnResponse(
        BRANCH_THREAD_ID,
        turnResponse({
          idPrefix: "branch-retry",
          threadId: BRANCH_THREAD_ID,
          answer: "Exploring the other approach.",
        }),
      );
      yield* startTurn({
        harness,
        threadId: BRANCH_THREAD_ID,
        commandId: "cmd-branch-retry-turn-2",
        messageId: "msg-branch-retry-user-2",
        text: "Try the other approach",
      });
      yield* awaitBranchContextAccepted(harness);
      yield* awaitTurnQuiesced(harness, BRANCH_THREAD_ID, 1);

      const prompts = harness.adapterHarness!.getSentTurns(BRANCH_THREAD_ID);
      assert.strictEqual(prompts.length, 1);
      assert.include(prompts[0]!, SOURCE_QUESTION);
      assert.include(prompts[0]!, SOURCE_ANSWER);
      assert.include(prompts[0]!, "Try the other approach");
    }),
  ),
);

it.live("treats a repeated branch request as the same branch", () =>
  withHarness((harness) =>
    Effect.gen(function* () {
      const replyId = yield* seedCompletedSourceReply(harness);
      const command = {
        type: "thread.branch.create" as const,
        commandId: CommandId.make("cmd-branch-create-retry"),
        threadId: BRANCH_THREAD_ID,
        sourceThreadId: SOURCE_THREAD_ID,
        sourceMessageId: replyId,
        createdAt: nowIso(),
      };

      const first = yield* harness.engine.dispatch(command);
      const retried = yield* harness.engine.dispatch(command);

      // The durable receipt answers the retry instead of planning a second branch.
      assert.strictEqual(retried.sequence, first.sequence);
      const snapshot = yield* harness.snapshotQuery.getSnapshot();
      assert.strictEqual(
        snapshot.threads.filter((thread) => thread.id === BRANCH_THREAD_ID).length,
        1,
      );
      assert.strictEqual(
        snapshot.threads.find((thread) => thread.id === BRANCH_THREAD_ID)?.branchedFrom
          ?.inheritedMessageCount,
        2,
      );
    }),
  ),
);

it.live("refuses to branch a reply left partial by an interrupted turn", () =>
  withHarness((harness) =>
    Effect.gen(function* () {
      yield* seedProject(harness);
      yield* harness.adapterHarness!.queueTurnResponseForNextSession(
        turnResponse({
          idPrefix: "aborted",
          threadId: SOURCE_THREAD_ID,
          answer: "Half an answer before the interruption.",
          status: "interrupted",
          providerClosedReply: false,
        }),
      );
      yield* startTurn({
        harness,
        threadId: SOURCE_THREAD_ID,
        commandId: "cmd-source-interrupted-turn",
        messageId: "msg-source-user-interrupted",
        text: SOURCE_QUESTION,
      });
      yield* awaitReplyOutcome(harness, SOURCE_THREAD_ID, "interrupted");
      yield* awaitTurnQuiesced(harness, SOURCE_THREAD_ID, 1);
      const source = yield* readThreadDetail(harness, SOURCE_THREAD_ID);
      const partial = source?.messages.find(
        (message) => message.role === "assistant" && !message.streaming,
      );
      assert.isDefined(partial);
      assert.strictEqual(partial.completion, "interrupted");

      const threadsBefore = yield* harness.snapshotQuery
        .getSnapshot()
        .pipe(Effect.map((snapshot) => snapshot.threads.length));
      const error = yield* Effect.flip(
        createBranch({
          harness,
          commandId: "cmd-branch-partial",
          sourceMessageId: partial.id,
        }),
      );
      assert.include(error.message, "is not a completed agent reply");
      const threadsAfter = yield* harness.snapshotQuery
        .getSnapshot()
        .pipe(Effect.map((snapshot) => snapshot.threads.length));
      assert.strictEqual(threadsAfter, threadsBefore);
    }),
  ),
);

for (const status of ["failed", "interrupted"] as const) {
  it.live(`refuses a reply the provider closed before its ${status} turn ended`, () =>
    withHarness((harness) =>
      Effect.gen(function* () {
        yield* seedProject(harness);
        // The provider closes the text block itself and only then reports the
        // turn as ended badly, so the reply looks finished until the terminal
        // event corrects it.
        yield* harness.adapterHarness!.queueTurnResponseForNextSession(
          turnResponse({
            idPrefix: `closed-then-${status}`,
            threadId: SOURCE_THREAD_ID,
            answer: "Half an answer before everything went wrong.",
            status,
          }),
        );
        yield* startTurn({
          harness,
          threadId: SOURCE_THREAD_ID,
          commandId: `cmd-source-closed-then-${status}`,
          messageId: `msg-source-user-closed-${status}`,
          text: SOURCE_QUESTION,
        });
        yield* awaitReplyOutcome(harness, SOURCE_THREAD_ID, status);
        yield* awaitTurnQuiesced(harness, SOURCE_THREAD_ID, 1);
        const source = yield* readThreadDetail(harness, SOURCE_THREAD_ID);
        const reply = source?.messages.find(
          (message) => message.role === "assistant" && !message.streaming,
        );
        assert.isDefined(reply);
        assert.strictEqual(reply.completion, status);

        const error = yield* Effect.flip(
          createBranch({
            harness,
            commandId: `cmd-branch-closed-then-${status}`,
            sourceMessageId: reply.id,
          }),
        );
        assert.include(error.message, "is not a completed agent reply");
      }),
    ),
  );
}

it.live("refuses a reply whose turn has not ended yet", () =>
  withHarness((harness) =>
    Effect.gen(function* () {
      yield* seedProject(harness);
      // The provider closes the reply and the turn simply keeps running: tools,
      // a long think, anything. Closing text is not the same as finishing.
      yield* harness.adapterHarness!.queueTurnResponseForNextSession({
        leaveTurnOpen: true,
        events: [
          {
            type: "turn.started",
            ...runtimeBase("still-running-started"),
            threadId: SOURCE_THREAD_ID,
            turnId: "still-running-turn",
          },
          {
            type: "message.delta",
            ...runtimeBase("still-running-delta"),
            threadId: SOURCE_THREAD_ID,
            turnId: "still-running-turn",
            delta: "Working on it, not finished yet.",
          },
          {
            type: "message.completed",
            ...runtimeBase("still-running-message"),
            threadId: SOURCE_THREAD_ID,
            turnId: "still-running-turn",
          },
        ] satisfies ReadonlyArray<FixtureProviderRuntimeEvent>,
      });
      yield* startTurn({
        harness,
        threadId: SOURCE_THREAD_ID,
        commandId: "cmd-source-still-running",
        messageId: "msg-source-user-still-running",
        text: SOURCE_QUESTION,
      });
      // The provider closed the reply but left the turn running, so the last event
      // in the stream is the close. Confirming that event and then draining means
      // the ingestion has consumed the whole stream: nothing further can arrive
      // for this turn, so the state below is settled rather than mid-flight. No
      // timeout is needed, and none is used - a turn that never ends can never
      // produce an outcome, so waiting for one would only prove the clock ran out.
      yield* harness.waitForDomainEvent(
        (event) =>
          event.type === "thread.message-sent" &&
          event.aggregateId === SOURCE_THREAD_ID &&
          event.payload.role === "assistant" &&
          event.payload.streaming === false,
      );
      yield* harness.drainProviderRuntime;

      const source = yield* readThreadDetail(harness, SOURCE_THREAD_ID);
      const runningReply = source?.messages.find(
        (message) => message.role === "assistant" && !message.streaming,
      );
      assert.isDefined(runningReply);
      assert.isUndefined(
        runningReply.completion,
        "a reply must not be marked finished while its turn is still running",
      );
      assert.strictEqual(source?.session?.status, "running");

      const error = yield* Effect.flip(
        createBranch({
          harness,
          commandId: "cmd-branch-still-running",
          sourceMessageId: runningReply.id,
        }),
      );
      assert.include(error.message, "is not a completed agent reply");
    }),
  ),
);

it.live("keeps a finished reply branchable after a delayed stop for its turn", () =>
  withHarness((harness) =>
    Effect.gen(function* () {
      yield* seedProject(harness);
      yield* harness.adapterHarness!.queueTurnResponseForNextSession(
        turnResponse({
          idPrefix: "good",
          threadId: SOURCE_THREAD_ID,
          answer: SOURCE_ANSWER,
        }),
      );
      yield* startTurn({
        harness,
        threadId: SOURCE_THREAD_ID,
        commandId: "cmd-source-good-turn",
        messageId: "msg-source-user-good",
        text: SOURCE_QUESTION,
      });
      yield* awaitReplyOutcome(harness, SOURCE_THREAD_ID, "completed");
      yield* awaitTurnQuiesced(harness, SOURCE_THREAD_ID, 1);
      const good = yield* readThreadDetail(harness, SOURCE_THREAD_ID);
      const goodReply = good?.messages.find(
        (message) => message.role === "assistant" && !message.streaming,
      );
      assert.isDefined(goodReply);
      assert.strictEqual(goodReply.completion, "completed");

      // A stop for the turn that already succeeded arrives during the next one.
      // The lifecycle guard rejects it for session state, and the reply's outcome
      // has to survive that rejection too. The adapter numbers a thread's turns,
      // so the finished one is `turn-1` and the late stop names it.
      yield* harness.adapterHarness!.queueTurnResponse(SOURCE_THREAD_ID, {
        events: [
          {
            type: "turn.started",
            ...runtimeBase("late-stop-started"),
            threadId: SOURCE_THREAD_ID,
            turnId: "turn-2",
          },
          {
            type: "turn.aborted",
            ...runtimeBase("late-stop"),
            threadId: SOURCE_THREAD_ID,
            providerTurnId: "turn-1",
            reason: "the provider stopped a turn that had already finished",
          },
          {
            type: "message.delta",
            ...runtimeBase("late-stop-delta"),
            threadId: SOURCE_THREAD_ID,
            turnId: "turn-2",
            delta: "Still working on the follow-up.",
          },
          {
            type: "message.completed",
            ...runtimeBase("late-stop-message"),
            threadId: SOURCE_THREAD_ID,
            turnId: "turn-2",
          },
        ] satisfies ReadonlyArray<FixtureProviderRuntimeEvent>,
      });
      yield* startTurn({
        harness,
        threadId: SOURCE_THREAD_ID,
        commandId: "cmd-source-late-stop-turn",
        messageId: "msg-source-user-late-stop",
        text: "A follow-up question",
      });
      // A rejected stop produces no event of its own, so it cannot be waited on
      // directly. The follow-up turn's own closed reply is emitted after the stop
      // and the ingestion consumes events in order, so seeing that reply closed
      // proves the stop was handled rather than merely queued. The follow-up turn
      // is left open so the only terminal event in this stream is the late stop.
      yield* harness.waitForDomainEvent(
        (event) =>
          event.type === "thread.message-sent" &&
          event.aggregateId === SOURCE_THREAD_ID &&
          event.payload.role === "assistant" &&
          event.payload.streaming === false,
      );
      yield* harness.drainProviderRuntime;

      const after = yield* readThreadDetail(harness, SOURCE_THREAD_ID);
      const stillGood = after?.messages.find((message) => message.id === goodReply.id);
      assert.strictEqual(stillGood?.completion, "completed");

      // Still branchable.
      yield* createBranch({
        harness,
        commandId: "cmd-branch-after-late-stop",
        sourceMessageId: goodReply.id,
      });
      const branch = yield* readThreadDetail(harness, BRANCH_THREAD_ID);
      assert.strictEqual(branch?.branchedFrom?.sourceMessageId, goodReply.id);
    }),
  ),
);
it.live("keeps a branch and its pending context across a restart", () =>
  Effect.gen(function* () {
    const rootDir = yield* Effect.acquireUseRelease(
      makeOrchestrationIntegrationHarness({ provider: CODEX_PROVIDER }),
      (harness) =>
        Effect.gen(function* () {
          const replyId = yield* seedCompletedSourceReply(harness);
          yield* createBranch({
            harness,
            commandId: "cmd-branch-restart-create",
            sourceMessageId: replyId,
          });
          return harness.rootDir;
        }),
      (harness) => harness.dispose,
    ).pipe(Effect.provide(NodeServices.layer));

    yield* withHarness(
      (harness) =>
        Effect.gen(function* () {
          // Nothing was sent before the restart, so the branch still owes its
          // provider the copied conversation.
          const branch = yield* readThreadDetail(harness, BRANCH_THREAD_ID);
          assert.isDefined(branch);
          assert.strictEqual(branch.branchedFrom?.inheritedContextState, "pending");
          assert.strictEqual(branch.branchedFrom?.inheritedMessageCount, 2);

          yield* harness.adapterHarness!.queueTurnResponseForNextSession(
            turnResponse({
              idPrefix: "branch-restart",
              threadId: BRANCH_THREAD_ID,
              answer: "Continuing after the restart.",
            }),
          );
          yield* startTurn({
            harness,
            threadId: BRANCH_THREAD_ID,
            commandId: "cmd-branch-restart-turn",
            messageId: "msg-branch-restart-user",
            text: "Continuing after the restart",
          });
          yield* awaitBranchContextAccepted(harness);
          yield* awaitTurnQuiesced(harness, BRANCH_THREAD_ID, 1);
          const prompt = harness.adapterHarness!.getSentTurns(BRANCH_THREAD_ID);
          assert.strictEqual(prompt.length, 1);
          assert.include(prompt[0]!, SOURCE_QUESTION);
          assert.include(prompt[0]!, SOURCE_ANSWER);
          assert.include(prompt[0]!, "Continuing after the restart");
        }),
      { rootDir },
    );
  }),
);
