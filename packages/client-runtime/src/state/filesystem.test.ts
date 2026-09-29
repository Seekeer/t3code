import { describe, expect, it } from "vite-plus/test";

import {
  canPreloadBrowsePath,
  createBrowseNavigationCoordinator,
  filterFilesystemBrowseEntries,
  getFilesystemBrowsePath,
  isMissingDirectoryBrowseError,
} from "./filesystem.ts";

describe("filesystem browse model", () => {
  it("derives the browse target and navigation state", () => {
    expect(getFilesystemBrowsePath("~/projects/t3")).toEqual({
      isBrowsing: true,
      directoryPath: "~/projects/",
      filterQuery: "t3",
      parentPath: "~/",
      canBrowseUp: true,
    });
    expect(getFilesystemBrowsePath("C:\\Users\\test", "MacIntel").isBrowsing).toBe(false);
    expect(getFilesystemBrowsePath("~/projects/", "", false).isBrowsing).toBe(false);
  });

  it("filters names, hidden directories, and exact matches consistently", () => {
    const entries = [
      { name: ".config", fullPath: "/Users/test/.config" },
      { name: "Code", fullPath: "/Users/test/Code" },
      { name: "codething", fullPath: "/Users/test/codething" },
    ];

    expect(filterFilesystemBrowseEntries(entries, "co")).toEqual({
      visibleEntries: entries.slice(1, 3),
      exactEntry: null,
    });
    expect(filterFilesystemBrowseEntries(entries, "").visibleEntries).toEqual(entries.slice(1));
    expect(filterFilesystemBrowseEntries(entries, ".").visibleEntries).toEqual(entries.slice(0, 1));
    expect(filterFilesystemBrowseEntries(entries, "Code").exactEntry).toEqual(entries[1]);
  });
});

describe("browse navigation", () => {
  it("only commits the latest valid navigation", async () => {
    const navigation = createBrowseNavigationCoordinator();
    const first = Promise.withResolvers<void>();
    const second = Promise.withResolvers<void>();
    const commits: string[] = [];
    const commit = (name: string) => () => commits.push(name);
    const firstRun = navigation.run(() => first.promise, commit("first"));
    const secondRun = navigation.run(() => second.promise, commit("second"));

    second.resolve();
    await expect(secondRun).resolves.toBe(true);
    first.resolve();
    await expect(firstRun).resolves.toBe(false);

    const invalidated = Promise.withResolvers<void>();
    const invalidatedRun = navigation.run(() => invalidated.promise, commit("stale"));
    navigation.invalidate();
    invalidated.resolve();

    await expect(invalidatedRun).resolves.toBe(false);
    expect(commits).toEqual(["second"]);
  });

  it("only preloads connected environments", () => {
    expect(canPreloadBrowsePath("connected")).toBe(true);
    expect(canPreloadBrowsePath("offline")).toBe(false);
    expect(canPreloadBrowsePath("reconnecting")).toBe(false);
    expect(canPreloadBrowsePath(null)).toBe(false);
  });
});

describe("isMissingDirectoryBrowseError", () => {
  it("reports a directory the environment could not read as missing", () => {
    expect(
      isMissingDirectoryBrowseError({
        _tag: "FilesystemBrowseError",
        failure: "read_directory_failed",
        partialPath: "/home/me/moved-away",
      }),
    ).toBe(true);
  });

  it("does not blame the folder when the environment answered for another reason", () => {
    expect(
      isMissingDirectoryBrowseError({
        _tag: "FilesystemBrowseError",
        failure: "current_project_required",
      }),
    ).toBe(false);
  });

  it("does not blame the folder when the environment was never reached", () => {
    expect(isMissingDirectoryBrowseError(new Error("environment is offline"))).toBe(false);
    expect(isMissingDirectoryBrowseError({ _tag: "EnvironmentAuthorizationError" })).toBe(false);
    expect(isMissingDirectoryBrowseError(null)).toBe(false);
    expect(isMissingDirectoryBrowseError("nope")).toBe(false);
  });
});
