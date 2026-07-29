import type { ChatSession, UIMessage, SessionInfo, PermissionRequest, ImageAttachment, ClaudeEffort, ContextUsage, EngineId, ModelInfo, Project, SlashCommand } from "@/types";
import type { BackgroundSessionStore } from "../../lib/background/session-store";
import type { OMPHookState } from "../useOMP";
import type { OmpModel } from "@/lib/engine/omp-adapter";
import type { OmpApprovalMode, OmpThinkingLevel } from "@shared/types/omp";

export const DRAFT_ID = "__draft__";
export const DEFAULT_PERMISSION_MODE = "default";

export interface StartOptions {
  model?: string;
  permissionMode?: string;
  planMode?: boolean;
  thinkingEnabled?: boolean;
  effort?: ClaudeEffort;
  engine?: EngineId;
}

export interface InitialMeta {
  isProcessing: boolean;
  isConnected: boolean;
  sessionInfo: SessionInfo | null;
  totalCost: number;
  contextUsage: ContextUsage | null;
  isCompacting?: boolean;
}

export interface QueuedMessage {
  text: string;
  images?: ImageAttachment[];
  displayText?: string;
  /** ID of the UIMessage already shown in chat with isQueued: true */
  messageId: string;
}

export interface SessionPaneBootstrap {
  session: ChatSession;
  initialMessages: UIMessage[];
  initialMeta: InitialMeta | null;
  initialPermission: PermissionRequest | null;
  initialSupportedModels?: ModelInfo[];
  initialOmpModels?: OmpModel[];
  initialThinkingLevels?: OmpThinkingLevel[];
  initialThinkingLevel?: OmpThinkingLevel;
  initialSlashCommands?: SlashCommand[];
  /** Working directory supplied to the pane's OMP hook. */
  cwd?: string;
}

/** Shared refs that multiple sub-hooks need to read/write */
export interface SharedSessionRefs {
  activeSessionIdRef: React.MutableRefObject<string | null>;
  sessionsRef: React.MutableRefObject<ChatSession[]>;
  projectsRef: React.MutableRefObject<Project[]>;
  draftProjectIdRef: React.MutableRefObject<string | null>;
  draftSessionIdRef: React.MutableRefObject<string | null>;
  startOptionsRef: React.MutableRefObject<StartOptions>;
  messagesRef: React.MutableRefObject<UIMessage[]>;
  totalCostRef: React.MutableRefObject<number>;
  contextUsageRef: React.MutableRefObject<ContextUsage | null>;
  isProcessingRef: React.MutableRefObject<boolean>;
  isCompactingRef: React.MutableRefObject<boolean>;
  isConnectedRef: React.MutableRefObject<boolean>;
  sessionInfoRef: React.MutableRefObject<SessionInfo | null>;
  pendingPermissionRef: React.MutableRefObject<PermissionRequest | null>;
  liveSessionIdsRef: React.MutableRefObject<Set<string>>;
  backgroundStoreRef: React.MutableRefObject<BackgroundSessionStore>;
  materializingRef: React.MutableRefObject<boolean>;
  saveTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  messageQueueRef: React.MutableRefObject<Map<string, QueuedMessage[]>>;
  lastMessageSyncSessionRef: React.MutableRefObject<string | null>;
  switchSessionRef: React.MutableRefObject<((id: string) => Promise<void>) | undefined>;
  onSpaceChangeRef: React.MutableRefObject<((spaceId: string) => void) | undefined>;
  /** Current git branch for the active project — set by the orchestrator. */
  currentBranchRef: React.MutableRefObject<string | undefined>;
  /** Split view: session IDs currently visible in extra panes. */
  visibleSplitSessionIdsRef: React.MutableRefObject<readonly string[]>;
}

/** State setters from the orchestrator that sub-hooks need */
export interface SharedSessionSetters {
  setSessions: React.Dispatch<React.SetStateAction<ChatSession[]>>;
  setActiveSessionId: React.Dispatch<React.SetStateAction<string | null>>;
  setInitialMessages: React.Dispatch<React.SetStateAction<UIMessage[]>>;
  setInitialMeta: React.Dispatch<React.SetStateAction<InitialMeta | null>>;
  setInitialPermission: React.Dispatch<React.SetStateAction<PermissionRequest | null>>;
  setInitialSupportedModels: React.Dispatch<React.SetStateAction<ModelInfo[]>>;
  setInitialOmpModels: React.Dispatch<React.SetStateAction<OmpModel[]>>;
  setInitialThinkingLevels: React.Dispatch<React.SetStateAction<OmpThinkingLevel[]>>;
  setInitialThinkingLevel: React.Dispatch<React.SetStateAction<OmpThinkingLevel | undefined>>;
  setInitialSlashCommands: React.Dispatch<React.SetStateAction<SlashCommand[]>>;
  setStartOptions: React.Dispatch<React.SetStateAction<StartOptions>>;
  setDraftProjectId: React.Dispatch<React.SetStateAction<string | null>>;
  setDraftSessionId: React.Dispatch<React.SetStateAction<string | null>>;
  setQueuedCount: React.Dispatch<React.SetStateAction<number>>;
}

/** OMP hook state shared with session sub-hooks. */
export interface EngineHooks {
  omp: OMPHookState;
  engine: OMPHookState;
}

// ── Utility functions shared across sub-hooks ──


/** Translate persisted Harnss permission labels to OMP's supported approval modes. */
export function getOmpApprovalMode(permissionMode?: string): OmpApprovalMode | undefined {
  const mode = permissionMode?.trim() || DEFAULT_PERMISSION_MODE;
  if (mode === "default") return "always-ask";
  if (mode === "acceptEdits") return "write";
  if (mode === "bypassPermissions") return "yolo";
  if (mode === "always-ask" || mode === "write" || mode === "yolo") return mode;
  return undefined;
}

/** Map the persisted thinking settings to the OMP RPC thinking level. */
export function getOmpThinkingLevel(options: StartOptions): OmpThinkingLevel | undefined {
  if (options.thinkingEnabled === false) return "off";
  if (options.effort) return options.effort;
  return undefined;
}
