import type {
  ContextUsage,
  ImageAttachment,
  ModelInfo,
  PermissionRequest,
  SessionInfo,
  SlashCommand,
  ToolUseResult,
  UIMessage,
} from "@/types";
import { createSystemMessage, nextId } from "@/lib/message-factory";
import { mergeStreamingChunk } from "@/lib/engine/streaming-buffer";
import type {
  OmpGoalModeSnapshot,
  OmpImageContent,
  OmpLoopState,
  OmpPlanModeSnapshot,
  OmpRpcCommand,
  OmpRpcFrame,
  OmpThinkingLevel,
  OmpVibeModeSnapshot,
  OmpWorkModeSnapshot,
} from "@shared/types/omp";

const WIRE_THINKING_LEVELS: OmpThinkingLevel[] = [
  "inherit",
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];
const DEFAULT_THINKING_LEVELS = WIRE_THINKING_LEVELS.filter((level) => level !== "inherit");

const OMP_TOOL_NAMES: Record<string, string> = {
  ask: "AskUserQuestion",
  bash: "Bash",
  edit: "Edit",
  glob: "Glob",
  goal: "Goal",
  grep: "Grep",
  read: "Read",
  skill: "Skill",
  task: "Task",
  think: "Think",
  todo: "TodoWrite",
  tool_search: "ToolSearch",
  web_fetch: "WebFetch",
  web_search: "WebSearch",
  write: "Write",
};

type UnknownRecord = Record<string, unknown>;

export interface OmpModel {
  provider: string;
  id: string;
  name?: string;
  reasoning?: boolean;
  thinkingLevels?: OmpThinkingLevel[];
}

export interface OmpRuntimeState {
  messages: UIMessage[];
  isProcessing: boolean;
  isConnected: boolean;
  isCompacting: boolean;
  isRetrying: boolean;
  isBashRunning: boolean;
  isAborting: boolean;
  isGeneratingHandoff: boolean;
  sessionInfo: SessionInfo | null;
  totalCost: number;
  contextUsage: ContextUsage | null;
  pendingPermission: PermissionRequest | null;
  slashCommands: SlashCommand[];
  supportedModels: ModelInfo[];
  ompModels: OmpModel[];
  thinkingLevels: OmpThinkingLevel[];
  thinkingLevel: OmpThinkingLevel | undefined;
  steeringMode: "all" | "one-at-a-time";
  followUpMode: "all" | "one-at-a-time";
  interruptMode: "immediate" | "wait";
  autoCompactionEnabled: boolean;
  queuedMessageCount: number;
  ompStreamingMessageId: string | null;
  ompToolMessageIds: Map<string, string>;
  ompCompletedAssistantCosts: Set<string>;
  ompCompletedAssistantMessages: Set<string>;
  ompSubagentParentToolIds: Map<string, string>;
  // Work mode state (plan / goal / vibe / loop)
  workMode: OmpWorkModeSnapshot | null;
  planMode: OmpPlanModeSnapshot | null;
  goalMode: OmpGoalModeSnapshot | null;
  vibeMode: OmpVibeModeSnapshot | null;
  loopState: OmpLoopState | null;
}

export interface OmpFrameApplyOptions {
  cwd?: string;
  logicalSessionId?: string;
}

export interface OmpFrameApplyResult {
  changed: boolean;
  streaming: boolean;
  processingChanged: boolean;
  permissionRequested?: PermissionRequest;
}

export interface OmpRuntimeSeed {
  messages?: UIMessage[];
  isProcessing?: boolean;
  isConnected?: boolean;
  isCompacting?: boolean;
  isRetrying?: boolean;
  isBashRunning?: boolean;
  isAborting?: boolean;
  isGeneratingHandoff?: boolean;
  sessionInfo?: SessionInfo | null;
  totalCost?: number;
  contextUsage?: ContextUsage | null;
  pendingPermission?: PermissionRequest | null;
  slashCommands?: SlashCommand[];
  supportedModels?: ModelInfo[];
  ompModels?: OmpModel[];
  thinkingLevels?: OmpThinkingLevel[];
  thinkingLevel?: OmpThinkingLevel;
  steeringMode?: "all" | "one-at-a-time";
  followUpMode?: "all" | "one-at-a-time";
  interruptMode?: "immediate" | "wait";
  autoCompactionEnabled?: boolean;
  queuedMessageCount?: number;
  workMode?: OmpWorkModeSnapshot | null;
  planMode?: OmpPlanModeSnapshot | null;
  goalMode?: OmpGoalModeSnapshot | null;
  vibeMode?: OmpVibeModeSnapshot | null;
  loopState?: OmpLoopState | null;
}

export function createOmpRuntimeState(seed: OmpRuntimeSeed = {}): OmpRuntimeState {
  const messages = seed.messages ?? [];
  const streamingMessage = messages.findLast((message) => message.role === "assistant" && message.isStreaming);
  const toolMessageIds = new Map<string, string>();
  const subagentParentToolIds = new Map<string, string>();
  for (const message of messages) {
    if (message.role === "tool_call" && message.id.startsWith("omp-tool-")) {
      toolMessageIds.set(message.id.slice("omp-tool-".length), message.id);
    }
    if (message.role === "tool_call" && message.subagentId) {
      subagentParentToolIds.set(message.subagentId, message.id);
    }
  }
  return {
    messages,
    isProcessing: seed.isProcessing ?? false,
    isConnected: seed.isConnected ?? false,
    isCompacting: seed.isCompacting ?? false,
    isRetrying: seed.isRetrying ?? false,
    isBashRunning: seed.isBashRunning ?? false,
    isAborting: seed.isAborting ?? false,
    isGeneratingHandoff: seed.isGeneratingHandoff ?? false,
    sessionInfo: seed.sessionInfo ?? null,
    totalCost: seed.totalCost ?? 0,
    contextUsage: seed.contextUsage ?? null,
    pendingPermission: seed.pendingPermission ?? null,
    slashCommands: seed.slashCommands ?? [],
    supportedModels: seed.supportedModels ?? [],
    ompModels: seed.ompModels ?? [],
    thinkingLevels: seed.thinkingLevels ?? DEFAULT_THINKING_LEVELS,
    thinkingLevel: seed.thinkingLevel,
    steeringMode: seed.steeringMode ?? "all",
    followUpMode: seed.followUpMode ?? "all",
    interruptMode: seed.interruptMode ?? "immediate",
    autoCompactionEnabled: seed.autoCompactionEnabled ?? true,
    queuedMessageCount: seed.queuedMessageCount ?? 0,
    ompStreamingMessageId: streamingMessage?.id ?? null,
    ompToolMessageIds: toolMessageIds,
    ompSubagentParentToolIds: subagentParentToolIds,
    ompCompletedAssistantCosts: new Set(),
    ompCompletedAssistantMessages: new Set(),
    workMode: seed.workMode ?? null,
    planMode: seed.planMode ?? null,
    goalMode: seed.goalMode ?? null,
    vibeMode: seed.vibeMode ?? null,
    loopState: seed.loopState ?? null,
  };
}

export function imageAttachmentsToOmpImages(images?: ImageAttachment[]): OmpImageContent[] | undefined {
  if (!images?.length) return undefined;
  return images.map((image) => ({
    type: "image",
    data: image.data,
    mimeType: image.mediaType,
  }));
}

export function toOmpModelCommand(
  value: string,
): Extract<OmpRpcCommand, { type: "set_model" }> | null {
  const separator = value.indexOf("/");
  if (separator <= 0 || separator === value.length - 1) return null;
  return {
    type: "set_model",
    provider: value.slice(0, separator),
    modelId: value.slice(separator + 1),
  };
}

export function createOmpExtensionResponse(
  request: PermissionRequest,
  behavior: "allow" | "deny" | "allowForSession",
  updatedInput?: Record<string, unknown>,
): Extract<OmpRpcCommand, { type: "extension_ui_response" }> | null {
  const method = stringAt(request.toolInput, "__ompMethod");
  if (!method) return null;
  if (behavior === "deny") return { type: "extension_ui_response", id: request.requestId, cancelled: true };
  if (method === "confirm") return { type: "extension_ui_response", id: request.requestId, confirmed: true };
  const value = findExtensionAnswer(request, updatedInput);
  return value === null ? null : { type: "extension_ui_response", id: request.requestId, value };
}

export function clearOmpPermission(state: OmpRuntimeState): void {
  state.pendingPermission = null;
}
export function markOmpDisconnected(state: OmpRuntimeState, error?: string): void {
  finalizeStreamingMessage(state);
  state.isConnected = false;
  state.isProcessing = false;
  state.isCompacting = false;
  state.pendingPermission = null;
  if (error) state.messages.push(createSystemMessage(error, true));
}


export function applyOmpFrame(
  state: OmpRuntimeState,
  frame: OmpRpcFrame,
  options: OmpFrameApplyOptions = {},
): OmpFrameApplyResult {
  const wasProcessing = state.isProcessing;
  let changed = false;
  let streaming = false;
  let permissionRequested: PermissionRequest | undefined;

  switch (frame.type) {
    case "ready":
      state.isConnected = true;
      changed = true;
      break;

    case "response":
      state.isConnected = true;
      changed = applyResponse(state, frame, options);
      break;

    case "agent_start":
    case "turn_start":
      state.isConnected = true;
      state.isProcessing = true;
      changed = true;
      break;

    case "agent_end":
      state.isConnected = true;
      finalizeStreamingMessage(state);
      if (frame.isTerminal !== false) state.isProcessing = false;
      changed = true;
      break;

    case "turn_end":
      state.isConnected = true;
      changed = true;
      break;

    case "message_start":
      state.isConnected = true;
      if (messageRole(frame.message) === "assistant") {
        ensureStreamingMessage(state);
        changed = true;
      }
      break;

    case "message_update":
      state.isConnected = true;
      changed = applyMessageUpdate(state, frame);
      streaming = changed;
      break;

    case "message_end":
      state.isConnected = true;
      changed = applyMessageEnd(state, frame);
      break;

    case "tool_execution_start":
      state.isConnected = true;
      finalizeStreamingMessage(state);
      ensureToolCall(state, frame);
      changed = true;
      break;

    case "tool_execution_update":
      state.isConnected = true;
      updateToolCall(state, frame, false);
      changed = true;
      break;

    case "tool_execution_end":
      state.isConnected = true;
      updateToolCall(state, frame, true);
      changed = true;
      break;

    case "auto_compaction_start":
      state.isConnected = true;
      state.isCompacting = true;
      state.isProcessing = true;
      changed = true;
      break;

    case "auto_compaction_end":
      state.isConnected = true;
      state.isCompacting = false;
      if (frame.aborted !== true && frame.skipped !== true && !stringAt(frame, "errorMessage")) {
        state.messages.push({
          id: nextId("omp-compact"),
          role: "summary",
          content: "上下文已压缩",
          timestamp: Date.now(),
          compactTrigger: "auto",
        });
      }
      const compactionError = stringAt(frame, "errorMessage");
      if (compactionError) state.messages.push(createSystemMessage(compactionError, true));
      changed = true;
      break;

    case "available_commands_update":
      state.isConnected = true;
      state.slashCommands = normalizeSlashCommands(frame.commands);
      changed = true;
      break;

    case "command_output": {
      state.isConnected = true;
      const text = stringAt(frame, "text");
      if (text) state.messages.push(createSystemMessage(text));
      changed = !!text;
      break;
    }

    case "extension_ui_request": {
      state.isConnected = true;
      const request = extensionPermission(frame);
      if (request) {
        state.pendingPermission = request;
        permissionRequested = request;
      } else if (stringAt(frame, "method") === "notify") {
        const message = stringAt(frame, "message");
        if (message) state.messages.push(createSystemMessage(message, stringAt(frame, "notifyType") === "error"));
      } else if (stringAt(frame, "method") === "open_url") {
        const message = stringAt(frame, "instructions") ?? stringAt(frame, "launchUrl") ?? stringAt(frame, "url");
        if (message) state.messages.push(createSystemMessage(message));
      } else if (stringAt(frame, "method") === "cancel") {
        const targetId = stringAt(frame, "targetId");
        if (targetId && state.pendingPermission?.requestId === targetId) state.pendingPermission = null;
      }
      changed = true;
      break;
    }

    case "subagent_lifecycle":
      state.isConnected = true;
      changed = applySubagentLifecycle(state, frame);
      break;

    case "subagent_progress":
      state.isConnected = true;
      changed = applySubagentProgress(state, frame);
      break;

    case "subagent_event":
      state.isConnected = true;
      changed = applySubagentEvent(state, frame);
      break;

    case "notice": {
      state.isConnected = true;
      const message = stringAt(frame, "message");
      if (message) state.messages.push(createSystemMessage(message, stringAt(frame, "level") === "error"));
      changed = !!message;
      break;
    }

    case "extension_error": {
      state.isConnected = true;
      const message = stringAt(frame, "error");
      if (message) state.messages.push(createSystemMessage(message, true));
      changed = !!message;
      break;
    }

    case "prompt_result":
      state.isConnected = true;
      if (frame.agentInvoked === false) state.isProcessing = false;
      changed = true;
      break;

    case "thinking_level_changed": {
      state.isConnected = true;
      const level = asThinkingLevel(frame.thinkingLevel);
      if (level) state.thinkingLevel = level;
      changed = !!level;
      break;
    }

    case "session_info_update":
    case "config_update":
      state.isConnected = true;
      changed = applySessionSideChannel(state, frame, options);
      break;


    case "goal_updated": {
      state.isConnected = true;
      const goalData = asRecord(frame.goal);
      const goalState = asRecord(frame.state);
      if (goalData || goalState) {
        state.goalMode = {
          enabled: goalState?.enabled === true,
          paused: goalData?.status === "paused",
          mode: typeof goalState?.mode === "string" ? (goalState.mode as "active" | "exiting") : null,
          reason: goalState?.reason === "completed" ? "completed" : null,
          goal: goalData
            ? {
                id: String(goalData.id ?? ""),
                objective: String(goalData.objective ?? ""),
                status: (goalData.status as OmpGoalModeSnapshot["goal"] extends infer G ? G extends { status: infer S } ? S : never : never) ?? "active",
                tokensUsed: Number(goalData.tokensUsed ?? 0),
                timeUsedSeconds: Number(goalData.timeUsedSeconds ?? 0),
                createdAt: Number(goalData.createdAt ?? 0),
                updatedAt: Number(goalData.updatedAt ?? 0),
              }
            : null,
          budget: null,
        };
      } else {
        state.goalMode = null;
      }
      changed = true;
      break;
    }

    case "settings_update": {
      state.isConnected = true;
      const path = stringAt(frame, "path");
      const value = frame.value;
      if (path === "autoCompaction.enabled" && typeof value === "boolean") {
        state.autoCompactionEnabled = value;
      } else if (path === "queue.steeringMode" && (value === "all" || value === "one-at-a-time")) {
        state.steeringMode = value;
      } else if (path === "queue.followUpMode" && (value === "all" || value === "one-at-a-time")) {
        state.followUpMode = value;
      } else if (path === "queue.interruptMode" && (value === "immediate" || value === "wait")) {
        state.interruptMode = value;
      }
      changed = true;
      break;
    }

    case "prompt_result": {
      state.isConnected = true;
      if (frame.agentInvoked === false) state.isProcessing = false;
      changed = true;
      break;
    }

    case "exec_output": {
      state.isConnected = true;
      if (frame.source === "bash") state.isBashRunning = true;
      changed = true;
      break;
    }

    case "context_message_added": {
      state.isConnected = true;
      const content = stringAt(frame, "content") ?? stringAt(frame, "text");
      if (content) {
        state.messages.push(createSystemMessage(content, false));
        changed = true;
      }
      break;
    }

    case "idle_recap": {
      state.isConnected = true;
      const recap = stringAt(frame, "recap");
      if (recap) {
        state.messages.push(createSystemMessage(`[Idle Recap] ${recap}`, false));
        changed = true;
      }
      break;
    }

    case "error":
    case "rpc_frame_error": {
      state.isConnected = true;
      const message = stringAt(frame, "error") ?? stringAt(frame, "message");
      if (message) state.messages.push(createSystemMessage(message, true));
      changed = !!message;
      break;
    }
  }

  return {
    changed,
    streaming,
    processingChanged: wasProcessing !== state.isProcessing,
    permissionRequested,
  };
}

function applyResponse(state: OmpRuntimeState, frame: OmpRpcFrame, options: OmpFrameApplyOptions): boolean {
  if (frame.success !== true) {
    const command = stringAt(frame, "command") ?? "命令";
    const error = stringAt(frame, "error") ?? "未知的 OMP 错误";
    state.messages.push(createSystemMessage(`OMP ${command}：${error}`, true));
    return true;
  }

  const command = stringAt(frame, "command");
  const data = recordAt(frame, "data");
  switch (command) {
    case "get_state":
      if (!data) return false;
      applySessionState(state, data, options);
      return true;
    case "get_available_models":
      if (!data) return false;
      applyAvailableModels(state, data.models);
      return true;
    case "get_available_commands":
      if (!data) return false;
      state.slashCommands = normalizeSlashCommands(data.commands);
      return true;
    case "set_model":
      if (!data) return false;
      applyModel(state, data);
      return true;
    case "compact":
      state.isCompacting = false;
      state.isProcessing = false;
      state.messages.push({
        id: nextId("omp-compact"),
        role: "summary",
        content: "上下文已压缩",
        timestamp: Date.now(),
        compactTrigger: "manual",
      });
      return true;
    case "prompt":
      if (data?.agentInvoked === false) state.isProcessing = false;
      return true;
    // Work mode responses — update cached snapshots
    case "get_work_mode_state":
      if (data) state.workMode = data as unknown as OmpWorkModeSnapshot;
      return true;
    case "enter_plan_mode":
    case "pause_plan_mode":
    case "resume_plan_mode":
    case "exit_plan_mode":
    case "get_plan_mode_state":
      if (data) state.planMode = data as unknown as OmpPlanModeSnapshot;
      return true;
    case "submit_plan_review":
      return true;
    case "approve_plan_proposal":
    case "reject_plan_proposal":
      if (data) {
        const decisionState = recordAt(data, "state");
        if (decisionState) state.planMode = decisionState as unknown as OmpPlanModeSnapshot;
      }
      return true;
    case "create_goal":
    case "pause_goal":
    case "resume_goal":
    case "switch_goal":
    case "clear_goal":
    case "set_goal_budget":
    case "get_goal_state":
      if (data) state.goalMode = data as unknown as OmpGoalModeSnapshot;
      return true;
    case "enter_vibe_mode":
    case "exit_vibe_mode":
    case "get_vibe_mode_state":
      if (data) state.vibeMode = data as unknown as OmpVibeModeSnapshot;
      return true;
    case "enable_loop":
    case "disable_loop":
    case "get_loop_state":
    case "cancel_loop_iteration":
      if (data) state.loopState = data as unknown as OmpLoopState;
      return true;
    default:
      return false;
  }
}

function applySessionState(state: OmpRuntimeState, data: UnknownRecord, options: OmpFrameApplyOptions): void {
  const model = recordAt(data, "model");
  const modelValue = model ? modelSelector(model) : state.sessionInfo?.model;
  const sessionId = stringAt(data, "sessionId") ?? state.sessionInfo?.sessionId ?? options.logicalSessionId;
  const cwd = options.cwd ?? state.sessionInfo?.cwd;
  if (sessionId && cwd !== undefined) {
    state.sessionInfo = {
      sessionId,
      model: modelValue ?? "",
      cwd,
      tools: stringNames(data.dumpTools) ?? state.sessionInfo?.tools ?? [],
      version: state.sessionInfo?.version || "omp",
      ...(state.sessionInfo?.permissionMode ? { permissionMode: state.sessionInfo.permissionMode } : {}),
      ...(stringAt(data, "sessionFile") ? { agentName: stringAt(data, "sessionFile") } : state.sessionInfo?.agentName ? { agentName: state.sessionInfo.agentName } : {}),
    };
  }
  if (model) applyModel(state, model);
  const thinkingLevel = asThinkingLevel(data.thinkingLevel);
  if (thinkingLevel) state.thinkingLevel = thinkingLevel;
  if (typeof data.isStreaming === "boolean") state.isProcessing = data.isStreaming;
  if (typeof data.isCompacting === "boolean") state.isCompacting = data.isCompacting;
  if (typeof data.isRetrying === "boolean") state.isRetrying = data.isRetrying;
  if (typeof data.isBashRunning === "boolean") state.isBashRunning = data.isBashRunning;
  if (typeof data.isAborting === "boolean") state.isAborting = data.isAborting;
  if (typeof data.isGeneratingHandoff === "boolean") state.isGeneratingHandoff = data.isGeneratingHandoff;
  if (typeof data.autoCompactionEnabled === "boolean") state.autoCompactionEnabled = data.autoCompactionEnabled;
  if (typeof data.queuedMessageCount === "number") state.queuedMessageCount = data.queuedMessageCount;
  if (data.steeringMode === "all" || data.steeringMode === "one-at-a-time") state.steeringMode = data.steeringMode;
  if (data.followUpMode === "all" || data.followUpMode === "one-at-a-time") state.followUpMode = data.followUpMode;
  if (data.interruptMode === "immediate" || data.interruptMode === "wait") state.interruptMode = data.interruptMode;
  const contextUsage = recordAt(data, "contextUsage");
  if (contextUsage) state.contextUsage = normalizeContextUsage(contextUsage, state.contextUsage);
}

function applySessionSideChannel(state: OmpRuntimeState, frame: OmpRpcFrame, options: OmpFrameApplyOptions): boolean {
  const data = recordAt(frame, "data") ?? frame;
  const model = recordAt(data, "model");
  const thinkingLevel = asThinkingLevel(data.thinkingLevel);
  let changed = false;
  if (model && modelSelector(model)) {
    applyModel(state, model);
    changed = true;
  }
  if (thinkingLevel) {
    state.thinkingLevel = thinkingLevel;
    changed = true;
  }

  const sessionFile = stringAt(data, "sessionFile");
  const sessionId = stringAt(data, "sessionId");
  const sessionName = stringAt(data, "sessionName");
  if (!sessionFile && !sessionId && !sessionName) return changed;
  const current = state.sessionInfo;
  const nextSessionId = sessionId ?? current?.sessionId ?? options.logicalSessionId;
  const cwd = options.cwd ?? current?.cwd;
  if (!nextSessionId || cwd === undefined) return changed;
  state.sessionInfo = {
    sessionId: nextSessionId,
    model: current?.model ?? "",
    cwd,
    tools: current?.tools ?? [],
    version: current?.version ?? "omp",
    ...(current?.permissionMode ? { permissionMode: current.permissionMode } : {}),
    ...(sessionFile ? { agentName: sessionFile } : current?.agentName ? { agentName: current.agentName } : {}),
  };
  return true;
}

function applyAvailableModels(state: OmpRuntimeState, value: unknown): void {
  if (!Array.isArray(value)) return;
  const models = value.flatMap((item) => {
    const model = normalizeOmpModel(item);
    return model ? [model] : [];
  });
  state.ompModels = models;
  state.supportedModels = models.map(modelToModelInfo);
  const current = state.sessionInfo?.model;
  const currentModel = current ? models.find((model) => `${model.provider}/${model.id}` === current) : undefined;
  if (currentModel?.thinkingLevels?.length) state.thinkingLevels = currentModel.thinkingLevels;
}

function applyModel(state: OmpRuntimeState, value: UnknownRecord): void {
  const selector = modelSelector(value);
  if (!selector) return;
  const model = normalizeOmpModel(value);
  if (model?.thinkingLevels?.length) state.thinkingLevels = model.thinkingLevels;
  if (state.sessionInfo) state.sessionInfo = { ...state.sessionInfo, model: selector };
}

function applyMessageUpdate(state: OmpRuntimeState, frame: OmpRpcFrame): boolean {
  const event = recordAt(frame, "assistantMessageEvent");
  if (!event) return false;
  const type = stringAt(event, "type");
  const messageId = ensureStreamingMessage(state);
  const text = type === "text_delta" ? stringAt(event, "delta") : type === "text_end" ? stringAt(event, "content") : undefined;
  const thinking = type === "thinking_delta" ? stringAt(event, "delta") : type === "thinking_end" ? stringAt(event, "content") : undefined;

  if (text !== undefined || thinking !== undefined) {
    updateMessage(state, messageId, (message) => ({
      ...message,
      ...(text !== undefined ? {
        content: mergeStreamingChunk(message.content, text),
        ...(message.thinking ? { thinkingComplete: true } : {}),
      } : {}),
      ...(thinking !== undefined ? { thinking: mergeStreamingChunk(message.thinking ?? "", thinking) } : {}),
      ...(type === "thinking_end" ? { thinkingComplete: true } : {}),
    }));
    return true;
  }

  if (type === "done" || type === "error") {
    const finalMessage = recordAt(event, type === "done" ? "message" : "error") ?? recordAt(frame, "message");
    if (finalMessage) completeAssistantMessage(state, finalMessage);
    if (type === "error") {
      const error = stringAt(finalMessage ?? event, "errorMessage");
      if (error) state.messages.push(createSystemMessage(error, true));
    }
    return true;
  }
  return type === "start" || type === "text_start" || type === "thinking_start" || type === "toolcall_start" || type === "toolcall_delta" || type === "toolcall_end";
}

function applyMessageEnd(state: OmpRuntimeState, frame: OmpRpcFrame): boolean {
  const message = recordAt(frame, "message");
  if (!message) return false;
  switch (stringAt(message, "role")) {
    case "assistant":
      completeAssistantMessage(state, message);
      return true;
    case "toolResult": {
      const toolCallId = stringAt(message, "toolCallId");
      if (!toolCallId) return false;
      const toolName = stringAt(message, "toolName") ?? "工具";
      const result = normalizeOmpToolResult(message);
      ensureToolCall(state, { type: "tool_execution_start", toolCallId, toolName, args: {} });
      updateMessage(state, toolMessageId(state, toolCallId), (tool) => ({
        ...tool,
        ...(result ? { toolResult: result } : {}),
        toolError: message.isError === true || undefined,
      }));
      return true;
    }
    default:
      return false;
  }
}

function completeAssistantMessage(state: OmpRuntimeState, message: UnknownRecord): void {
  const text = assistantContent(message, "text");
  const thinking = assistantContent(message, "thinking");
  const completionKey = assistantCompletionKey(message);
  if (completionKey && state.ompCompletedAssistantMessages.has(completionKey)) return;
  if (completionKey) state.ompCompletedAssistantMessages.add(completionKey);
  const streamingId = state.ompStreamingMessageId;
  if (streamingId) {
    const stream = state.messages.find((item) => item.id === streamingId);
    if (stream) {
      if (!text && !thinking && !stream.content && !stream.thinking) {
        state.messages = state.messages.filter((item) => item.id !== streamingId);
      } else {
        updateMessage(state, streamingId, (item) => ({
          ...item,
          ...(text ? { content: text } : {}),
          ...(thinking ? { thinking, thinkingComplete: true } : item.thinking ? { thinkingComplete: true } : {}),
          isStreaming: false,
        }));
      }
    }
    state.ompStreamingMessageId = null;
  } else if (text || thinking) {
    state.messages.push({
      id: nextId("omp-assistant"),
      role: "assistant",
      content: text,
      ...(thinking ? { thinking, thinkingComplete: true } : {}),
      timestamp: timestampAt(message),
    });
  }

  for (const toolCall of assistantToolCalls(message)) {
    ensureToolCall(state, {
      type: "tool_execution_start",
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      args: toolCall.arguments,
    });
  }
  applyAssistantUsage(state, message);
}

function ensureStreamingMessage(state: OmpRuntimeState): string {
  if (state.ompStreamingMessageId) return state.ompStreamingMessageId;
  const id = nextId("omp-stream");
  state.ompStreamingMessageId = id;
  state.messages.push({ id, role: "assistant", content: "", isStreaming: true, timestamp: Date.now() });
  return id;
}

function finalizeStreamingMessage(state: OmpRuntimeState): void {
  const id = state.ompStreamingMessageId;
  if (!id) return;
  const message = state.messages.find((item) => item.id === id);
  if (message && !message.content && !message.thinking) {
    state.messages = state.messages.filter((item) => item.id !== id);
  } else if (message) {
    updateMessage(state, id, (item) => ({
      ...item,
      isStreaming: false,
      ...(item.thinking ? { thinkingComplete: true } : {}),
    }));
  }
  state.ompStreamingMessageId = null;
}

function ensureToolCall(state: OmpRuntimeState, frame: UnknownRecord): void {
  const toolCallId = stringAt(frame, "toolCallId");
  if (!toolCallId) return;
  const id = toolMessageId(state, toolCallId);
  if (state.messages.some((message) => message.id === id)) return;
  const toolName = normalizeToolName(stringAt(frame, "toolName") ?? "工具");
  const input = normalizeToolInput(toolName, frame.args);
  const task = toolName === "Task" || toolName === "Agent";
  state.messages.push({
    id,
    role: "tool_call",
    content: "",
    toolName,
    toolInput: input,
    ...(task ? { subagentSteps: [], subagentStatus: "running" as const } : {}),
    timestamp: Date.now(),
  });
}

function updateToolCall(state: OmpRuntimeState, frame: UnknownRecord, completed: boolean): void {
  const toolCallId = stringAt(frame, "toolCallId");
  if (!toolCallId) return;
  ensureToolCall(state, frame);
  const id = toolMessageId(state, toolCallId);
  const result = normalizeOmpToolResult(completed ? frame.result : frame.partialResult);
  updateMessage(state, id, (message) => ({
    ...message,
    toolInput: normalizeToolInput(message.toolName ?? normalizeToolName(stringAt(frame, "toolName") ?? "工具"), frame.args),
    ...(result ? { toolResult: result } : {}),
    ...(completed ? { toolError: frame.isError === true || undefined } : {}),
    ...((message.toolName === "Task" || message.toolName === "Agent") && completed
      ? { subagentStatus: "completed" as const }
      : {}),
  }));
}

function applySubagentLifecycle(state: OmpRuntimeState, frame: OmpRpcFrame): boolean {
  const payload = recordAt(frame, "payload");
  if (!payload) return false;
  const parentId = stringAt(payload, "parentToolCallId");
  if (!parentId) return false;
  const id = toolMessageId(state, parentId);
  const status = stringAt(payload, "status");
  const subagentId = stringAt(payload, "id");
  updateMessage(state, id, (message) => ({
    ...message,
    ...(subagentId ? { subagentId } : {}),
    subagentStatus: status === "started" ? "running" : "completed",
  }));
  if (subagentId) state.ompSubagentParentToolIds.set(subagentId, id);
  return true;
}

function applySubagentProgress(state: OmpRuntimeState, frame: OmpRpcFrame): boolean {
  const payload = recordAt(frame, "payload");
  const progress = payload ? recordAt(payload, "progress") : null;
  const parentId = payload ? stringAt(payload, "parentToolCallId") : undefined;
  if (!progress || !parentId) return false;
  const id = toolMessageId(state, parentId);
  const subagentId = stringAt(progress, "id");
  const status = stringAt(progress, "status");
  updateMessage(state, id, (message) => ({
    ...message,
    ...(subagentId ? { subagentId } : {}),
    ...(numberAt(progress, "durationMs") !== undefined ? { subagentDurationMs: numberAt(progress, "durationMs") } : {}),
    ...(numberAt(progress, "tokens") !== undefined ? { subagentTokens: numberAt(progress, "tokens") } : {}),
    ...(status === "running" || status === "pending" ? { subagentStatus: "running" as const } : { subagentStatus: "completed" as const }),
  }));
  if (subagentId) state.ompSubagentParentToolIds.set(subagentId, id);
  return true;
}

function applySubagentEvent(state: OmpRuntimeState, frame: OmpRpcFrame): boolean {
  const payload = recordAt(frame, "payload");
  const subagentId = payload ? stringAt(payload, "id") : undefined;
  const event = payload ? recordAt(payload, "event") : null;
  const parentMessageId = subagentId ? state.ompSubagentParentToolIds.get(subagentId) : undefined;
  if (!event || !parentMessageId) return false;
  const type = stringAt(event, "type");
  if (!type?.startsWith("tool_execution_")) return false;
  const toolCallId = stringAt(event, "toolCallId");
  if (!toolCallId) return false;
  const stepId = `omp-subagent-${subagentId}-${toolCallId}`;
  const toolName = normalizeToolName(stringAt(event, "toolName") ?? "工具");
  const result = normalizeOmpToolResult(type === "tool_execution_end" ? event.result : event.partialResult);
  updateMessage(state, parentMessageId, (message) => {
    const steps = message.subagentSteps ?? [];
    const existing = steps.find((step) => step.toolUseId === stepId);
    const step = {
      toolUseId: stepId,
      toolName,
      toolInput: normalizeToolInput(toolName, event.args),
      ...(result ? { toolResult: result } : existing?.toolResult ? { toolResult: existing.toolResult } : {}),
      ...(type === "tool_execution_end" ? { toolError: event.isError === true || undefined } : existing?.toolError ? { toolError: existing.toolError } : {}),
    };
    return {
      ...message,
      subagentSteps: existing
        ? steps.map((candidate) => candidate.toolUseId === stepId ? step : candidate)
        : [...steps, step],
    };
  });
  return true;
}

function extensionPermission(frame: OmpRpcFrame): PermissionRequest | null {
  const id = stringAt(frame, "id");
  const method = stringAt(frame, "method");
  if (!id || !method || !["select", "confirm", "input", "editor"].includes(method)) return null;
  const title = stringAt(frame, "title") ?? "扩展请求";
  const toolUseId = `omp-extension-${id}`;
  if (method === "confirm") {
    return {
      requestId: id,
      toolName: "OMP Confirm",
      toolInput: {
        __ompMethod: method,
        title,
        message: stringAt(frame, "message") ?? "",
      },
      toolUseId,
      decisionReason: stringAt(frame, "message"),
    };
  }
  const options = method === "select" && Array.isArray(frame.options)
    ? frame.options.filter((option): option is string => typeof option === "string").map((label) => ({ label }))
    : undefined;
  return {
    requestId: id,
    toolName: "AskUserQuestion",
    toolInput: {
      __ompMethod: method,
      title,
      placeholder: stringAt(frame, "placeholder"),
      prefill: stringAt(frame, "prefill"),
      questions: [{
        id,
        question: title,
        ...(options ? { options } : {}),
        multiSelect: false,
      }],
    },
    toolUseId,
  };
}

function findExtensionAnswer(request: PermissionRequest, updatedInput?: Record<string, unknown>): string | null {
  const input = updatedInput ?? request.toolInput;
  const answersByQuestionId = recordAt(input, "answersByQuestionId");
  const answers = recordAt(input, "answers");
  const questions = Array.isArray(request.toolInput.questions) ? request.toolInput.questions : [];
  const question = questions[0] && asRecord(questions[0]);
  const key = question ? stringAt(question, "question") : undefined;
  const candidate = answersByQuestionId?.[request.requestId] ?? (key ? answers?.[key] : undefined) ?? input.value;
  if (Array.isArray(candidate)) {
    const first = candidate.find((value): value is string => typeof value === "string");
    return first ?? null;
  }
  return typeof candidate === "string" ? candidate : null;
}

function normalizeSlashCommands(value: unknown): SlashCommand[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const command = asRecord(entry);
    const name = command ? stringAt(command, "name") : undefined;
    if (!name) return [];
    const input = command ? recordAt(command, "input") : null;
    return [{
      name,
      description: command ? stringAt(command, "description") ?? "" : "",
      argumentHint: input ? stringAt(input, "hint") : undefined,
      source: "omp" as SlashCommand["source"],
    }];
  });
}

function normalizeOmpModel(value: unknown): OmpModel | null {
  const model = asRecord(value);
  if (!model) return null;
  const provider = stringAt(model, "provider");
  const id = stringAt(model, "id");
  if (!provider || !id) return null;
  const thinking = recordAt(model, "thinking");
  const efforts = Array.isArray(thinking?.efforts)
    ? thinking.efforts.flatMap((effort) => {
      const level = asThinkingLevel(effort);
      return level ? [level] : [];
    })
    : [];
  return {
    provider,
    id,
    name: stringAt(model, "name"),
    reasoning: model.reasoning === true,
    ...(efforts.length ? { thinkingLevels: ["off", ...efforts.filter((level) => level !== "off")] } : {}),
  };
}

function modelToModelInfo(model: OmpModel): ModelInfo {
  return {
    value: `${model.provider}/${model.id}`,
    displayName: model.name ?? model.id,
    description: model.provider,
    ...(model.reasoning ? { supportsEffort: true } : {}),
  };
}

function modelSelector(model: UnknownRecord): string | undefined {
  const provider = stringAt(model, "provider");
  const id = stringAt(model, "id");
  return provider && id ? `${provider}/${id}` : undefined;
}

function normalizeContextUsage(value: UnknownRecord, previous: ContextUsage | null): ContextUsage {
  return {
    inputTokens: numberAt(value, "tokens") ?? numberAt(value, "input") ?? numberAt(value, "inputTokens") ?? previous?.inputTokens ?? 0,
    outputTokens: numberAt(value, "output") ?? numberAt(value, "outputTokens") ?? previous?.outputTokens ?? 0,
    cacheReadTokens: numberAt(value, "cacheRead") ?? numberAt(value, "cacheReadTokens") ?? previous?.cacheReadTokens ?? 0,
    cacheCreationTokens: numberAt(value, "cacheWrite") ?? numberAt(value, "cacheCreationTokens") ?? previous?.cacheCreationTokens ?? 0,
    contextWindow: numberAt(value, "contextWindow") ?? previous?.contextWindow ?? 0,
  };
}

function applyAssistantUsage(state: OmpRuntimeState, message: UnknownRecord): void {
  const usage = recordAt(message, "usage");
  if (!usage) return;
  state.contextUsage = normalizeContextUsage(usage, state.contextUsage);
  const cost = recordAt(usage, "cost");
  const total = cost ? numberAt(cost, "total") : undefined;
  if (total === undefined) return;
  const key = stringAt(message, "responseId") ?? `${timestampAt(message)}:${stringAt(message, "model") ?? ""}`;
  if (state.ompCompletedAssistantCosts.has(key)) return;
  state.ompCompletedAssistantCosts.add(key);
  state.totalCost += total;
}

function assistantContent(message: UnknownRecord, kind: "text" | "thinking"): string {
  const content = message.content;
  if (!Array.isArray(content)) return "";
  return content.flatMap((item) => {
    const block = asRecord(item);
    if (!block || stringAt(block, "type") !== kind) return [];
    const value = kind === "text" ? stringAt(block, "text") : stringAt(block, "thinking");
    return value === undefined ? [] : [value];
  }).join("");
}

function assistantToolCalls(message: UnknownRecord): Array<{ id: string; name: string; arguments: unknown }> {
  if (!Array.isArray(message.content)) return [];
  return message.content.flatMap((item) => {
    const block = asRecord(item);
    const id = block ? stringAt(block, "id") : undefined;
    const name = block ? stringAt(block, "name") : undefined;
    return block && stringAt(block, "type") === "toolCall" && id && name
      ? [{ id, name, arguments: block.arguments }]
      : [];
  });
}

function normalizeToolName(name: string): string {
  return OMP_TOOL_NAMES[name.toLowerCase()] ?? name;
}

function normalizeToolInput(toolName: string, value: unknown): Record<string, unknown> {
  const record = asRecord(value);
  const input: Record<string, unknown> = record ? { ...record } : value === undefined ? {} : { value };
  const path = stringAt(input, "path") ?? stringAt(input, "filePath");
  if (path && !stringAt(input, "file_path")) input.file_path = path;
  if (toolName === "Task" || toolName === "Agent") {
    const task = stringAt(input, "task");
    if (task) {
      input.description ??= task;
      input.prompt ??= task;
    }
  }
  if (toolName === "Grep" && !stringAt(input, "pattern")) {
    const query = stringAt(input, "query");
    if (query) input.pattern = query;
  }
  return input;
}

function normalizeOmpToolResult(value: unknown): ToolUseResult | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return { content: value, stdout: value };
  const raw = asRecord(value);
  if (!raw) return { content: String(value) };
  const output: Record<string, unknown> = { ...raw };
  const text = contentText(raw.content);
  if (text) {
    output.content = text;
    if (typeof output.stdout !== "string") output.stdout = text;
  }
  const details = asRecord(raw.details);
  if (details) {
    output.structuredContent = details;
    if (typeof output.stdout !== "string" && typeof details.stdout === "string") output.stdout = details.stdout;
    if (typeof output.stderr !== "string" && typeof details.stderr === "string") output.stderr = details.stderr;
  }
  return output as ToolUseResult;
}

function contentText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value.flatMap((item) => {
    const block = asRecord(item);
    const text = block && stringAt(block, "type") === "text" ? stringAt(block, "text") : undefined;
    return text === undefined ? [] : [text];
  }).join("\n");
}

function toolMessageId(state: OmpRuntimeState, toolCallId: string): string {
  let id = state.ompToolMessageIds.get(toolCallId);
  if (!id) {
    id = `omp-tool-${toolCallId}`;
    state.ompToolMessageIds.set(toolCallId, id);
  }
  return id;
}

function assistantCompletionKey(message: UnknownRecord): string | undefined {
  const responseId = stringAt(message, "responseId") ?? stringAt(message, "id");
  if (responseId) return `id:${responseId}`;
  const timestamp = numberAt(message, "timestamp");
  const model = stringAt(message, "model");
  return timestamp === undefined ? undefined : `timestamp:${timestamp}:${model ?? ""}`;
}

function updateMessage(state: OmpRuntimeState, id: string, update: (message: UIMessage) => UIMessage): void {
  const index = state.messages.findIndex((message) => message.id === id);
  if (index < 0) return;
  state.messages[index] = update(state.messages[index]);
}

function messageRole(value: unknown): string | undefined {
  const message = asRecord(value);
  return message ? stringAt(message, "role") : undefined;
}

function timestampAt(value: UnknownRecord): number {
  return numberAt(value, "timestamp") ?? Date.now();
}

function stringNames(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const names = value.flatMap((entry) => {
    const item = asRecord(entry);
    const name = item ? stringAt(item, "name") : undefined;
    return name ? [name] : [];
  });
  return names.length ? names : undefined;
}

function asThinkingLevel(value: unknown): OmpThinkingLevel | undefined {
  return typeof value === "string" && WIRE_THINKING_LEVELS.includes(value as OmpThinkingLevel)
    ? value as OmpThinkingLevel
    : undefined;
}

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function recordAt(value: UnknownRecord, key: string): UnknownRecord | null {
  return asRecord(value[key]);
}

function stringAt(value: UnknownRecord, key: string): string | undefined {
  const result = value[key];
  return typeof result === "string" ? result : undefined;
}

function numberAt(value: UnknownRecord, key: string): number | undefined {
  const result = value[key];
  return typeof result === "number" && Number.isFinite(result) ? result : undefined;
}
