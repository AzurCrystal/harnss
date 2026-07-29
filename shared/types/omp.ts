/**
 * Official Oh My Pi RPC wire types used by the Electron bridge and renderer.
 *
 * The RPC stream is intentionally open: OMP extensions and newer runtimes can
 * emit official frame variants beyond the subset Harnss currently renders.
 */

/** OMP's CLI approval-mode values. */
export type OmpApprovalMode = "always-ask" | "write" | "yolo";

/** OMP's official RPC thinking-level values. */
export type OmpThinkingLevel =
  | "inherit"
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

/** OMP subagent event subscription levels. */
export type OmpSubagentSubscriptionLevel = "off" | "progress" | "events";

/** Capabilities advertised by the OMP server in the ready frame. */
export type OmpCapability = "prompt_result" | "prompt_lifecycle_disposition";

/** How a prompt relates to agent lifecycle reservations. */
export type OmpPromptLifecycleDisposition = "none" | "current" | "future";

/** Prompt outcome carried in the server acknowledgement payload. */
export interface OmpPromptAcknowledgement {
  agentInvoked?: boolean;
  lifecycleDisposition?: OmpPromptLifecycleDisposition;
}

/** Prompt result frame emitted after a prompt completes. */
export interface OmpPromptResultFrame extends OmpRpcFrame {
  type: "prompt_result";
  id?: string;
  agentInvoked: boolean;
  lifecycleDisposition?: OmpPromptLifecycleDisposition;
}

/** OMP's subagent source values. */
export type OmpSubagentSource = "bundled" | "user" | "project";

/** OMP's snapshot status values for a spawned subagent. */
export type OmpSubagentStatus = "pending" | "running" | "completed" | "failed" | "aborted";

/** A recently completed tool execution reported in subagent progress. */
export interface OmpSubagentRecentTool {
  tool: string;
  args: string;
  endMs: number;
}

/** OMP's full live progress snapshot for one subagent. */
export interface OmpSubagentProgress {
  index: number;
  id: string;
  agent: string;
  agentSource: OmpSubagentSource;
  status: OmpSubagentStatus;
  task: string;
  assignment?: string;
  description?: string;
  lastIntent?: string;
  currentTool?: string;
  currentToolArgs?: string;
  currentToolStartMs?: number;
  recentTools: OmpSubagentRecentTool[];
  recentOutput: string[];
  toolCount: number;
  requests: number;
  tokens: number;
  contextTokens?: number;
  contextWindow?: number;
  cost: number;
  durationMs: number;
  modelOverride?: string | string[];
  resolvedModel?: string;
  resolvedModelIsFallback?: boolean;
  extractedToolData?: Record<string, unknown[]>;
  retryState?: {
    attempt: number;
    maxAttempts: number;
    delayMs: number;
    errorMessage: string;
    startedAtMs: number;
  };
  retryFailure?: { attempt: number; errorMessage: string };
  inflightTaskDetails?: Record<string, unknown>;
}

/** OMP's current registry record for a spawned subagent. */
export interface OmpSubagentSnapshot {
  id: string;
  index: number;
  agent: string;
  agentSource: OmpSubagentSource;
  description?: string;
  status: OmpSubagentStatus;
  task?: string;
  assignment?: string;
  sessionFile?: string;
  lastUpdate: number;
  progress?: OmpSubagentProgress;
  parentToolCallId?: string;
}

/** OMP's lifecycle payload for one subagent. */
export interface OmpSubagentLifecyclePayload {
  id: string;
  agent: string;
  agentSource: OmpSubagentSource;
  description?: string;
  status: "started" | "completed" | "failed" | "aborted";
  sessionFile?: string;
  parentToolCallId?: string;
  index: number;
  detached?: boolean;
}

/** OMP's progress payload for one subagent. */
export interface OmpSubagentProgressPayload {
  index: number;
  agent: string;
  agentSource: OmpSubagentSource;
  task: string;
  parentToolCallId?: string;
  assignment?: string;
  progress: OmpSubagentProgress;
  sessionFile?: string;
  detached?: boolean;
}

/** OMP's forwarded event payload for one subagent. */
export interface OmpSubagentEventPayload {
  id: string;
  event: OmpRpcFrame;
}

/** Base64-encoded image input accepted by OMP's prompt commands. */
export interface OmpImageContent {
  type: "image";
  data: string;
  mimeType: string;
}

/** A raw official OMP stdout frame. */
export interface OmpRpcFrame {
  type: string;
  [key: string]: unknown;
}

/** OMP's initial protocol-v1 ready frame. */
export interface OmpReadyFrame extends OmpRpcFrame {
  type: "ready";
  protocolVersion: 1;
  supportedProtocolVersions: number[];
  capabilities?: OmpCapability[];
  maxFrameBytes: number;
  maxReassembledFrameBytes: number;
}

/** OMP's protocol-v2 chunk transport frame. */
export interface OmpRpcChunkFrame extends OmpRpcFrame {
  type: "rpc_chunk";
  chunkId: string;
  index: number;
  count: number;
  byteLength: number;
  data: string;
}

/** Official command response frame. */
export interface OmpRpcResponseFrame extends OmpRpcFrame {
  type: "response";
  id?: string;
  command: string;
  success: boolean;
  data?: unknown;
  error?: string;
  code?: string;
}

type OmpCommandId = { id?: string };

/** Responses to OMP extension UI requests. */
export type OmpExtensionUiResponse =
  | { type: "extension_ui_response"; id: string; value: string }
  | { type: "extension_ui_response"; id: string; confirmed: boolean }
  | { type: "extension_ui_response"; id: string; cancelled: true; timedOut?: boolean };

// ============================================================================
// Work mode snapshots (plan / goal / vibe / loop)
// ============================================================================

export interface OmpPlanProposalSnapshot {
  planFilePath: string;
  title: string;
  content: string;
}

export interface OmpPlanModeSnapshot {
  enabled: boolean;
  planFilePath: string | null;
  workflow: "parallel" | "iterative" | null;
  reentry: boolean;
  proposal: OmpPlanProposalSnapshot | null;
  paused: boolean;
}

export type OmpPlanFinalizationStrategy = "execute" | "keep-context" | "compact-context";

export interface OmpPlanDecisionResult {
  decision: "approved" | "rejected";
  planFilePath: string;
  title: string;
  state: OmpPlanModeSnapshot;
  compaction?: { outcome: "ok" | "cancelled" | "failed"; error?: string };
}

export interface OmpGoalDescriptor {
  id: string;
  objective: string;
  status: "active" | "paused" | "budget-limited" | "complete" | "dropped";
  tokensUsed: number;
  timeUsedSeconds: number;
  createdAt: number;
  updatedAt: number;
}

export interface OmpGoalBudgetSnapshot {
  limit: number | null;
  used: number;
  remaining: number | null;
}

export interface OmpGoalModeSnapshot {
  enabled: boolean;
  paused: boolean;
  mode: "active" | "exiting" | null;
  reason: "completed" | null;
  goal: OmpGoalDescriptor | null;
  budget: OmpGoalBudgetSnapshot | null;
}

export interface OmpVibeWorkerSnapshot {
  id: string;
  cli: "fast" | "good";
  state: "starting" | "running" | "idle" | "dead";
  model: string | null;
  turns: number;
  queued: number;
  turnStartedAt: number | null;
  turnMessage: string | null;
  currentTool: string | null;
  currentToolArgs: string | null;
  lastIntent: string | null;
  trace: string[];
  outputTail: string[];
  lastActivity: string | null;
  lastActivityAt: number;
}

export interface OmpVibeModeSnapshot {
  enabled: boolean;
  activeTools: string[];
  ephemeralTools: string[];
  workers: OmpVibeWorkerSnapshot[];
}

export interface OmpLoopState {
  enabled: boolean;
  state: "waiting" | "running" | "paused";
  action: "prompt" | "compact" | "reset";
  prompt: string | null;
  limit: { kind: "iterations"; initial: number; remaining: number }
    | { kind: "duration"; durationMs: number; deadlineMs: number }
    | null;
}

export interface OmpWorkModeSnapshot {
  activeMode: "plan" | "goal" | "vibe" | null;
  proposalPending: boolean;
  plan: OmpPlanModeSnapshot;
  goal: OmpGoalModeSnapshot;
  vibe: OmpVibeModeSnapshot;
}

/**
 * The official OMP commands used by Harnss.  Protocol negotiation is internal
 * to the transport; the other variants are exposed through `window.claude.omp`.
 */
export type OmpRpcCommand =
  | (OmpCommandId & { type: "negotiate_protocol"; protocolVersion: 2 })
  | (OmpCommandId & {
      type: "prompt";
      message: string;
      images?: OmpImageContent[];
      streamingBehavior?: "steer" | "followUp";
    })
  | (OmpCommandId & { type: "steer"; message: string; images?: OmpImageContent[] })
  | (OmpCommandId & { type: "follow_up"; message: string; images?: OmpImageContent[] })
  | (OmpCommandId & { type: "abort" })
  | (OmpCommandId & { type: "compact"; customInstructions?: string })
  // State
  | (OmpCommandId & { type: "get_state" })
  | (OmpCommandId & { type: "get_available_models" })
  | (OmpCommandId & { type: "get_available_commands" })
  | (OmpCommandId & { type: "set_model"; provider: string; modelId: string })
  | (OmpCommandId & { type: "cycle_model" })
  | (OmpCommandId & { type: "set_thinking_level"; level: OmpThinkingLevel })
  | (OmpCommandId & { type: "cycle_thinking_level" })
  | (OmpCommandId & { type: "set_subagent_subscription"; level: OmpSubagentSubscriptionLevel })
  | (OmpCommandId & { type: "get_subagents" })
  | (OmpCommandId & {
      type: "get_subagent_messages";
      subagentId?: string;
      sessionFile?: string;
      fromByte?: number;
    })
  // Work modes — plan
  | (OmpCommandId & { type: "enter_plan_mode"; planFilePath?: string; workflow?: "parallel" | "iterative" })
  | (OmpCommandId & { type: "pause_plan_mode" })
  | (OmpCommandId & { type: "resume_plan_mode" })
  | (OmpCommandId & { type: "exit_plan_mode" })
  | (OmpCommandId & { type: "get_plan_mode_state" })
  | (OmpCommandId & { type: "submit_plan_review"; title?: string })
  | (OmpCommandId & {
      type: "approve_plan_proposal";
      editedContent?: string;
      strategy?: OmpPlanFinalizationStrategy;
      executionModel?: { provider: string; modelId: string };
      thinkingLevel?: OmpThinkingLevel;
    })
  | (OmpCommandId & { type: "reject_plan_proposal"; feedback?: string })
  // Work modes — goal
  | (OmpCommandId & { type: "create_goal"; objective: string; tokenBudget?: number })
  | (OmpCommandId & { type: "pause_goal" })
  | (OmpCommandId & { type: "resume_goal" })
  | (OmpCommandId & { type: "switch_goal"; objective: string; tokenBudget?: number })
  | (OmpCommandId & { type: "clear_goal" })
  | (OmpCommandId & { type: "set_goal_budget"; tokenBudget: number | null })
  | (OmpCommandId & { type: "get_goal_state" })
  | (OmpCommandId & { type: "begin_guided_goal"; initialObjective?: string })
  // Work modes — vibe
  | (OmpCommandId & { type: "enter_vibe_mode" })
  | (OmpCommandId & { type: "exit_vibe_mode" })
  | (OmpCommandId & { type: "get_vibe_mode_state" })
  // Work modes — combined
  | (OmpCommandId & { type: "get_work_mode_state" })
  // Runtime control — loop
  | (OmpCommandId & {
      type: "enable_loop";
      prompt: string;
      action?: "prompt" | "compact" | "reset";
      count?: number;
      durationMs?: number;
    })
  | (OmpCommandId & { type: "disable_loop" })
  | (OmpCommandId & { type: "get_loop_state" })
  | (OmpCommandId & { type: "cancel_loop_iteration" })
  // Runtime control — pause / session tree
  | (OmpCommandId & { type: "pause_agents" })
  | (OmpCommandId & { type: "resume_agents" })
  | (OmpCommandId & { type: "get_pause_state" })
  | (OmpCommandId & { type: "get_session_tree" })
  // Agent control
  | (OmpCommandId & { type: "get_controllable_agents" })
  | (OmpCommandId & { type: "revive_agent"; agentId: string })
  | (OmpCommandId & { type: "kill_agent"; agentId: string })
  | (OmpCommandId & { type: "prompt_agent"; agentId: string; text: string })
  | (OmpCommandId & { type: "spawn_background_agent"; work: string })
  // Queue modes
  | (OmpCommandId & { type: "set_steering_mode"; mode: "all" | "one-at-a-time" })
  | (OmpCommandId & { type: "set_follow_up_mode"; mode: "all" | "one-at-a-time" })
  | (OmpCommandId & { type: "set_interrupt_mode"; mode: "immediate" | "wait" })
  | (OmpCommandId & { type: "get_queued_messages" })
  | (OmpCommandId & { type: "pop_queued_message" })
  | (OmpCommandId & { type: "clear_queue" })
  // Compaction / retry
  | (OmpCommandId & { type: "compact"; customInstructions?: string })
  | (OmpCommandId & { type: "set_auto_compaction"; enabled: boolean })
  | (OmpCommandId & { type: "retry" })
  | (OmpCommandId & { type: "set_auto_retry"; enabled: boolean })
  | (OmpCommandId & { type: "abort_retry" })
  // Prompting (extended)
  | (OmpCommandId & { type: "abort_and_prompt"; message: string; images?: OmpImageContent[] })
  | (OmpCommandId & { type: "new_session"; parentSession?: string })
  // Session
  | (OmpCommandId & { type: "get_session_stats" })
  | (OmpCommandId & { type: "switch_session"; sessionPath: string })
  | (OmpCommandId & { type: "get_sessions"; scope?: "cwd" | "all"; cwd?: string; query?: string; limit?: number })
  | (OmpCommandId & { type: "delete_session"; sessionPath: string })
  | (OmpCommandId & { type: "set_session_name"; name: string })
  | (OmpCommandId & { type: "generate_title"; text: string })
  | (OmpCommandId & { type: "handoff"; customInstructions?: string })
  // Messages
  | (OmpCommandId & { type: "get_messages" })
  | (OmpCommandId & { type: "get_messages_page"; cursor?: string; limit?: number })
  // Settings
  | (OmpCommandId & { type: "get_settings" })
  | (OmpCommandId & { type: "set_setting"; path: string; value: unknown })
  // Todos
  | (OmpCommandId & { type: "set_todos"; phases: Array<{ phase: string; items: string[] }> })
  | OmpExtensionUiResponse;

/** Renderer request for a process owned by a persisted Harnss session. */
export interface OmpStartOptions {
  sessionId: string;
  cwd: string;
  resumeSession?: string;
  approvalMode?: OmpApprovalMode;
}

/** Result returned from each renderer-to-main OMP invoke. */
export interface OmpInvokeResult {
  error?: string;
  data?: unknown;
}

/** Raw OMP frame correlated to its Harnss session. */
export type OmpSessionFrame = OmpRpcFrame & { _sessionId: string };

/** OMP stderr chunk correlated to its Harnss session. */
export interface OmpStderrEvent {
  _sessionId: string;
  data: string;
}

/** OMP process exit correlated to its Harnss session. */
export interface OmpExitEvent {
  _sessionId: string;
  code: number | null;
  signal: string | null;
  error?: string;
}
