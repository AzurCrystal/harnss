import { useState, useCallback, useEffect, useRef } from "react";
import type { ChatSession, UIMessage, PermissionRequest, ModelInfo, Project, SlashCommand } from "@/types";
import type { OmpModel } from "@/lib/engine/omp-adapter";
import type { OmpThinkingLevel } from "@shared/types/omp";
import { toChatSession } from "../lib/session/records";
import { BackgroundSessionStore } from "../lib/background/session-store";
import {
  DRAFT_ID,
  type StartOptions,
  type InitialMeta,
  type QueuedMessage,
  type SessionPaneBootstrap,
  type SharedSessionRefs,
  type SharedSessionSetters,
  type EngineHooks,
} from "./session/types";
import { useSessionPane } from "./session/useSessionPane";
import { useMessageQueue } from "./session/useMessageQueue";
import { useSessionPersistence } from "./session/useSessionPersistence";
import { useDraftMaterialization } from "./session/useDraftMaterialization";
import { useSessionRevival } from "./session/useSessionRevival";
import { useSessionLifecycle } from "./session/useSessionLifecycle";

export function useSessionManager(
  projects: Project[],
  _legacyPermissionBehavior?: string,
  onSpaceChange?: (spaceId: string) => void,
  /** Session IDs currently visible in extra split panes. */
  visibleSplitSessionIds: readonly string[] = [],
) {
  // ── Core state ──
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [startOptions, setStartOptions] = useState<StartOptions>({ engine: "omp" });
  const [draftProjectId, setDraftProjectId] = useState<string | null>(null);
  const [draftSessionId, setDraftSessionId] = useState<string | null>(null);
  const [initialMeta, setInitialMeta] = useState<InitialMeta | null>(null);
  const [initialPermission, setInitialPermission] = useState<PermissionRequest | null>(null);
  const [initialSupportedModels, setInitialSupportedModels] = useState<ModelInfo[]>([]);
  const [initialOmpModels, setInitialOmpModels] = useState<OmpModel[]>([]);
  const [initialThinkingLevels, setInitialThinkingLevels] = useState<OmpThinkingLevel[]>([]);
  const [initialThinkingLevel, setInitialThinkingLevel] = useState<OmpThinkingLevel | undefined>(undefined);
  const [initialSlashCommands, setInitialSlashCommands] = useState<SlashCommand[]>([]);
  const [queuedCount, setQueuedCount] = useState(0);

  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  const backgroundStoreRef = useRef(new BackgroundSessionStore());

  const findProject = useCallback((projectId: string) => (
    projectsRef.current.find((project) => project.id === projectId) ?? null
  ), []);

  const getProjectCwd = useCallback((project: Project) => {
    const selected = localStorage.getItem(`harnss-${project.id}-git-cwd`)?.trim();
    return selected || project.path;
  }, []);

  useEffect(() => {
    if (visibleSplitSessionIds.length === 0) return;
    const visibleIds = new Set(visibleSplitSessionIds);
    setSessions((prev) => {
      let changed = false;
      const next = prev.map((session) => {
        if (!visibleIds.has(session.id) || !session.hasUnreadCompletion) return session;
        changed = true;
        return { ...session, hasUnreadCompletion: false };
      });
      return changed ? next : prev;
    });
  }, [visibleSplitSessionIds]);

  const activeProjectId = activeSessionId === DRAFT_ID
    ? draftProjectId
    : sessions.find((session) => session.id === activeSessionId)?.projectId;
  const activeProject = activeProjectId ? findProject(activeProjectId) : null;
  const activeCwd = activeProject ? getProjectCwd(activeProject) : undefined;

  // ── Primary OMP session pane ──
  const primaryPane = useSessionPane({
    activeSessionId,
    cwd: activeCwd,
    initialMessages,
    initialMeta,
    initialPermission,
    initialSupportedModels,
    initialOmpModels,
    initialThinkingLevels,
    initialThinkingLevel,
    initialSlashCommands,
  });
  const { omp, engine } = primaryPane;
  const { messages, totalCost, contextUsage } = primaryPane;

  // ── Shared refs ──
  const liveSessionIdsRef = useRef<Set<string>>(new Set());
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const totalCostRef = useRef(totalCost);
  totalCostRef.current = totalCost;
  const contextUsageRef = useRef(contextUsage);
  contextUsageRef.current = contextUsage;
  const activeSessionIdRef = useRef(activeSessionId);
  activeSessionIdRef.current = activeSessionId;
  const draftProjectIdRef = useRef(draftProjectId);
  draftProjectIdRef.current = draftProjectId;
  const draftSessionIdRef = useRef(draftSessionId);
  draftSessionIdRef.current = draftSessionId;
  const startOptionsRef = useRef(startOptions);
  startOptionsRef.current = startOptions;
  const isProcessingRef = useRef(engine.isProcessing);
  isProcessingRef.current = engine.isProcessing;
  const isCompactingRef = useRef(engine.isCompacting);
  isCompactingRef.current = engine.isCompacting;
  const isConnectedRef = useRef(engine.isConnected);
  isConnectedRef.current = engine.isConnected;
  const sessionInfoRef = useRef(engine.sessionInfo);
  sessionInfoRef.current = engine.sessionInfo;
  const pendingPermissionRef = useRef(engine.pendingPermission);
  pendingPermissionRef.current = engine.pendingPermission;
  const visibleSplitSessionIdsRef = useRef<readonly string[]>(visibleSplitSessionIds);
  visibleSplitSessionIdsRef.current = visibleSplitSessionIds;
  const lastMessageSyncSessionRef = useRef<string | null>(null);
  const materializingRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageQueueRef = useRef<Map<string, QueuedMessage[]>>(new Map());
  const currentBranchRef = useRef<string | undefined>(undefined);
  const switchSessionRef = useRef<((id: string) => Promise<void>) | undefined>(undefined);
  const onSpaceChangeRef = useRef(onSpaceChange);
  onSpaceChangeRef.current = onSpaceChange;

  const refs: SharedSessionRefs = {
    activeSessionIdRef,
    sessionsRef,
    projectsRef,
    draftProjectIdRef,
    draftSessionIdRef,
    startOptionsRef,
    messagesRef,
    totalCostRef,
    contextUsageRef,
    isProcessingRef,
    isCompactingRef,
    isConnectedRef,
    sessionInfoRef,
    pendingPermissionRef,
    liveSessionIdsRef,
    backgroundStoreRef,
    materializingRef,
    saveTimerRef,
    messageQueueRef,
    lastMessageSyncSessionRef,
    switchSessionRef,
    onSpaceChangeRef,
    currentBranchRef,
    visibleSplitSessionIdsRef,
  };

  const setters: SharedSessionSetters = {
    setSessions,
    setActiveSessionId,
    setInitialMessages,
    setInitialMeta,
    setInitialPermission,
    setInitialSupportedModels,
    setInitialOmpModels,
    setInitialThinkingLevels,
    setInitialThinkingLevel,
    setInitialSlashCommands,
    setStartOptions,
    setDraftProjectId,
    setDraftSessionId,
    setQueuedCount,
  };

  const engines: EngineHooks = { omp, engine };

  const {
    enqueueMessage,
    clearQueue,
    unqueueMessage,
    sendQueuedMessageNext,
    continueQueuedBackgroundSession,
    sendNextId,
  } = useMessageQueue({ refs, setters, engines, activeSessionId });

  const { saveCurrentSession, seedBackgroundStore, generateSessionTitle } = useSessionPersistence({
    refs,
    setters,
    engines,
    activeSessionId,
    continueQueuedBackgroundSession,
  });

  const { materializeDraft, abandonDraftSession } = useDraftMaterialization({
    refs,
    setters,
    findProject,
    getProjectCwd,
    generateSessionTitle,
  });

  const { reviveSession } = useSessionRevival({
    refs,
    setters,
    engines,
    findProject,
    getProjectCwd,
  });

  const {
    createSession,
    switchSession,
    deleteSession,
    renameSession,
    deselectSession,
    importCCSession,
    setActiveModel,
    setSessionModel,
    setActivePermissionMode,
    setSessionPermissionMode,
    setActivePlanMode,
    setSessionPlanMode,
    setActiveThinking,
    send,
  } = useSessionLifecycle({
    refs,
    setters,
    engines,
    projects,
    activeSessionId,
    findProject,
    getProjectCwd,
    saveCurrentSession,
    seedBackgroundStore,
    abandonDraftSession,
    materializeDraft,
    reviveSession,
    enqueueMessage,
    clearQueue,
  });

  const seedDevExampleConversation = useCallback(async () => {
    if (!import.meta.env.DEV) return;
    const { buildDevExampleConversation } = await import("../lib/dev-seeding/chat-seed");
    const seeded = buildDevExampleConversation(Date.now());
    engine.setMessages((prev) => [...prev, ...seeded.messages]);
    const activeId = activeSessionIdRef.current;
    if (activeId && activeId !== DRAFT_ID) {
      setSessions((prev) => prev.map((session) => (
        session.id === activeId ? { ...session, lastMessageAt: seeded.lastMessageAt } : session
      )));
    }
  }, [engine, setSessions]);

  const refreshSessions = useCallback(async (projectIds?: string[]) => {
    const ids = projectIds?.length ? projectIds : projectsRef.current.map((project) => project.id);
    if (ids.length === 0) return;
    const uniqueIds = [...new Set(ids)];
    const lists = await Promise.all(uniqueIds.map((projectId) => window.claude.sessions.list(projectId)));
    const refreshed = lists.flat().map((session) =>
      toChatSession(session, session.id === activeSessionIdRef.current),
    );
    setSessions((prev) => {
      const keep = prev.filter((session) => !uniqueIds.includes(session.projectId));
      const existingById = new Map(prev.map((session) => [session.id, session]));
      const sessionsById = new Map<string, ChatSession>();
      [...keep, ...refreshed].forEach((session) => {
        const existing = existingById.get(session.id);
        sessionsById.set(session.id, existing
          ? {
              ...session,
              isProcessing: existing.isProcessing,
              hasPendingPermission: existing.hasPendingPermission,
              hasUnreadCompletion: existing.hasUnreadCompletion,
              titleGenerating: existing.titleGenerating,
            }
          : session);
      });
      return Array.from(sessionsById.values()).sort(
        (left, right) => (right.lastMessageAt ?? right.createdAt) - (left.lastMessageAt ?? left.createdAt),
      );
    });
  }, [setSessions]);

  const loadSplitPaneBootstrap = useCallback(async (sessionId: string): Promise<SessionPaneBootstrap | null> => {
    const session = sessionsRef.current.find((entry) => entry.id === sessionId);
    if (!session) return null;
    const project = findProject(session.projectId);
    const cwd = project ? getProjectCwd(project) : undefined;

    const backgroundState = backgroundStoreRef.current.get(sessionId);
    if (backgroundState) {
      return {
        session,
        initialMessages: backgroundState.messages,
        initialMeta: {
          isProcessing: backgroundState.isProcessing,
          isConnected: backgroundState.isConnected,
          sessionInfo: backgroundState.sessionInfo,
          totalCost: backgroundState.totalCost,
          contextUsage: backgroundState.contextUsage,
          isCompacting: backgroundState.isCompacting,
        },
        initialPermission: backgroundState.pendingPermission,
        initialSupportedModels: backgroundState.supportedModels,
        initialOmpModels: backgroundState.ompModels,
        initialThinkingLevels: backgroundState.thinkingLevels,
        initialThinkingLevel: backgroundState.thinkingLevel,
        initialSlashCommands: backgroundState.slashCommands,
        cwd,
      };
    }

    const persisted = await window.claude.sessions.load(session.projectId, sessionId);
    if (!persisted) return null;
    return {
      session,
      initialMessages: persisted.messages ?? [],
      initialMeta: {
        isProcessing: false,
        isConnected: false,
        sessionInfo: null,
        totalCost: persisted.totalCost ?? 0,
        contextUsage: persisted.contextUsage ?? null,
      },
      initialPermission: null,
      cwd,
    };
  }, [findProject, getProjectCwd]);

  const isDraft = activeSessionId === DRAFT_ID;
  const activeSession = sessions.find((session) => session.id === activeSessionId) ?? null;

  const setCurrentBranch = useCallback((branch: string | undefined) => {
    currentBranchRef.current = branch;
  }, []);

  return {
    primaryPane,
    sessions,
    setSessions,
    activeSessionId,
    setCurrentBranch,
    activeSession,
    isDraft,
    draftProjectId,
    createSession,
    switchSession,
    deselectSession,
    deleteSession,
    renameSession,
    importCCSession,
    setActiveModel,
    setSessionModel,
    setActivePermissionMode,
    setSessionPermissionMode,
    setActivePlanMode,
    setSessionPlanMode,
    setActiveThinking,
    messages: engine.messages,
    isProcessing: engine.isProcessing,
    isConnected: engine.isConnected || isDraft,
    sessionInfo: engine.sessionInfo,
    totalCost: engine.totalCost,
    send,
    unqueueMessage,
    sendQueuedMessageNext,
    sendNextId,
    seedDevExampleConversation,
    refreshSessions,
    loadSplitPaneBootstrap,
    queuedCount,
    stop: engine.stop,
    interrupt: async () => {
      clearQueue();
      await engine.interrupt();
    },
    pendingPermission: engine.pendingPermission,
    respondPermission: engine.respondPermission,
    contextUsage: engine.contextUsage,
    isCompacting: engine.isCompacting,
    compact: engine.compact,
    slashCommands: engine.slashCommands,
    supportedModels: engine.supportedModels,
    thinkingLevels: engine.thinkingLevels,
    thinkingLevel: engine.thinkingLevel,
    setThinkingLevel: engine.setThinkingLevel,
    // PR-aligned state
    isRetrying: engine.isRetrying,
    isBashRunning: engine.isBashRunning,
    isAborting: engine.isAborting,
    isGeneratingHandoff: engine.isGeneratingHandoff,
    steeringMode: engine.steeringMode,
    followUpMode: engine.followUpMode,
    interruptMode: engine.interruptMode,
    autoCompactionEnabled: engine.autoCompactionEnabled,
    queuedMessageCount: engine.queuedMessageCount,
    // Work mode state and actions
    workMode: engine.workMode,
    planMode: engine.planMode,
    goalMode: engine.goalMode,
    vibeMode: engine.vibeMode,
    loopState: engine.loopState,
    enterPlanMode: engine.enterPlanMode,
    exitPlanMode: engine.exitPlanMode,
    pausePlanMode: engine.pausePlanMode,
    resumePlanMode: engine.resumePlanMode,
    submitPlanReview: engine.submitPlanReview,
    approvePlanProposal: engine.approvePlanProposal,
    rejectPlanProposal: engine.rejectPlanProposal,
    createGoal: engine.createGoal,
    pauseGoal: engine.pauseGoal,
    resumeGoal: engine.resumeGoal,
    switchGoal: engine.switchGoal,
    clearGoal: engine.clearGoal,
    setGoalBudget: engine.setGoalBudget,
    beginGuidedGoal: engine.beginGuidedGoal,
    enterVibeMode: engine.enterVibeMode,
    exitVibeMode: engine.exitVibeMode,
    enableLoop: engine.enableLoop,
    disableLoop: engine.disableLoop,
    refreshWorkModeState: engine.refreshWorkModeState,
    // Runtime control
    pauseAgents: engine.pauseAgents,
    resumeAgents: engine.resumeAgents,
    // Session / queue
    retry: engine.retry,
    newSession: engine.newSession,
    abortAndPrompt: engine.abortAndPrompt,
    getQueuedMessages: engine.getQueuedMessages,
    popQueuedMessage: engine.popQueuedMessage,
    clearQueue: engine.clearQueue,
  };
}
