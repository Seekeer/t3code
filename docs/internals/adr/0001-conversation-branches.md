---
status: accepted
---

# Conversation branches inherit history, not file state

[Issue #3](https://github.com/Seekeer/t3code/issues/3) calls for exploring an alternate solution from an agent reply without changing the source thread. A conversation branch is a new thread in the same project. It copies user and agent messages through one completed agent reply, owns copies of their attachments, and links to its source in both directions. It does not copy activities, turn diffs, or checkpoint controls. The branch survives deletion of its source; its source link then becomes unavailable.

Any branch can be the source of another branch. Creation is an action on a completed agent reply in the web, desktop, and mobile clients.

The branch keeps the source provider and model and uses the current shared workspace, even when the selected reply is old. It does not restore files from that reply. This keeps branching independent of Git branches and avoids changing the source workspace, at the cost of conversation history and file state sometimes describing different moments. The creation flow does not add a separate warning about that shared file state.

Where a provider can fork its conversation, the branch uses that native fork. Otherwise, it sends the copied text as hidden context with the first new user prompt and shows a limited-context notice. Attachments and tool activity are not part of that text context. The branch is rejected before creation if the text context is too large. If a later source turn is running and a native fork is unsafe, the branch uses the text fallback immediately; a failed native fork instead reports an error rather than silently degrading. The source can continue, and the new branch opens idle for its next prompt.
