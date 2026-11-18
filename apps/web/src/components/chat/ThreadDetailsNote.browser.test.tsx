import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

const persisted = vi.hoisted(() => ({
  saves: [] as Array<{ threadId: string; note: string | null }>,
}));
vi.mock(import("~/state/entities"), async (importOriginal) => ({
  ...(await importOriginal()),
  useQuietThreadProjection: (() => ({ projection: { thread: { note: "First line" } } })) as never,
}));
vi.mock(import("~/state/use-orchestration-command"), async (importOriginal) => ({
  ...(await importOriginal()),
  useOrchestrationCommand: (() =>
    async ({ input }: { input: { threadId: string; note: string | null } }) => {
      persisted.saves.push(input);
      return { _tag: "Success" };
    }) as never,
}));
vi.mock(import("~/state/session"), async (importOriginal) => ({
  ...(await importOriginal()),
  useEnvironmentScope: (() => true) as never,
}));

import { AppAtomRegistryProvider } from "~/rpc/atomRegistry";
import { render } from "../../../test/render";
import { ThreadDetailsNote } from "./ThreadDetailsNote";

const environmentId = EnvironmentId.make("environment");

function panel(
  threadId: string,
  focusRequest = 0,
  onEditEnd = () => {},
  onSendNote?: (note: string) => Promise<boolean>,
) {
  return (
    <AppAtomRegistryProvider>
      <ThreadDetailsNote
        onEditEnd={onEditEnd}
        focusRequest={focusRequest}
        {...(onSendNote ? { onSendNote } : {})}
        key={threadId}
        threadRef={{ environmentId, threadId: ThreadId.make(threadId) }}
      />
    </AppAtomRegistryProvider>
  );
}

it("keeps Escape inside the panel and saves an open edit when the thread changes", async () => {
  persisted.saves = [];
  const escapesReachingDocument = vi.fn();
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") escapesReachingDocument();
  });
  await using screen = await render(panel("thread-a"));
  const textarea = page.getByRole("textbox", { name: "Thread note" });

  await screen.getByRole("button", { name: /Edit thread note/ }).click();
  await textarea.fill("Discard me");
  await userEvent.keyboard("{Escape}");
  await expect.element(textarea).not.toBeInTheDocument();
  expect(escapesReachingDocument).not.toHaveBeenCalled();
  expect(persisted.saves).toEqual([]);

  // Switching threads unmounts the editor without a blur; the edit still lands on its own thread.
  await screen.getByRole("button", { name: /Edit thread note/ }).click();
  await textarea.fill("Belongs to A");
  await screen.rerender(panel("thread-b"));
  await expect.element(textarea).not.toBeInTheDocument();
  expect(persisted.saves).toEqual([{ threadId: "thread-a", note: "Belongs to A" }]);
});

it("sends the note as the prompt on Ctrl+Enter and clears the saved note", async () => {
  persisted.saves = [];
  const sendNote = vi.fn(async () => true);
  await using screen = await render(panel("thread-a", 1, () => {}, sendNote));
  const textarea = screen.getByRole("textbox", { name: "Thread note" });
  await expect.element(textarea).toHaveFocus();
  await textarea.fill("Sent with keyboard");
  await userEvent.keyboard("{Control>}{Enter}{/Control}");
  await expect.element(textarea).not.toBeInTheDocument();
  expect(sendNote).toHaveBeenCalledWith("Sent with keyboard");
  // Saving the text and then clearing it leaves the thread with no note to send twice.
  expect(persisted.saves).toEqual([
    { threadId: "thread-a", note: "Sent with keyboard" },
    { threadId: "thread-a", note: null },
  ]);
});

it("keeps the note when the send never happened", async () => {
  persisted.saves = [];
  const sendNote = vi.fn(async () => false);
  await using screen = await render(panel("thread-a", 0, () => {}, sendNote));
  await screen.getByRole("button", { name: "Send note as prompt" }).click();
  await expect.poll(() => sendNote.mock.calls.length).toBe(1);
  expect(persisted.saves).toEqual([]);
});

it("offers a send control that is disabled while sending is blocked", async () => {
  persisted.saves = [];
  const sendNote = vi.fn(async () => true);
  await using screen = await render(
    <AppAtomRegistryProvider>
      <ThreadDetailsNote
        onSendNote={sendNote}
        sendDisabledReason="Messages loading"
        threadRef={{ environmentId, threadId: ThreadId.make("thread-a") }}
      />
    </AppAtomRegistryProvider>,
  );
  const send = screen.getByRole("button", { name: "Messages loading" });
  expect(send).toBeDisabled();
});

it("ends the temporary note reveal when the editor unmounts without blur", async () => {
  persisted.saves = [];
  const endEdit = vi.fn();
  await using screen = await render(panel("thread-a", 1, endEdit));
  const textarea = screen.getByRole("textbox", { name: "Thread note" });
  await expect.element(textarea).toHaveFocus();
  await textarea.fill("Saved on panel close");
  await screen.rerender(<div />);
  expect(endEdit).toHaveBeenCalledOnce();
  expect(persisted.saves).toEqual([{ threadId: "thread-a", note: "Saved on panel close" }]);
});
