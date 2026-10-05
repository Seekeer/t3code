# Conversation branches

Branch from a finished agent reply to try a different approach without disturbing the conversation it came from. On web and desktop, use the branch action next to a completed reply; on mobile, tap it in the message's action row. Only replies that finished successfully offer it — a reply left half-written by an interrupted or failed turn does not.

The branch is a new thread in the same project. It opens with every message up to and including that reply, keeps the same agent and model, and waits for your first prompt. Later messages in the source are not carried over, and the source keeps running as usual. You can branch from a branch.

## Files stay where they are

A branch continues against the current state of the workspace, not the files as they were when the selected reply arrived. Nothing is restored and no Git branch or worktree is created. Turns you run in the branch create their own history and checkpoints; the copied messages keep no checkpoints of their own.

## The agent reads the branch as text

Where your agent cannot hand over its own conversation, T3 Code sends the copied messages to it as text alongside your first prompt. The branch says so at the top of the conversation for as long as it exists. Two things are not part of that text: attachments and tool activity. A branch from a conversation that used attachments is refused rather than created without them.

The copied conversation has to fit within your agent's input budget. If it does not, branching is refused up front instead of quietly dropping earlier messages.

## Getting back to the source

The branch links to the thread it came from, and **View source** in its notice opens that thread. If you delete the source, the branch keeps its conversation and the link stops opening.
