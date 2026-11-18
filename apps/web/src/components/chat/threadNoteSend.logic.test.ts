import { describe, expect, it } from "vite-plus/test";

import { composePromptWithNote } from "./threadNoteSend.logic";

describe("composePromptWithNote", () => {
  it("sends the note alone when the composer is empty", () => {
    expect(composePromptWithNote("", "Check the flaky test")).toBe("Check the flaky test");
    expect(composePromptWithNote("   \n", "  Check the flaky test  ")).toBe("Check the flaky test");
  });

  it("keeps an existing draft and appends the note below it", () => {
    expect(composePromptWithNote("Fix the parser", "Also update the docs")).toBe(
      "Fix the parser\n\nAlso update the docs",
    );
    // Trailing newlines in the draft must not leave a gap before the note.
    expect(composePromptWithNote("Fix the parser\n\n", "Also update the docs")).toBe(
      "Fix the parser\n\nAlso update the docs",
    );
  });

  it("leaves the draft alone when the note is empty or whitespace", () => {
    expect(composePromptWithNote("Fix the parser", "")).toBe("Fix the parser");
    expect(composePromptWithNote("Fix the parser", "  \n ")).toBe("Fix the parser");
    expect(composePromptWithNote("", "")).toBe("");
  });

  it("does not append a note the draft already is", () => {
    expect(composePromptWithNote("Check the flaky test", "Check the flaky test  ")).toBe(
      "Check the flaky test",
    );
  });
});
