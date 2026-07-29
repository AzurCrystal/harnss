import { describe, expect, it } from "vitest";
import { getSessionNotificationActor } from "./session-notifications";

describe("getSessionNotificationActor", () => {
  it("uses the OMP session model", () => {
    expect(getSessionNotificationActor({
      engine: "omp",
      model: "anthropic/claude-sonnet-4",
    })).toBe("anthropic/claude-sonnet-4");
  });

  it("uses the active OMP session information when available", () => {
    expect(getSessionNotificationActor(
      { engine: "omp", model: undefined },
      { model: "openai/gpt-5" },
    )).toBe("openai/gpt-5");
  });
});
