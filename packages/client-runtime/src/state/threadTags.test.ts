import { describe, expect, it } from "vite-plus/test";

import { collectThreadTags, matchesThreadTagFilter, parseThreadTag } from "./threadTags.ts";

describe("collectThreadTags", () => {
  it("counts each trimmed tag once per thread, most used first, then by name", () => {
    expect(
      collectThreadTags([
        { tags: ["ui", " bug"] },
        { tags: ["bug", "bug ", "backend"] },
        { tags: ["research"] },
        { tags: [""] },
        {},
      ]),
    ).toEqual([
      { tag: "bug", count: 2 },
      { tag: "backend", count: 1 },
      { tag: "research", count: 1 },
      { tag: "ui", count: 1 },
    ]);
  });
});

describe("matchesThreadTagFilter", () => {
  it.each([
    { tags: ["ui"], chosen: null, matches: true },
    { tags: undefined, chosen: null, matches: true },
    { tags: ["ui"], chosen: ["ui", "bug"], matches: true },
    { tags: ["backend"], chosen: ["ui", "bug"], matches: false },
    { tags: undefined, chosen: ["ui"], matches: false },
    { tags: ["UI"], chosen: ["ui"], matches: false },
  ])("$tags against $chosen is $matches", ({ tags, chosen, matches }) => {
    expect(matchesThreadTagFilter(tags, chosen === null ? null : new Set(chosen))).toBe(matches);
  });
});

describe("parseThreadTag", () => {
  it.each([
    { input: "  release ", tag: "release" },
    { input: "   ", tag: null },
    { input: "two\nlines", tag: null },
    { input: "x".repeat(65), tag: null },
  ])("parses $input", ({ input, tag }) => {
    expect(parseThreadTag(input)).toBe(tag);
  });
});
