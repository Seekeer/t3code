import { TurnId } from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";

import { runMigrations } from "../Migrations.ts";
import migrateProjectionThreadBranches from "./055_ProjectionThreadBranches.ts";

const NOW = "2026-01-01T00:00:00.000Z";

/**
 * A thread that already existed before outcomes were recorded: one reply from a
 * completed turn, one left behind by an interrupted turn, and a user message.
 */
function seedExistingThread(sql: SqlClient.SqlClient, threadId: string) {
  return Effect.gen(function* () {
    yield* sql`
      INSERT INTO projection_threads (
        thread_id, project_id, title, model_selection_json, runtime_mode,
        created_at, updated_at
      ) VALUES (
        ${threadId}, 'project-1', 'Existing thread',
        '{"instanceId":"codex","model":"gpt-5.4"}', 'full-access', ${NOW}, ${NOW}
      )
    `;
    yield* sql`
      INSERT INTO projection_thread_messages (
        message_id, thread_id, role, text, is_streaming, created_at, updated_at
      ) VALUES
        (${`${threadId}:done`}, ${threadId}, 'assistant', 'Finished reply', 0, ${NOW}, ${NOW}),
        (${`${threadId}:partial`}, ${threadId}, 'assistant', 'Half a reply', 0, ${NOW}, ${NOW}),
        (${`${threadId}:user`}, ${threadId}, 'user', 'A question', 0, ${NOW}, ${NOW})
    `;
    yield* sql`
      INSERT INTO projection_turns (
        thread_id, turn_id, state, requested_at, started_at, completed_at,
        assistant_message_id, checkpoint_files_json
      ) VALUES
        (${threadId}, ${TurnId.make(`${threadId}:turn-done`)}, 'completed', ${NOW}, ${NOW}, ${NOW}, ${`${threadId}:done`}, '[]'),
        (${threadId}, ${TurnId.make(`${threadId}:turn-cut`)}, 'interrupted', ${NOW}, ${NOW}, ${NOW}, ${`${threadId}:partial`}, '[]')
    `;
  });
}

function readCompletions(sql: SqlClient.SqlClient, threadId: string) {
  return sql<{ readonly messageId: string; readonly completion: string | null }>`
    SELECT message_id AS "messageId", completion
    FROM projection_thread_messages
    WHERE thread_id = ${threadId}
    ORDER BY message_id ASC
  `;
}

it.layer(NodeSqliteClient.layer({ filename: ":memory:" }))("055_ProjectionThreadBranches", (it) => {
  it.effect("marks only the replies of turns that completed", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 54 });
      yield* seedExistingThread(sql, "thread-1");

      yield* runMigrations({ toMigrationInclusive: 55 });

      // A completed turn is evidence that the reply it recorded finished. The
      // interrupted turn's reply stays unmarked and therefore unbranchable,
      // and the user message is untouched.
      const migrated = yield* readCompletions(sql, "thread-1");
      assert.deepEqual(migrated, [
        { messageId: "thread-1:done", completion: "completed" },
        { messageId: "thread-1:partial", completion: null },
        { messageId: "thread-1:user", completion: null },
      ]);
    }),
  );

  it.effect("leaves recorded outcomes alone when re-run", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 54 });
      yield* seedExistingThread(sql, "thread-2");
      yield* runMigrations({ toMigrationInclusive: 55 });

      yield* sql`
          UPDATE projection_thread_messages
          SET completion = 'interrupted'
          WHERE message_id = 'thread-2:done'
        `;
      yield* migrateProjectionThreadBranches;

      const rerun = yield* readCompletions(sql, "thread-2");
      assert.deepEqual(rerun, [
        { messageId: "thread-2:done", completion: "interrupted" },
        { messageId: "thread-2:partial", completion: null },
        { messageId: "thread-2:user", completion: null },
      ]);
    }),
  );
});
