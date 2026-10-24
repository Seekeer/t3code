import type { EnvironmentConnectionPhase } from "@t3tools/client-runtime/connection";
import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  resolveAddProjectEnvironment,
  resolveProjectFolderReLinkSeed,
} from "./AddProjectScreen.logic";

const ENVIRONMENT_A = EnvironmentId.make("environment-a");
const ENVIRONMENT_B = EnvironmentId.make("environment-b");

function environment(environmentId: EnvironmentId, connectionState: EnvironmentConnectionPhase) {
  return { environmentId, connectionState };
}

describe("resolveAddProjectEnvironment", () => {
  it("does not redirect an explicit unavailable environment to another environment", () => {
    expect(
      resolveAddProjectEnvironment(
        [environment(ENVIRONMENT_A, "offline"), environment(ENVIRONMENT_B, "connected")],
        ENVIRONMENT_A,
      ),
    ).toBeNull();
  });
});

describe("resolveProjectFolderReLinkSeed", () => {
  it("opens on the project's current folder with its own name pinned", () => {
    expect(resolveProjectFolderReLinkSeed("/home/me/projects/app")).toEqual({
      initialDirectoryPath: "/home/me/projects/",
      pinnedDirectoryName: "app",
    });
  });

  it("proposes the same folder name when browsing up, which is where a moved folder lands", () => {
    const seed = resolveProjectFolderReLinkSeed("/home/me/old/app");
    // The picker appends the pinned name to whatever directory is browsed, so
    // browsing up to /home/me/ yields the expected re-link candidate.
    expect(`${seed.initialDirectoryPath}${seed.pinnedDirectoryName}`).toBe("/home/me/old/app");
    expect(seed.pinnedDirectoryName).toBe("app");
  });

  it("keeps the windows separator style", () => {
    expect(resolveProjectFolderReLinkSeed("C:\\Users\\me\\app")).toEqual({
      initialDirectoryPath: "C:\\Users\\me\\",
      pinnedDirectoryName: "app",
    });
  });

  it("falls back to the home directory when the project has no recorded path", () => {
    expect(resolveProjectFolderReLinkSeed("")).toEqual({
      initialDirectoryPath: "~/",
      pinnedDirectoryName: "",
    });
  });
});
