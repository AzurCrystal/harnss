/**
 * useSessionPane — encapsulates one OMP runtime hook for a UI pane.
 *
 * In single mode, only the primary pane is active. In split view, both primary
 * and secondary panes are active simultaneously. The hook is always called
 * unconditionally; inactive panes receive a null OMP session ID.
 */

import { useOMP, type OMPHookState } from "../useOMP";
import type { UIMessage, PermissionRequest, ContextUsage, SessionInfo, ModelInfo, SlashCommand } from "@/types";
import type { OmpModel } from "@/lib/engine/omp-adapter";
import type { OmpThinkingLevel } from "@shared/types/omp";
import { DRAFT_ID, type InitialMeta } from "./types";

export interface UseSessionPaneOptions {
  /** The logical session ID for this pane (or null when the pane is unused). */
  activeSessionId: string | null;
  /** Working directory for OMP session state. */
  cwd?: string;

  // ── Initial state for session restoration ──
  initialMessages: UIMessage[];
  initialMeta: InitialMeta | null;
  initialPermission: PermissionRequest | null;
  initialSupportedModels?: ModelInfo[];
  initialOmpModels?: OmpModel[];
  initialThinkingLevels?: OmpThinkingLevel[];
  initialThinkingLevel?: OmpThinkingLevel;
  initialSlashCommands?: SlashCommand[];
}

export interface SessionPaneState {
  /** OMP hook state for pane-specific callers. */
  omp: OMPHookState;
  /** The active runtime hook. */
  engine: OMPHookState;

  /** Convenience accessors derived from OMP. */
  messages: UIMessage[];
  totalCost: number;
  contextUsage: ContextUsage | null;
  isProcessing: boolean;
  isConnected: boolean;
  isCompacting: boolean;
  sessionInfo: SessionInfo | null;
  pendingPermission: PermissionRequest | null;
}

export function useSessionPane({
  activeSessionId,
  cwd,
  initialMessages,
  initialMeta,
  initialPermission,
  initialSupportedModels,
  initialOmpModels,
  initialThinkingLevels,
  initialThinkingLevel,
  initialSlashCommands,
}: UseSessionPaneOptions): SessionPaneState {
  const omp = useOMP({
    sessionId: activeSessionId === DRAFT_ID ? null : activeSessionId,
    cwd,
    initialMessages,
    initialMeta,
    initialPermission,
    initialSupportedModels,
    initialOmpModels,
    initialThinkingLevels,
    initialThinkingLevel,
    initialSlashCommands,
  });

  return {
    omp,
    engine: omp,
    messages: omp.messages,
    totalCost: omp.totalCost,
    contextUsage: omp.contextUsage,
    isProcessing: omp.isProcessing,
    isConnected: omp.isConnected,
    isCompacting: omp.isCompacting,
    sessionInfo: omp.sessionInfo,
    pendingPermission: omp.pendingPermission,
  };
}
