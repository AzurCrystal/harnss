import type {
  UIMessage,
  SessionInfo,
  PermissionRequest,
  SlashCommand,
  ContextUsage,
  ModelInfo,
} from "@/types";
import {
  applyOmpFrame,
  createOmpRuntimeState,
  markOmpDisconnected,
  type OmpModel,
  type OmpRuntimeState,
} from "@/lib/engine/omp-adapter";
import type { OmpSessionFrame, OmpThinkingLevel } from "@shared/types/omp";
import { createSystemMessage } from "@/lib/message-factory";
import { bgAgentStore } from "./agent-store";

export interface BackgroundSessionState {
  messages: UIMessage[];
  isProcessing: boolean;
  isConnected: boolean;
  isCompacting: boolean;
  sessionInfo: SessionInfo | null;
  totalCost: number;
  contextUsage: ContextUsage | null;
  pendingPermission: PermissionRequest | null;
  /** Slash commands available for this session (OMP updates dynamically). */
  slashCommands: SlashCommand[];
  supportedModels?: ModelInfo[];
  ompModels?: OmpModel[];
  thinkingLevels?: OmpThinkingLevel[];
  thinkingLevel?: OmpThinkingLevel;
}

/** Callback fired when a background session receives a permission request */
type PermissionRequestCallback = (sessionId: string, permission: PermissionRequest) => void;

function cloneBackgroundState(state: OmpRuntimeState): BackgroundSessionState {
  return {
    messages: state.messages.map((message) => ({
      ...message,
      ...(message.images ? { images: [...message.images] } : {}),
      ...(message.subagentSteps
        ? { subagentSteps: message.subagentSteps.map((step) => ({ ...step })) }
        : {}),
    })),
    isProcessing: state.isProcessing,
    isConnected: state.isConnected,
    isCompacting: state.isCompacting,
    sessionInfo: state.sessionInfo ? { ...state.sessionInfo } : null,
    totalCost: state.totalCost,
    contextUsage: state.contextUsage ? { ...state.contextUsage } : null,
    pendingPermission: state.pendingPermission ? { ...state.pendingPermission } : null,
    slashCommands: [...state.slashCommands],
    supportedModels: (state.supportedModels ?? []).map((model) => ({ ...model })),
    ompModels: (state.ompModels ?? []).map((model) => ({
      ...model,
      ...(model.thinkingLevels ? { thinkingLevels: [...model.thinkingLevels] } : {}),
    })),
    thinkingLevels: [...(state.thinkingLevels ?? [])],
    thinkingLevel: state.thinkingLevel,
  };
}

/**
 * Accumulates UIMessages for sessions not currently active in useOMP.
 * Prevents event loss when switching between sessions with ongoing responses.
 */
export class BackgroundSessionStore {
  private sessions = new Map<string, OmpRuntimeState>();
  private initializedOmpSessions = new Set<string>();
  onProcessingChange?: (sessionId: string, isProcessing: boolean) => void;
  onPermissionRequest?: PermissionRequestCallback;

  private getOrCreate(sessionId: string): OmpRuntimeState {
    let state = this.sessions.get(sessionId);
    if (!state) {
      state = createOmpRuntimeState();
      this.sessions.set(sessionId, state);
    }
    return state;
  }

  private requestInitialOMPState(sessionId: string): void {
    if (this.initializedOmpSessions.has(sessionId)) return;
    this.initializedOmpSessions.add(sessionId);
    void window.claude.omp.command(sessionId, { type: "set_subagent_subscription", level: "events" });
    void window.claude.omp.command(sessionId, { type: "get_subagents" });
    void window.claude.omp.command(sessionId, { type: "get_state" });
    void window.claude.omp.command(sessionId, { type: "get_available_models" });
    void window.claude.omp.command(sessionId, { type: "get_available_commands" });
  }

  /** Handle an official OMP frame for a session that is not currently mounted. */
  handleOMPEvent(event: OmpSessionFrame): void {
    const sessionId = event._sessionId;
    if (!sessionId) return;
    if (event.type === "ready") this.requestInitialOMPState(sessionId);
    bgAgentStore.handleOmpFrame(event);
    const state = this.getOrCreate(sessionId);
    const result = applyOmpFrame(state, event, {
      cwd: state.sessionInfo?.cwd,
      logicalSessionId: sessionId,
    });
    if (result.processingChanged) {
      this.onProcessingChange?.(sessionId, state.isProcessing);
    }
    if (result.permissionRequested) {
      this.onPermissionRequest?.(sessionId, result.permissionRequested);
    }
  }

  /** Preserve OMP stderr emitted while the session is inactive. */
  handleOMPStderr(sessionId: string, data: string): void {
    if (!data) return;
    this.getOrCreate(sessionId).messages.push(createSystemMessage(data, true));
  }

  /** Finalize an inactive OMP session after its process exits. */
  markOMPDisconnected(sessionId: string, error?: string): void {
    this.initializedOmpSessions.delete(sessionId);
    const state = this.sessions.get(sessionId);
    if (!state) return;
    const wasProcessing = state.isProcessing;
    markOmpDisconnected(state, error);
    if (wasProcessing) this.onProcessingChange?.(sessionId, false);
  }

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  get(sessionId: string): BackgroundSessionState | undefined {
    const state = this.sessions.get(sessionId);
    if (!state) return undefined;
    return cloneBackgroundState(state);
  }

  consume(sessionId: string): BackgroundSessionState | undefined {
    const state = this.sessions.get(sessionId);
    if (!state) return undefined;
    this.sessions.delete(sessionId);
    return {
      messages: state.messages,
      isProcessing: state.isProcessing,
      isConnected: state.isConnected,
      isCompacting: state.isCompacting,
      sessionInfo: state.sessionInfo,
      totalCost: state.totalCost,
      contextUsage: state.contextUsage,
      pendingPermission: state.pendingPermission,
      slashCommands: state.slashCommands,
      supportedModels: state.supportedModels,
      ompModels: state.ompModels,
      thinkingLevels: state.thinkingLevels,
      thinkingLevel: state.thinkingLevel,
    };
  }

  delete(sessionId: string): void {
    this.sessions.delete(sessionId);
    this.initializedOmpSessions.delete(sessionId);
  }

  updateMessages(sessionId: string, updater: (messages: UIMessage[]) => UIMessage[]): void {
    const state = this.sessions.get(sessionId);
    if (!state) return;
    state.messages = updater(state.messages);
  }

  setProcessing(sessionId: string, isProcessing: boolean): void {
    const state = this.sessions.get(sessionId);
    if (!state || state.isProcessing === isProcessing) return;
    state.isProcessing = isProcessing;
    this.onProcessingChange?.(sessionId, isProcessing);
  }

  /** Seed store with the current session state when switching away. */
  initFromState(sessionId: string, state: BackgroundSessionState): void {
    this.sessions.set(sessionId, createOmpRuntimeState({
      messages: state.messages,
      isProcessing: state.isProcessing,
      isConnected: state.isConnected,
      isCompacting: state.isCompacting,
      sessionInfo: state.sessionInfo,
      totalCost: state.totalCost,
      contextUsage: state.contextUsage,
      pendingPermission: state.pendingPermission,
      slashCommands: state.slashCommands,
      supportedModels: state.supportedModels,
      ompModels: state.ompModels,
      thinkingLevels: state.thinkingLevels,
      thinkingLevel: state.thinkingLevel,
    }));
  }
}
