import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

const persisted = vi.hoisted(() => ({ note: undefined as string | undefined, saves: 0 }));
vi.mock(import("~/state/entities"), async (importOriginal) => ({
  ...(await importOriginal()),
  useQuietThreadProjection: (() => ({
    projection: { thread: persisted.note === undefined ? {} : { note: persisted.note } },
  })) as never,
}));
vi.mock(import("~/state/use-orchestration-command"), async (importOriginal) => ({
  ...(await importOriginal()),
  useOrchestrationCommand: (() =>
    async ({ input }: { input: { note: string | null } }) => {
      persisted.saves += 1;
      persisted.note = input.note ?? undefined;
      return { _tag: "Success" };
    }) as never,
}));

import { render } from "../../../test/render";
import { ThreadNoteButton } from "./ThreadNoteButton";

function noteButton() {
  return (
    <>
      <ThreadNoteButton
        threadRef={{
          environmentId: EnvironmentId.make("environment"),
          threadId: ThreadId.make("thread"),
        }}
        canEdit
      />
      <div tabIndex={0}>Outside note</div>
    </>
  );
}

it("keeps a note saved on click-away and drops an edit cancelled with Escape", async () => {
  persisted.note = undefined;
  persisted.saves = 0;
  await using screen = await render(noteButton());

  await screen.getByRole("button", { name: "Thread note" }).click();
  await screen.getByRole("textbox", { name: "Thread note" }).fill("Check the login redirect");
  await screen.getByText("Outside note").click();
  await expect.element(screen.getByRole("textbox", { name: "Thread note" })).not.toBeInTheDocument();
  expect(persisted.note).toBe("Check the login redirect");

  await screen.rerender(noteButton());
  await screen.getByRole("button", { name: "Thread note (has note)" }).click();
  const textarea = screen.getByRole("textbox", { name: "Thread note" });
  await expect.element(textarea).toHaveValue("Check the login redirect");

  await textarea.fill("Discard me");
  await userEvent.keyboard("{Escape}");
  await expect.element(textarea).not.toBeInTheDocument();
  expect(persisted.note).toBe("Check the login redirect");
  expect(persisted.saves).toBe(1);

  await screen.getByRole("button", { name: "Thread note (has note)" }).click();
  await expect
    .element(screen.getByRole("textbox", { name: "Thread note" }))
    .toHaveValue("Check the login redirect");
});
