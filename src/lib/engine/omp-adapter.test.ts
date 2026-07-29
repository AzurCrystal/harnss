import { describe, expect, it } from "vitest";
import { toOmpModelCommand } from "./omp-adapter";

describe("OMP model commands", () => {
  it("translates a persisted selector without depending on asynchronously loaded models", () => {
    expect(toOmpModelCommand("gpt/gpt-5.6-sol")).toEqual({
      type: "set_model",
      provider: "gpt",
      modelId: "gpt-5.6-sol",
    });
  });

  it("rejects malformed selectors", () => {
    expect(toOmpModelCommand("gpt-5.6-sol")).toBeNull();
    expect(toOmpModelCommand("/gpt-5.6-sol")).toBeNull();
    expect(toOmpModelCommand("gpt/")).toBeNull();
  });
});
