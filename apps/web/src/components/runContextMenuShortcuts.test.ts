import { describe, expect, it } from "vite-plus/test";

import { runContextShortcutIndex, runContextShortcutLabel } from "./runContextMenuShortcuts";

function event(init: {
  key?: string;
  code?: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}) {
  return {
    key: init.key ?? "",
    code: init.code ?? "",
    metaKey: init.metaKey ?? false,
    ctrlKey: init.ctrlKey ?? false,
    altKey: init.altKey ?? false,
    shiftKey: init.shiftKey ?? false,
  };
}

describe("run context menu digit shortcuts", () => {
  it("selects the nth item on Ctrl digits outside macOS", () => {
    for (const platform of ["Win32", "Linux x86_64"]) {
      expect(
        runContextShortcutIndex(event({ code: "Digit1", key: "1", ctrlKey: true }), platform),
      ).toBe(0);
      expect(
        runContextShortcutIndex(event({ code: "Digit3", key: "3", ctrlKey: true }), platform),
      ).toBe(2);
      expect(
        runContextShortcutIndex(event({ code: "Numpad2", key: "2", ctrlKey: true }), platform),
      ).toBe(1);
    }
  });

  it("uses the meta key rather than Ctrl on macOS", () => {
    expect(
      runContextShortcutIndex(event({ code: "Digit1", key: "1", metaKey: true }), "MacIntel"),
    ).toBe(0);
    expect(
      runContextShortcutIndex(event({ code: "Digit1", key: "1", ctrlKey: true }), "MacIntel"),
    ).toBeNull();
    expect(
      runContextShortcutIndex(event({ code: "Digit1", key: "1", metaKey: true }), "Win32"),
    ).toBeNull();
  });

  it("ignores presses that carry other modifiers or no digit", () => {
    const ctrl = { ctrlKey: true } as const;
    expect(
      runContextShortcutIndex(
        event({ code: "Digit1", key: "1", ...ctrl, shiftKey: true }),
        "Win32",
      ),
    ).toBeNull();
    expect(
      runContextShortcutIndex(event({ code: "Digit1", key: "1", ...ctrl, altKey: true }), "Win32"),
    ).toBeNull();
    expect(
      runContextShortcutIndex(event({ code: "Digit0", key: "0", ...ctrl }), "Win32"),
    ).toBeNull();
    expect(runContextShortcutIndex(event({ code: "KeyA", key: "a", ...ctrl }), "Win32")).toBeNull();
    expect(runContextShortcutIndex(event({ code: "Digit1", key: "1" }), "Win32")).toBeNull();
  });

  it("labels digits with the platform's command modifier", () => {
    expect(runContextShortcutLabel(0, "Win32")).toBe("Ctrl+1");
    expect(runContextShortcutLabel(8, "Linux x86_64")).toBe("Ctrl+9");
    expect(runContextShortcutLabel(0, "MacIntel")).toBe("\u23181");
  });
});
