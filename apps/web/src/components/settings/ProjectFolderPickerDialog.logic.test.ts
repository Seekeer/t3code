import { describe, expect, it } from "vite-plus/test";

import {
  resolveProjectFolderSelection,
  seedProjectFolderQuery,
  workspaceRootFailureMessage,
} from "./ProjectFolderPickerDialog.logic";

const MAC = "MacIntel";
const WINDOWS = "Win32";

describe("seedProjectFolderQuery", () => {
  it("opens on the folder the project points at today", () => {
    expect(seedProjectFolderQuery("/home/me/app")).toBe("/home/me/app/");
  });

  it("leaves an already terminated path alone", () => {
    expect(seedProjectFolderQuery("/home/me/app/")).toBe("/home/me/app/");
  });

  it("keeps the windows separator style", () => {
    expect(seedProjectFolderQuery("C:\\Users\\me\\app")).toBe("C:\\Users\\me\\app\\");
  });
});

describe("resolveProjectFolderSelection", () => {
  it("selects the browsed directory when the query ends in a separator", () => {
    const selection = resolveProjectFolderSelection({
      query: "/home/me/app/",
      browseParentPath: "/home/me/app",
      exactEntryPath: null,
      platform: MAC,
    });

    expect(selection).toEqual({ ok: true, path: "/home/me/app" });
  });

  it("falls back to the typed path when the directory cannot be listed", () => {
    const selection = resolveProjectFolderSelection({
      query: "/home/me/moved-away/",
      browseParentPath: null,
      exactEntryPath: null,
      platform: MAC,
    });

    // The picker stays open and the server rejects the path; the dialog must
    // still hand over what the user typed so that rejection is reported.
    expect(selection).toEqual({ ok: true, path: "/home/me/moved-away" });
  });

  it("prefers an exact directory match over a partial leaf name", () => {
    const selection = resolveProjectFolderSelection({
      query: "/home/me/ap",
      browseParentPath: "/home/me",
      exactEntryPath: "/home/me/app",
      platform: MAC,
    });

    expect(selection).toEqual({ ok: true, path: "/home/me/app" });
  });

  it("keeps the typed path when nothing matches exactly", () => {
    const selection = resolveProjectFolderSelection({
      query: "/home/me/app",
      browseParentPath: "/home/me",
      exactEntryPath: null,
      platform: MAC,
    });

    expect(selection).toEqual({ ok: true, path: "/home/me/app" });
  });

  it("passes a bare home path through for the server to expand", () => {
    const selection = resolveProjectFolderSelection({
      query: "~",
      browseParentPath: null,
      exactEntryPath: null,
      platform: MAC,
    });

    expect(selection).toEqual({ ok: true, path: "~" });
  });

  it("rejects a windows path typed against a posix environment", () => {
    const selection = resolveProjectFolderSelection({
      query: "C:\\Users\\me\\app",
      browseParentPath: null,
      exactEntryPath: null,
      platform: MAC,
    });

    expect(selection).toEqual({
      ok: false,
      error: "Windows-style paths are only supported on Windows environments.",
    });
  });

  it("accepts a windows path against a windows environment", () => {
    const selection = resolveProjectFolderSelection({
      query: "C:\\Users\\me\\app",
      browseParentPath: null,
      exactEntryPath: null,
      platform: WINDOWS,
    });

    expect(selection).toEqual({ ok: true, path: "C:\\Users\\me\\app" });
  });

  it("rejects a relative path because a project's folder is never relative", () => {
    const selection = resolveProjectFolderSelection({
      query: "../elsewhere",
      browseParentPath: null,
      exactEntryPath: null,
      platform: MAC,
    });

    expect(selection).toEqual({
      ok: false,
      error: "Relative paths require an active project in this environment.",
    });
  });

  it("rejects an empty path", () => {
    const selection = resolveProjectFolderSelection({
      query: "  ",
      browseParentPath: null,
      exactEntryPath: null,
      platform: MAC,
    });

    expect(selection).toEqual({ ok: false, error: "Enter a project path." });
  });
});

describe("workspaceRootFailureMessage", () => {
  it("explains a missing folder as a wrong turn rather than a server fault", () => {
    expect(
      workspaceRootFailureMessage({
        workspaceRootFailure: "workspace_root_not_exists",
        message: "Workspace root does not exist: /gone",
      }),
    ).toBe("That folder does not exist. Pick a folder that already exists.");
  });

  it("explains a file chosen as the project root", () => {
    expect(
      workspaceRootFailureMessage({ workspaceRootFailure: "workspace_root_not_directory" }),
    ).toBe("That path is a file, not a folder. Pick a folder instead.");
  });

  it("leaves unrelated failures to their own message", () => {
    expect(workspaceRootFailureMessage(new Error("environment is offline"))).toBeNull();
    expect(workspaceRootFailureMessage({ message: "no reason field" })).toBeNull();
    expect(workspaceRootFailureMessage(null)).toBeNull();
  });
});
