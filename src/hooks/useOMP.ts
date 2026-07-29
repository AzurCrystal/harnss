import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type {
  AppPermissionBehavior,
  BackgroundSessionSnapshot,
  ContextUsage,
  ImageAttachment,
  ModelInfo,
  PermissionRequest,
  SessionInfo,
  SlashCommand,
  UIMessage,
} from "@/types";
import type { OmpModel, OmpRuntimeState } from "@/lib/engine/omp-adapter";
import { applyOmpFrame, clearOmpPermission, createOmpExtensionResponse, createOmpRuntimeState, imageAttachmentsToOmpImages, markOmpDisconnected, toOmpModelCommand } from "@/lib/engine/omp-adapter";
import { bgAgentStore } from "@/lib/background/agent-store";
import { createSystemMessage, createUserMessage } from "../lib/message-factory";
import { useEngineBase } from "./useEngineBase";
import type {
  OmpGoalModeSnapshot,
  OmpInvokeResult,
  OmpLoopState,
  OmpPlanModeSnapshot,
  OmpRpcCommand,
  OmpSessionFrame,
  OmpThinkingLevel,
  OmpVibeModeSnapshot,
  OmpWorkModeSnapshot,
} from "@shared/types/omp";

export interface UseOMPOptions {
  sessionId: string | null;
  cwd?: string;
  initialMessages?: UIMessage[];
  initialSupportedModels?: ModelInfo[];
  initialOmpModels?: OmpModel[];
  initialThinkingLevels?: OmpThinkingLevel[];
  initialThinkingLevel?: OmpThinkingLevel;
  initialMeta?: BackgroundSessionSnapshot | null;
  initialPermission?: PermissionRequest | null;
  initialSlashCommands?: SlashCommand[];
}

export interface OMPHookState {
  messages: UIMessage[];
  setMessages: Dispatch<SetStateAction<UIMessage[]>>;
  isProcessing: boolean;
  setIsProcessing: Dispatch<SetStateAction<boolean>>;
  isConnected: boolean;
  setIsConnected: Dispatch<SetStateAction<boolean>>;
  isCompacting: boolean;
  isRetrying: boolean;
  isBashRunning: boolean;
  isAborting: boolean;
  isGeneratingHandoff: boolean;
  sessionInfo: SessionInfo | null;
  setSessionInfo: Dispatch<SetStateAction<SessionInfo | null>>;
  totalCost: number;
  setTotalCost: Dispatch<SetStateAction<number>>;
  contextUsage: ContextUsage | null;
  pendingPermission: PermissionRequest | null;
  supportedModels: ModelInfo[];
  ompModels: readonly OmpModel[];
  slashCommands: SlashCommand[];
  thinkingLevels: OmpThinkingLevel[];
  thinkingLevel: OmpThinkingLevel | undefined;
  steeringMode: "all" | "one-at-a-time";
  followUpMode: "all" | "one-at-a-time";
  interruptMode: "immediate" | "wait";
  autoCompactionEnabled: boolean;
  queuedMessageCount: number;
  send: (text: string, images?: ImageAttachment[], displayText?: string) => Promise<boolean>;
  sendRaw: (text: string, images?: ImageAttachment[]) => Promise<boolean>;
  stop: () => Promise<void>;
  interrupt: () => Promise<void>;
  compact: () => Promise<void>;
  retry: () => Promise<OmpInvokeResult>;
  respondPermission: (
    behavior: AppPermissionBehavior,
    updatedInput?: Record<string, unknown>,
    newPermissionMode?: string,
    updatedPermissions?: unknown[],
  ) => Promise<void>;
  setPermissionMode: (mode: string) => Promise<void>;
  setModel: (value?: string) => Promise<OmpInvokeResult>;
  setThinkingLevel: (level: OmpThinkingLevel) => Promise<OmpInvokeResult>;
  flushNow: () => void;
  // Work mode state
  workMode: OmpWorkModeSnapshot | null;
  planMode: OmpPlanModeSnapshot | null;
  goalMode: OmpGoalModeSnapshot | null;
  vibeMode: OmpVibeModeSnapshot | null;
  loopState: OmpLoopState | null;
  // Work mode actions
  enterPlanMode: (planFilePath?: string) => Promise<OmpInvokeResult>;
  exitPlanMode: () => Promise<OmpInvokeResult>;
  pausePlanMode: () => Promise<OmpInvokeResult>;
  resumePlanMode: () => Promise<OmpInvokeResult>;
  submitPlanReview: (title?: string) => Promise<OmpInvokeResult>;
  approvePlanProposal: (strategy?: string, editedContent?: string) => Promise<OmpInvokeResult>;
  rejectPlanProposal: (feedback?: string) => Promise<OmpInvokeResult>;
  createGoal: (objective: string, tokenBudget?: number) => Promise<OmpInvokeResult>;
  pauseGoal: () => Promise<OmpInvokeResult>;
  resumeGoal: () => Promise<OmpInvokeResult>;
  switchGoal: (objective: string, tokenBudget?: number) => Promise<OmpInvokeResult>;
  clearGoal: () => Promise<OmpInvokeResult>;
  setGoalBudget: (tokenBudget: number | null) => Promise<OmpInvokeResult>;
  beginGuidedGoal: (initialObjective?: string) => Promise<OmpInvokeResult>;
  enterVibeMode: () => Promise<OmpInvokeResult>;
  exitVibeMode: () => Promise<OmpInvokeResult>;
  enableLoop: (prompt: string, count?: number) => Promise<OmpInvokeResult>;
  disableLoop: () => Promise<OmpInvokeResult>;
  refreshWorkModeState: () => Promise<OmpInvokeResult>;
  // Runtime control
  pauseAgents: () => Promise<OmpInvokeResult>;
  resumeAgents: () => Promise<OmpInvokeResult>;
  // Session
  newSession: (parentSession?: string) => Promise<OmpInvokeResult>;
  abortAndPrompt: (message: string, images?: ImageAttachment[]) => Promise<OmpInvokeResult>;
  // Queue
  getQueuedMessages: () => Promise<OmpInvokeResult>;
  popQueuedMessage: () => Promise<OmpInvokeResult>;
  clearQueue: () => Promise<OmpInvokeResult>;
}

function commandErrorKey(command: string, error: string): string {
  return `${command}\u0000${error}`;
}

function responseErrorKey(frame: OmpSessionFrame): string | null {
  if (frame.type !== "response" || frame.success === true || typeof frame.command !== "string" || typeof frame.error !== "string") {
    return null;
  }
  return commandErrorKey(frame.command, frame.error);
}

export function useOMP({
  sessionId,
  cwd,
  initialMessages,
  initialMeta,
  initialPermission,
  initialSlashCommands,
  initialSupportedModels,
  initialOmpModels,
  initialThinkingLevels,
  initialThinkingLevel,
}: UseOMPOptions): OMPHookState {
  const base = useEngineBase({ sessionId, initialMessages, initialMeta, initialPermission });
  const {
    messages,
    setMessages,
    isProcessing,
    setIsProcessing,
    isConnected,
    setIsConnected,
    sessionInfo,
    setSessionInfo,
    totalCost,
    setTotalCost,
    pendingPermission,
    setPendingPermission,
    contextUsage,
    setContextUsage,
    isCompacting,
    setIsCompacting,
    sessionIdRef,
    scheduleFlush,
    cancelPendingFlush,
  } = base;
  const runtimeRef = useRef<OmpRuntimeState>(createOmpRuntimeState({
    messages: initialMessages,
    isProcessing: initialMeta?.isProcessing,
    isConnected: initialMeta?.isConnected,
    isCompacting: initialMeta?.isCompacting,
    sessionInfo: initialMeta?.sessionInfo,
    totalCost: initialMeta?.totalCost,
    contextUsage: initialMeta?.contextUsage,
    pendingPermission: initialPermission,
    slashCommands: initialSlashCommands,
    supportedModels: initialSupportedModels,
    ompModels: initialOmpModels,
    thinkingLevels: initialThinkingLevels,
    thinkingLevel: initialThinkingLevel,
  }));
  const surfacedInvokeErrors = useRef(new Set<string>());
  const surfacedFrameErrors = useRef(new Set<string>());
  const skipNextExternalSync = useRef(true);
  const modelLoadRef = useRef<{ sessionId: string; request: Promise<OmpInvokeResult> } | null>(null);
  const initializedSessionRef = useRef<string | null>(null);
  const pendingPromptRef = useRef<{ id: string; messageId?: string } | null>(null);
  const [supportedModels, setSupportedModels] = useState<ModelInfo[]>(runtimeRef.current.supportedModels);
  const [ompModels, setOmpModels] = useState<OmpModel[]>(runtimeRef.current.ompModels);
  const [slashCommands, setSlashCommands] = useState<SlashCommand[]>(runtimeRef.current.slashCommands);
  const [thinkingLevels, setThinkingLevels] = useState<OmpThinkingLevel[]>(runtimeRef.current.thinkingLevels);
  const [thinkingLevel, setThinkingLevelState] = useState<OmpThinkingLevel | undefined>(runtimeRef.current.thinkingLevel);
  const [workMode, setWorkMode] = useState<OmpWorkModeSnapshot | null>(runtimeRef.current.workMode);
  const [planMode, setPlanMode] = useState<OmpPlanModeSnapshot | null>(runtimeRef.current.planMode);
  const [goalMode, setGoalMode] = useState<OmpGoalModeSnapshot | null>(runtimeRef.current.goalMode);
  const [vibeMode, setVibeMode] = useState<OmpVibeModeSnapshot | null>(runtimeRef.current.vibeMode);
  const [loopState, setLoopState] = useState<OmpLoopState | null>(runtimeRef.current.loopState);
  const [isRetrying, setIsRetrying] = useState(runtimeRef.current.isRetrying);
  const [isBashRunning, setIsBashRunning] = useState(runtimeRef.current.isBashRunning);
  const [isAborting, setIsAborting] = useState(runtimeRef.current.isAborting);
  const [isGeneratingHandoff, setIsGeneratingHandoff] = useState(runtimeRef.current.isGeneratingHandoff);
  const [steeringMode, setSteeringMode] = useState<"all" | "one-at-a-time">(runtimeRef.current.steeringMode);
  const [followUpMode, setFollowUpMode] = useState<"all" | "one-at-a-time">(runtimeRef.current.followUpMode);
  const [interruptMode, setInterruptMode] = useState<"immediate" | "wait">(runtimeRef.current.interruptMode);
  const [autoCompactionEnabled, setAutoCompactionEnabled] = useState(runtimeRef.current.autoCompactionEnabled);
  const [queuedMessageCount, setQueuedMessageCount] = useState(runtimeRef.current.queuedMessageCount);

  const publish = useCallback(() => {
    const runtime = runtimeRef.current;
    runtime.messages = [...runtime.messages];
    setMessages(runtime.messages);
    setIsProcessing(runtime.isProcessing);
    setIsConnected(runtime.isConnected);
    setSessionInfo(runtime.sessionInfo ? { ...runtime.sessionInfo } : null);
    setTotalCost(runtime.totalCost);
    setContextUsage(runtime.contextUsage ? { ...runtime.contextUsage } : null);
    setIsCompacting(runtime.isCompacting);
    setPendingPermission(runtime.pendingPermission ? { ...runtime.pendingPermission } : null);
    setSupportedModels(runtime.supportedModels);
    setIsRetrying(runtime.isRetrying);
    setIsBashRunning(runtime.isBashRunning);
    setIsAborting(runtime.isAborting);
    setIsGeneratingHandoff(runtime.isGeneratingHandoff);
    setSteeringMode(runtime.steeringMode);
    setFollowUpMode(runtime.followUpMode);
    setInterruptMode(runtime.interruptMode);
    setAutoCompactionEnabled(runtime.autoCompactionEnabled);
    setQueuedMessageCount(runtime.queuedMessageCount);
    setOmpModels(runtime.ompModels);
    setSlashCommands(runtime.slashCommands);
    setThinkingLevels(runtime.thinkingLevels);
    setThinkingLevelState(runtime.thinkingLevel);
    setWorkMode(runtime.workMode);
    setPlanMode(runtime.planMode);
    setGoalMode(runtime.goalMode);
    setVibeMode(runtime.vibeMode);
    setLoopState(runtime.loopState);
  }, [
    setContextUsage,
    setIsCompacting,
    setIsConnected,
    setIsProcessing,
    setMessages,
    setPendingPermission,
    setSessionInfo,
    setTotalCost,
  ]);

  const appendInvokeError = useCallback((command: string, error: string) => {
    runtimeRef.current.messages.push(createSystemMessage(`OMP ${command}：${error}`, true));
    publish();
  }, [publish]);

  const invoke = useCallback(async (command: OmpRpcCommand): Promise<OmpInvokeResult> => {
    const activeSessionId = sessionIdRef.current;
    if (!activeSessionId) {
      const error = "没有 OMP 会话";
      appendInvokeError(command.type, error);
      return { error };
    }
    const result = await window.claude.omp.command(activeSessionId, command);
    if (!result.error) return result;
    const key = commandErrorKey(command.type, result.error);
    if (surfacedFrameErrors.current.delete(key)) return result;
    surfacedInvokeErrors.current.add(key);
    appendInvokeError(command.type, result.error);
    return result;
  }, [appendInvokeError, sessionIdRef]);

  const ensureAvailableModels = useCallback((): Promise<OmpInvokeResult> => {
    if (runtimeRef.current.ompModels.length > 0) return Promise.resolve({});
    const activeSessionId = sessionIdRef.current;
    if (!activeSessionId) return invoke({ type: "get_available_models" });
    const existing = modelLoadRef.current;
    if (existing?.sessionId === activeSessionId) return existing.request;
    const request = invoke({ type: "get_available_models" });
    modelLoadRef.current = { sessionId: activeSessionId, request };
    void request.then(
      () => { if (modelLoadRef.current?.request === request) modelLoadRef.current = null; },
      () => { if (modelLoadRef.current?.request === request) modelLoadRef.current = null; },
    );
    return request;
  }, [invoke, sessionIdRef]);
  const requestInitialState = useCallback(() => {
    const activeSessionId = sessionIdRef.current;
    if (!activeSessionId || initializedSessionRef.current === activeSessionId) return;
    initializedSessionRef.current = activeSessionId;
    void invoke({ type: "set_subagent_subscription", level: "events" });
    void invoke({ type: "get_subagents" });
    void invoke({ type: "get_state" });
    void ensureAvailableModels();
    void invoke({ type: "get_available_commands" });
    void invoke({ type: "get_work_mode_state" });
  }, [ensureAvailableModels, invoke, sessionIdRef]);

  const ensureSessionInfo = useCallback((): SessionInfo => {
    const runtime = runtimeRef.current;
    if (runtime.sessionInfo) return runtime.sessionInfo;
    const info: SessionInfo = {
      sessionId: sessionIdRef.current ?? "",
      model: "",
      cwd: cwd ?? "",
      tools: [],
      version: "",
    };
    runtime.sessionInfo = info;
    return info;
  }, [cwd, sessionIdRef]);
  const rollbackPendingPrompt = useCallback((id: string): boolean => {
    const pending = pendingPromptRef.current;
    if (!pending || pending.id !== id) return false;
    if (pending.messageId) {
      runtimeRef.current.messages = runtimeRef.current.messages.filter((message) => message.id !== pending.messageId);
    }
    runtimeRef.current.isProcessing = false;
    pendingPromptRef.current = null;
    return true;
  }, []);

  const applyFrame = useCallback((frame: OmpSessionFrame) => {
    if (frame._sessionId !== sessionIdRef.current) return;
    bgAgentStore.handleOmpFrame(frame);
    const pendingPrompt = pendingPromptRef.current;
    if (pendingPrompt) {
      const frameId = typeof frame.id === "string" ? frame.id : undefined;
      if (frame.type === "agent_start") {
        pendingPromptRef.current = null;
      } else if (frame.type === "response" && frame.command === "prompt" && frameId === pendingPrompt.id) {
        if (frame.success === false) {
          rollbackPendingPrompt(pendingPrompt.id);
        } else if (
          typeof frame.data === "object"
          && frame.data !== null
          && (frame.data as Record<string, unknown>).agentInvoked === false
        ) {
          pendingPromptRef.current = null;
        }
      } else if (frame.type === "prompt_result" && frameId === pendingPrompt.id && frame.agentInvoked === false) {
        pendingPromptRef.current = null;
      }
    }
    const responseKey = responseErrorKey(frame);
    if (responseKey && surfacedInvokeErrors.current.delete(responseKey)) return;
    if (responseKey) surfacedFrameErrors.current.add(responseKey);
    const result = applyOmpFrame(runtimeRef.current, frame, {
      cwd,
      logicalSessionId: sessionIdRef.current ?? undefined,
    });
    if (frame.type === "ready") requestInitialState();
    if (!result.changed) return;
    if (result.streaming) {
      scheduleFlush(publish);
    } else {
      publish();
    }
  }, [cwd, publish, requestInitialState, rollbackPendingPrompt, scheduleFlush, sessionIdRef]);

  useLayoutEffect(() => {
    runtimeRef.current = createOmpRuntimeState({
      messages: initialMessages,
      isProcessing: initialMeta?.isProcessing,
      isConnected: initialMeta?.isConnected,
      isCompacting: initialMeta?.isCompacting,
      sessionInfo: initialMeta?.sessionInfo,
      totalCost: initialMeta?.totalCost,
      contextUsage: initialMeta?.contextUsage,
      pendingPermission: initialPermission,
      slashCommands: initialSlashCommands,
      supportedModels: initialSupportedModels,
      ompModels: initialOmpModels,
      thinkingLevels: initialThinkingLevels,
      thinkingLevel: initialThinkingLevel,
    });
    setSupportedModels(runtimeRef.current.supportedModels);
    setOmpModels(runtimeRef.current.ompModels);
    setSlashCommands(runtimeRef.current.slashCommands);
    setThinkingLevels(runtimeRef.current.thinkingLevels);
    setThinkingLevelState(runtimeRef.current.thinkingLevel);
    surfacedInvokeErrors.current.clear();
    surfacedFrameErrors.current.clear();
    modelLoadRef.current = null;
    pendingPromptRef.current = null;
    skipNextExternalSync.current = true;
    initializedSessionRef.current = null;
  }, [sessionId]); // Initial state intentionally resets with the pane session.

  useEffect(() => {
    if (skipNextExternalSync.current) {
      skipNextExternalSync.current = false;
      // useEngineBase resets its state in a passive effect. Re-publish this
      // session's runtime after that reset so an early ready frame is retained.
      publish();
      return;
    }
    const runtime = runtimeRef.current;
    runtime.messages = messages;
    runtime.isProcessing = isProcessing;
    runtime.isConnected = isConnected;
    runtime.isCompacting = isCompacting;
    runtime.sessionInfo = sessionInfo;
    runtime.totalCost = totalCost;
    runtime.contextUsage = contextUsage;
    runtime.pendingPermission = pendingPermission;
  }, [
    contextUsage,
    isCompacting,
    isConnected,
    isProcessing,
    messages,
    pendingPermission,
    publish,
    sessionInfo,
    totalCost,
  ]);

  useLayoutEffect(() => {
    if (!sessionId) return;
    const unsubscribeEvent = window.claude.omp.onEvent(applyFrame);
    const unsubscribeStderr = window.claude.omp.onStderr((event) => {
      if (event._sessionId !== sessionIdRef.current || !event.data) return;
      runtimeRef.current.messages.push(createSystemMessage(event.data, true));
      publish();
    });
    const unsubscribeExit = window.claude.omp.onExit((event) => {
      if (event._sessionId !== sessionIdRef.current) return;
      initializedSessionRef.current = null;
      pendingPromptRef.current = null;
      const error = event.error
        ?? (event.code !== null && event.code !== 0 ? `OMP 进程已退出，退出码为 ${event.code}` : undefined)
        ?? (event.signal ? `OMP 进程已退出，信号为 ${event.signal}` : undefined);
      markOmpDisconnected(runtimeRef.current, error);
      publish();
    });

    if (runtimeRef.current.isConnected) requestInitialState();

    return () => {
      unsubscribeEvent();
      unsubscribeStderr();
      unsubscribeExit();
      cancelPendingFlush();
    };
  }, [applyFrame, cancelPendingFlush, publish, requestInitialState, sessionId, sessionIdRef]);

  const send = useCallback(async (
    text: string,
    images?: ImageAttachment[],
    displayText?: string,
  ): Promise<boolean> => {
    const runtime = runtimeRef.current;
    const message = createUserMessage(text, images, displayText);
    const id = `omp-prompt-${crypto.randomUUID()}`;
    runtime.messages.push(message);
    runtime.isProcessing = true;
    pendingPromptRef.current = { id, messageId: message.id };
    publish();
    const result = await invoke({ id, type: "prompt", message: text, images: imageAttachmentsToOmpImages(images) });
    if (result.error && rollbackPendingPrompt(id)) publish();
    return !result.error;
  }, [invoke, publish, rollbackPendingPrompt]);

  const sendRaw = useCallback(async (text: string, images?: ImageAttachment[]): Promise<boolean> => {
    const id = `omp-prompt-${crypto.randomUUID()}`;
    runtimeRef.current.isProcessing = true;
    pendingPromptRef.current = { id };
    publish();
    const result = await invoke({ id, type: "prompt", message: text, images: imageAttachmentsToOmpImages(images) });
    if (result.error && rollbackPendingPrompt(id)) publish();
    return !result.error;
  }, [invoke, publish, rollbackPendingPrompt]);

  const stop = useCallback(async () => {
    const activeSessionId = sessionIdRef.current;
    if (!activeSessionId) return;
    const result = await window.claude.omp.stop(activeSessionId);
    if (result.error) {
      appendInvokeError("stop", result.error);
      return;
    }
    markOmpDisconnected(runtimeRef.current);
    publish();
  }, [appendInvokeError, publish, sessionIdRef]);

  const interrupt = useCallback(async () => {
    const result = await invoke({ type: "abort" });
    if (result.error) return;
    const runtime = runtimeRef.current;
    runtime.isProcessing = false;
    runtime.isCompacting = false;
    clearOmpPermission(runtime);
    publish();
  }, [invoke, publish]);

  const compact = useCallback(async () => {
    const runtime = runtimeRef.current;
    runtime.isProcessing = true;
    runtime.isCompacting = true;
    publish();
    const result = await invoke({ type: "compact" });
    if (!result.error) return;
    runtime.isProcessing = false;
    runtime.isCompacting = false;
    publish();
  }, [invoke, publish]);

  const respondPermission = useCallback(async (
    behavior: AppPermissionBehavior,
    updatedInput?: Record<string, unknown>,
    _newPermissionMode?: string,
    _updatedPermissions?: unknown[],
  ) => {
    const runtime = runtimeRef.current;
    const request = runtime.pendingPermission;
    if (!request) return;
    const response = createOmpExtensionResponse(request, behavior, updatedInput);
    if (!response) return;
    const result = await invoke(response);
    if (result.error) return;
    clearOmpPermission(runtime);
    publish();
  }, [invoke, publish]);

  const setPermissionMode = useCallback(async (mode: string) => {
    const runtime = runtimeRef.current;
    runtime.sessionInfo = { ...ensureSessionInfo(), permissionMode: mode };
    publish();
  }, [ensureSessionInfo, publish]);

  const setModel = useCallback(async (value?: string): Promise<OmpInvokeResult> => {
    if (!value) {
      const error = "未选择 OMP 模型";
      appendInvokeError("set_model", error);
      return { error };
    }
    const command = toOmpModelCommand(value);
    if (!command) {
      const error = `无效的 OMP 模型选择器：${value}`;
      appendInvokeError("set_model", error);
      return { error };
    }
    const result = await invoke(command);
    if (!result.error) {
      runtimeRef.current.sessionInfo = { ...ensureSessionInfo(), model: value };
      publish();
    }
    return result;
  }, [appendInvokeError, ensureSessionInfo, invoke, publish]);

  const setThinkingLevel = useCallback(
    (level: OmpThinkingLevel): Promise<OmpInvokeResult> => invoke({ type: "set_thinking_level", level }),
    [invoke],
  );

  const flushNow = useCallback(() => {
    cancelPendingFlush();
    publish();
  }, [cancelPendingFlush, publish]);

  // Work mode actions
  const enterPlanMode = useCallback(
    (planFilePath?: string): Promise<OmpInvokeResult> => invoke({ type: "enter_plan_mode", planFilePath }),
    [invoke],
  );
  const exitPlanMode = useCallback((): Promise<OmpInvokeResult> => invoke({ type: "exit_plan_mode" }), [invoke]);
  const pausePlanMode = useCallback((): Promise<OmpInvokeResult> => invoke({ type: "pause_plan_mode" }), [invoke]);
  const resumePlanMode = useCallback((): Promise<OmpInvokeResult> => invoke({ type: "resume_plan_mode" }), [invoke]);
  const approvePlanProposal = useCallback(
    (strategy?: string, editedContent?: string): Promise<OmpInvokeResult> =>
      invoke({
        type: "approve_plan_proposal",
        strategy: strategy as "execute" | "keep-context" | "compact-context" | undefined,
        editedContent,
      }),
    [invoke],
  );
  const rejectPlanProposal = useCallback(
    (feedback?: string): Promise<OmpInvokeResult> => invoke({ type: "reject_plan_proposal", feedback }),
    [invoke],
  );
  const createGoal = useCallback(
    (objective: string, tokenBudget?: number): Promise<OmpInvokeResult> =>
      invoke({ type: "create_goal", objective, tokenBudget }),
    [invoke],
  );
  const pauseGoal = useCallback((): Promise<OmpInvokeResult> => invoke({ type: "pause_goal" }), [invoke]);
  const resumeGoal = useCallback((): Promise<OmpInvokeResult> => invoke({ type: "resume_goal" }), [invoke]);
  const clearGoal = useCallback((): Promise<OmpInvokeResult> => invoke({ type: "clear_goal" }), [invoke]);
  const enterVibeMode = useCallback((): Promise<OmpInvokeResult> => invoke({ type: "enter_vibe_mode" }), [invoke]);
  const exitVibeMode = useCallback((): Promise<OmpInvokeResult> => invoke({ type: "exit_vibe_mode" }), [invoke]);
  const enableLoop = useCallback(
    (prompt: string, count?: number): Promise<OmpInvokeResult> => invoke({ type: "enable_loop", prompt, count }),
    [invoke],
  );
  const disableLoop = useCallback((): Promise<OmpInvokeResult> => invoke({ type: "disable_loop" }), [invoke]);
  const refreshWorkModeState = useCallback(
    (): Promise<OmpInvokeResult> => invoke({ type: "get_work_mode_state" }),
    [invoke],
  );

  // PR-aligned additional actions
  const retry = useCallback((): Promise<OmpInvokeResult> => invoke({ type: "retry" }), [invoke]);
  const submitPlanReview = useCallback(
    (title?: string): Promise<OmpInvokeResult> => invoke({ type: "submit_plan_review", title }),
    [invoke],
  );
  const switchGoal = useCallback(
    (objective: string, tokenBudget?: number): Promise<OmpInvokeResult> =>
      invoke({ type: "switch_goal", objective, tokenBudget }),
    [invoke],
  );
  const setGoalBudget = useCallback(
    (tokenBudget: number | null): Promise<OmpInvokeResult> => invoke({ type: "set_goal_budget", tokenBudget }),
    [invoke],
  );
  const beginGuidedGoal = useCallback(
    (initialObjective?: string): Promise<OmpInvokeResult> =>
      invoke({ type: "begin_guided_goal", initialObjective }),
    [invoke],
  );
  const pauseAgents = useCallback((): Promise<OmpInvokeResult> => invoke({ type: "pause_agents" }), [invoke]);
  const resumeAgents = useCallback((): Promise<OmpInvokeResult> => invoke({ type: "resume_agents" }), [invoke]);
  const newSession = useCallback(
    (parentSession?: string): Promise<OmpInvokeResult> => invoke({ type: "new_session", parentSession }),
    [invoke],
  );
  const abortAndPrompt = useCallback(
    (message: string, images?: ImageAttachment[]): Promise<OmpInvokeResult> =>
      invoke({ type: "abort_and_prompt", message, images: images?.map((img) => ({ type: "image" as const, data: img.data, mimeType: img.mediaType })) }),
    [invoke],
  );
  const getQueuedMessages = useCallback((): Promise<OmpInvokeResult> => invoke({ type: "get_queued_messages" }), [invoke]);
  const popQueuedMessage = useCallback((): Promise<OmpInvokeResult> => invoke({ type: "pop_queued_message" }), [invoke]);
  const clearQueue = useCallback((): Promise<OmpInvokeResult> => invoke({ type: "clear_queue" }), [invoke]);

  return {
    messages,
    setMessages,
    isProcessing,
    setIsProcessing,
    isConnected,
    setIsConnected,
    isCompacting,
    isRetrying,
    isBashRunning,
    isAborting,
    isGeneratingHandoff,
    sessionInfo,
    setSessionInfo,
    totalCost,
    setTotalCost,
    ompModels,
    contextUsage,
    pendingPermission,
    supportedModels,
    slashCommands,
    thinkingLevels,
    thinkingLevel,
    steeringMode,
    followUpMode,
    interruptMode,
    autoCompactionEnabled,
    queuedMessageCount,
    send,
    sendRaw,
    stop,
    interrupt,
    compact,
    retry,
    respondPermission,
    setPermissionMode,
    setModel,
    setThinkingLevel,
    flushNow,
    // Work mode state
    workMode,
    planMode,
    goalMode,
    vibeMode,
    loopState,
    // Work mode actions
    enterPlanMode,
    exitPlanMode,
    pausePlanMode,
    resumePlanMode,
    submitPlanReview,
    approvePlanProposal,
    rejectPlanProposal,
    createGoal,
    pauseGoal,
    resumeGoal,
    switchGoal,
    clearGoal,
    setGoalBudget,
    beginGuidedGoal,
    enterVibeMode,
    exitVibeMode,
    enableLoop,
    disableLoop,
    refreshWorkModeState,
    // Runtime control
    pauseAgents,
    resumeAgents,
    // Session / queue
    newSession,
    abortAndPrompt,
    getQueuedMessages,
    popQueuedMessage,
    clearQueue,
  };
}
