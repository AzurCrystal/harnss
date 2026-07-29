import type { EngineId } from "@/types";
import type { StartOptions } from "@/hooks/session/types";

/** Build OMP session-creation options from current frontend settings. */
export function buildSessionOptions(
  getModelForEngine: (engine: EngineId) => string | null,
  permissionMode: string,
  planMode: boolean,
  thinking: boolean,
): StartOptions {
  const model = getModelForEngine("omp") || undefined;
  return {
    model,
    permissionMode,
    planMode,
    thinkingEnabled: thinking,
    engine: "omp",
  };
}

export function getSyncedPlanMode(
  sessionPlanMode: boolean | undefined,
  permissionMode: string | undefined,
): boolean {
  const normalizedPermissionMode = permissionMode?.trim();
  if (normalizedPermissionMode) {
    return normalizedPermissionMode === "plan";
  }
  return !!sessionPlanMode;
}
