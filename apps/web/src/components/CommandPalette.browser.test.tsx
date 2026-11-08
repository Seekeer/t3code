import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { render } from "../../test/render";
import { openCommandPalette, openTagThreadPalette } from "../commandPaletteBus";
import { useCommandPaletteStore } from "../commandPaletteStore";
import { makeThreadFixture } from "../test-fixtures";
import type { Project, Thread } from "../types";
import { CommandPalette } from "./CommandPalette";

const entities = vi.hoisted(() => ({
  projects: [] as ReadonlyArray<Project>,
  threads: [] as ReadonlyArray<Thread>,
  threadTags: [] as ReadonlyArray<string>,
  setThreadTag: (_value: unknown): void => undefined,
}));
vi.mock("../state/entities", async (original) => ({
  ...(await original<typeof import("../state/entities")>()),
  useProjects: () => entities.projects,
  useVisibleThreadShells: () => entities.threads,
  useQuietThreadShell: (ref: unknown) =>
    ref === null ? null : { source: { tags: entities.threadTags } },
  useAllThreadTags: () => entities.threadTags.map((tag) => ({ tag, count: 1 })),
}));
vi.mock("../state/session", async (original) => ({
  ...(await original<typeof import("../state/session")>()),
  useEnvironmentScope: () => true,
}));
vi.mock("../state/use-orchestration-command", () => ({
  useOrchestrationCommand: () => async (value: unknown) => {
    entities.setThreadTag(value);
    return { _tag: "Success", value: undefined };
  },
}));

function setup(state: { projects?: ReadonlyArray<Project>; threads?: ReadonlyArray<Thread> } = {}) {
  useCommandPaletteStore.setState(useCommandPaletteStore.getInitialState(), true);
  entities.projects = state.projects ?? [];
  entities.threads = state.threads ?? [];
  entities.threadTags = [];
  entities.setThreadTag = () => undefined;
}

describe("CommandPalette open intents", () => {
  it("opens New thread in... with focus in the search input, not the Back button", async () => {
    setup();
    await using _screen = await render(<CommandPalette>{null}</CommandPalette>);

    openCommandPalette({ open: "new-thread-in" });

    await expect.element(page.getByPlaceholder("Search...")).toHaveFocus();
  });

  it("opens a search intent with its query in the focused input", async () => {
    setup();
    await using _screen = await render(<CommandPalette>{null}</CommandPalette>);

    openCommandPalette({ query: "acme" });

    const input = page.getByPlaceholder("Search commands, projects, and threads...");
    await expect.element(input).toHaveFocus();
    await expect.element(input).toHaveValue("acme");
  });

  it("opens a searched project's latest listed thread, not a newer subagent", async () => {
    const environmentId = EnvironmentId.make("local");
    const projectId = ProjectId.make("acme");
    const parentId = ThreadId.make("parent");
    setup({
      projects: [
        {
          id: projectId,
          environmentId,
          title: "Acme",
          workspaceRoot: "/work/acme",
          repositoryIdentity: null,
          defaultModelSelection: null,
          createdAt: "2026-03-01T00:00:00.000Z",
          updatedAt: "2026-03-01T00:00:00.000Z",
          scripts: [],
        },
      ],
      threads: [
        makeThreadFixture({
          id: parentId,
          environmentId,
          projectId,
          latestUserMessageAt: "2026-03-02T00:00:00.000Z",
        }),
        makeThreadFixture({
          id: ThreadId.make("subagent"),
          environmentId,
          projectId,
          updatedAt: "2026-03-03T00:00:00.000Z",
          lineage: {
            rootThreadId: parentId,
            parentThreadId: parentId,
            relationshipToParent: "subagent",
          },
        }),
      ],
    });
    await using screen = await render(<CommandPalette>{null}</CommandPalette>);

    openCommandPalette({ query: "Acme" });
    await page.getByRole("option", { name: /Acme/ }).first().click();

    await vi.waitFor(() => expect(screen.router?.state.location.pathname).toBe("/local/parent"));
  });
});

describe("Tag thread", () => {
  it("creates a typed tag on Enter, then removes it when picked again", async () => {
    setup();
    const environmentId = EnvironmentId.make("local");
    const threadId = ThreadId.make("thread-1");
    const setThreadTag = vi.fn((value: { input: { tag: string; tagged: boolean } }) => {
      entities.threadTags = value.input.tagged ? [value.input.tag] : [];
    });
    entities.setThreadTag = setThreadTag as (value: unknown) => void;
    await using _screen = await render(<CommandPalette>{null}</CommandPalette>);

    openTagThreadPalette({ environmentId, threadId });
    const input = page.getByPlaceholder("Search...");
    await expect.element(input).toHaveFocus();
    await userEvent.type(input, "release");
    await expect.element(page.getByRole("option", { name: /Create tag/ })).toBeVisible();
    await userEvent.keyboard("{Enter}");

    expect(setThreadTag).toHaveBeenLastCalledWith({
      environmentId,
      input: { threadId, tag: "release", tagged: true },
    });
    await expect.element(input).toHaveValue("");
    await page.getByRole("option", { name: /release/ }).click();

    expect(setThreadTag).toHaveBeenLastCalledWith({
      environmentId,
      input: { threadId, tag: "release", tagged: false },
    });
  });
});
