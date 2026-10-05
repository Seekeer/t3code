import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const threadColumns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(projection_threads)
  `;
  if (!threadColumns.some((column) => column.name === "branched_from_json")) {
    yield* sql`
      ALTER TABLE projection_threads
      ADD COLUMN branched_from_json TEXT
    `;
  }

  const messageColumns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(projection_thread_messages)
  `;
  if (messageColumns.some((column) => column.name === "completion")) {
    return;
  }
  yield* sql`
    ALTER TABLE projection_thread_messages
    ADD COLUMN completion TEXT
  `;
  // Replies written before outcomes existed carry none. A turn that reached its
  // completed state is evidence enough for the reply it recorded, and that is
  // the same reply a client offers branching from. Anything else - commentary
  // mid-turn, an interrupted turn - stays unmarked and therefore unbranchable.
  yield* sql`
    UPDATE projection_thread_messages
    SET completion = 'completed'
    WHERE role = 'assistant'
      AND is_streaming = 0
      AND completion IS NULL
      AND message_id IN (
        SELECT assistant_message_id
        FROM projection_turns
        WHERE state = 'completed'
          AND assistant_message_id IS NOT NULL
      )
  `;
});
