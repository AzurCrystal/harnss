import { describe, expect, it } from "vitest";
import type { SlashCommand } from "@/types";
import {
  LOCAL_CLEAR_COMMAND,
  getAvailableSlashCommands,
  getSlashCommandReplacement,
  isClearCommandText,
} from "./input-bar";
import { getComposerKeyAction } from "./input-bar/input-bar-utils";

describe("InputBar slash command helpers", () => {
  it("always includes the local clear command first", () => {
    const commands: SlashCommand[] = [
      { name: "compact", description: "Compact context", source: "omp" },
    ];

    expect(getAvailableSlashCommands(commands)).toEqual([
      LOCAL_CLEAR_COMMAND,
      commands[0],
    ]);
  });

  it("deduplicates engine-provided clear commands in favor of the local one", () => {
    const commands: SlashCommand[] = [
      { name: "clear", description: "Engine clear", source: "omp" },
      { name: "help", description: "Help", source: "omp" },
    ];

    expect(getAvailableSlashCommands(commands)).toEqual([
      LOCAL_CLEAR_COMMAND,
      commands[1],
    ]);
  });

  it("detects the exact /clear command text", () => {
    expect(isClearCommandText("/clear")).toBe(true);
    expect(isClearCommandText("  /clear  ")).toBe(true);
    expect(isClearCommandText("/clear now")).toBe(false);
    expect(isClearCommandText("/compact")).toBe(false);
  });

  it("builds replacement text for local and OMP commands", () => {
    expect(getSlashCommandReplacement(LOCAL_CLEAR_COMMAND)).toBe("/clear");
    expect(getSlashCommandReplacement({ name: "compact", description: "", source: "omp" })).toBe("/compact ");
  });
});

describe("InputBar IME composition handling", () => {
  it("ignores Enter and Tab while the IME is composing", () => {
    expect(getComposerKeyAction("Enter", false, true, 13)).toBe("ignore");
    expect(getComposerKeyAction("Tab", false, true, 9)).toBe("ignore");
  });

  it("ignores the IME process key emitted with keyCode 229", () => {
    expect(getComposerKeyAction("Enter", false, false, 229)).toBe("ignore");
    expect(getComposerKeyAction("Tab", false, false, 229)).toBe("ignore");
  });

  it("handles Enter normally after composition ends", () => {
    expect(getComposerKeyAction("Enter", false, false, 13)).toBe("send");
    expect(getComposerKeyAction("Enter", true, false, 13)).toBe("line-break");
    expect(getComposerKeyAction("Tab", false, false, 9)).toBeNull();
  });
});
