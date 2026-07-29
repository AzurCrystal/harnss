import { startTransition, useCallback, useRef } from "react";
import { toast } from "sonner";
import type { PersistedSession } from "@/types";
import { suppressNextSessionCompletion } from "../../lib/notification-utils";
import { bgAgentStore } from "../../lib/background/agent-store";
import { DRAFT_ID } from "./types";
import type { SharedSessionRefs, SharedSessionSetters, EngineHooks, StartOptions } from "./types";

interface UseSessionCrudParams {
  refs: SharedSessionRefs;
  setters: SharedSessionSetters;
  engines: EngineHooks;
  saveCurrentSession: () => Promise<void>;
  seedBackgroundStore: () => void;
  abandonDraftSession: (reason?: string) => void;
  cacheSessionPayload: (data: PersistedSession) => void;
  consumeCachedSessionPayload: (sessionId: string) => PersistedSession | null;
  applyLoadedSession: (id: string, data: PersistedSession) => void;
  evictFromCache: (sessionId: string) => void;
  clearQueue: () => void;
}

export function useSessionCrud({
  refs,
  setters,
  engines,
  saveCurrentSession,
  seedBackgroundStore,
  abandonDraftSession,
  cacheSessionPayload,
  consumeCachedSessionPayload,
  applyLoadedSession,
  evictFromCache,
  clearQueue,
}: UseSessionCrudParams) {
  const { omp } = engines;
  const {
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
  } = setters;
  const {
    activeSessionIdRef,
    sessionsRef,
    liveSessionIdsRef,
    backgroundStoreRef,
    projectsRef,
    messageQueueRef,
    switchSessionRef,
    onSpaceChangeRef,
  } = refs;

  const resetInitialOmpState = useCallback(() => {
    setInitialSupportedModels([]);
    setInitialOmpModels([]);
    setInitialThinkingLevels([]);
    setInitialThinkingLevel(undefined);
    setInitialSlashCommands([]);
  }, [
    setInitialOmpModels,
    setInitialSlashCommands,
    setInitialSupportedModels,
    setInitialThinkingLevel,
    setInitialThinkingLevels,
  ]);
  const switchRequestIdRef = useRef(0);

  const createSession = useCallback(async (projectId: string, options?: StartOptions) => {
    abandonDraftSession("new_draft");
    seedBackgroundStore();
    void saveCurrentSession();

    const startOptions: StartOptions = { ...options, engine: "omp" };
    setStartOptions(startOptions);
    setDraftProjectId(projectId);
    setInitialMessages([]);
    setInitialMeta(null);
    setInitialPermission(null);
    resetInitialOmpState();
    omp.setMessages([]);
    omp.setIsProcessing(false);
    setActiveSessionId(DRAFT_ID);
    setSessions((sessions) => sessions
      .filter((session) => session.id !== DRAFT_ID)
      .map((session) => ({ ...session, isActive: false })));
  }, [
    abandonDraftSession,
    omp.setIsProcessing,
    omp.setMessages,
    saveCurrentSession,
    seedBackgroundStore,
    setActiveSessionId,
    setDraftProjectId,
    setInitialMessages,
    setInitialMeta,
    setInitialPermission,
    resetInitialOmpState,
    setSessions,
    setStartOptions,
  ]);

  const switchSession = useCallback(async (id: string) => {
    if (id === activeSessionIdRef.current) return;
    const requestId = ++switchRequestIdRef.current;

    abandonDraftSession("switch_session");
    seedBackgroundStore();
    void saveCurrentSession();

    const session = sessionsRef.current.find((entry) => entry.id === id);
    if (!session) return;

    setSessions((sessions) => sessions.map((entry) => (
      entry.id === id ? { ...entry, engine: "omp" } : entry
    )));
    setStartOptions((current) => ({
      ...current,
      engine: "omp",
      model: session.model,
      effort: session.effort,
      permissionMode: session.permissionMode,
      planMode: !!session.planMode,
    }));

    const project = projectsRef.current.find((entry) => entry.id === session.projectId);
    if (project) onSpaceChangeRef.current?.(project.spaceId || "default");

    const backgroundState = backgroundStoreRef.current.consume(id);
    if (backgroundState) {
      startTransition(() => {
        setInitialMessages(backgroundState.messages);
        setInitialMeta({
          isProcessing: backgroundState.isProcessing,
          isConnected: backgroundState.isConnected,
          sessionInfo: backgroundState.sessionInfo,
          totalCost: backgroundState.totalCost,
          contextUsage: backgroundState.contextUsage,
          isCompacting: backgroundState.isCompacting,
        });
        setInitialPermission(backgroundState.pendingPermission);
        setInitialSupportedModels(backgroundState.supportedModels ?? []);
        setInitialOmpModels(backgroundState.ompModels ?? []);
        setInitialThinkingLevels(backgroundState.thinkingLevels ?? []);
        setInitialThinkingLevel(backgroundState.thinkingLevel);
        setInitialSlashCommands(backgroundState.slashCommands ?? []);
        setActiveSessionId(id);
        setDraftProjectId(null);
        setSessions((sessions) => sessions
          .filter((entry) => entry.id !== DRAFT_ID)
          .map((entry) => ({
            ...entry,
            engine: "omp",
            isActive: entry.id === id,
            ...(entry.id === id ? { hasPendingPermission: false } : {}),
          })));
      });
      toast.dismiss(`permission-${id}`);
      return;
    }

    const cached = consumeCachedSessionPayload(id);
    if (cached) {
      applyLoadedSession(id, cached);
      return;
    }

    const persisted = await window.claude.sessions.load(session.projectId, id);
    if (requestId !== switchRequestIdRef.current || !persisted) return;
    cacheSessionPayload(persisted);
    const restored = consumeCachedSessionPayload(id);
    if (restored) applyLoadedSession(id, restored);
  }, [
    abandonDraftSession,
    activeSessionIdRef,
    applyLoadedSession,
    backgroundStoreRef,
    cacheSessionPayload,
    consumeCachedSessionPayload,
    onSpaceChangeRef,
    projectsRef,
    saveCurrentSession,
    seedBackgroundStore,
    sessionsRef,
    setActiveSessionId,
    setDraftProjectId,
    setInitialMessages,
    setInitialMeta,
    setInitialPermission,
    setInitialSupportedModels,
    setInitialOmpModels,
    setInitialThinkingLevels,
    setInitialThinkingLevel,
    setInitialSlashCommands,
    setSessions,
    setStartOptions,
  ]);

  switchSessionRef.current = switchSession;

  const deleteSession = useCallback(async (id: string) => {
    const session = sessionsRef.current.find((entry) => entry.id === id);
    if (!session) return;

    if (liveSessionIdsRef.current.has(id)) {
      suppressNextSessionCompletion(id);
      const stopped = await window.claude.omp.stop(id);
      if (stopped.error) {
        toast.error("停止 OMP 会话失败", { description: stopped.error });
        throw new Error(stopped.error);
      }
      liveSessionIdsRef.current.delete(id);
    }
    evictFromCache(id);
    backgroundStoreRef.current.delete(id);
    messageQueueRef.current.delete(id);
    bgAgentStore.clearSession(id);
    toast.dismiss(`permission-${id}`);
    await window.claude.sessions.delete(session.projectId, id);

    if (activeSessionIdRef.current === id) {
      clearQueue();
      setActiveSessionId(null);
      setInitialMessages([]);
      setInitialMeta(null);
      setInitialPermission(null);
      resetInitialOmpState();
    }
    setSessions((sessions) => sessions.filter((entry) => entry.id !== id));
  }, [
    activeSessionIdRef,
    backgroundStoreRef,
    clearQueue,
    evictFromCache,
    liveSessionIdsRef,
    messageQueueRef,
    sessionsRef,
    setActiveSessionId,
    setInitialMessages,
    setInitialMeta,
    setInitialPermission,
    resetInitialOmpState,
    setSessions,
  ]);

  const renameSession = useCallback((id: string, title: string) => {
    const session = sessionsRef.current.find((entry) => entry.id === id);
    if (!session) return;

    setSessions((sessions) => sessions.map((entry) => (
      entry.id === id ? { ...entry, title, titleGenerating: false } : entry
    )));
    window.claude.sessions.load(session.projectId, id).then((data) => {
      if (data) return window.claude.sessions.save({ ...data, title, engine: "omp" });
    }).catch(() => { /* session may have been deleted */ });
  }, [sessionsRef, setSessions]);

  const deselectSession = useCallback(async () => {
    abandonDraftSession("deselect");
    seedBackgroundStore();
    void saveCurrentSession();
    setActiveSessionId(null);
    setDraftProjectId(null);
    setInitialMessages([]);
    setInitialMeta(null);
    setInitialPermission(null);
    resetInitialOmpState();
    setSessions((sessions) => sessions
      .filter((session) => session.id !== DRAFT_ID)
      .map((session) => ({ ...session, isActive: false })));
  }, [
    abandonDraftSession,
    saveCurrentSession,
    seedBackgroundStore,
    setActiveSessionId,
    setDraftProjectId,
    setInitialMessages,
    setInitialMeta,
    setInitialPermission,
    resetInitialOmpState,
    setSessions,
  ]);

  const importCCSession = useCallback(async (_projectId: string, _ccSessionId: string) => {
    toast.error("无法通过 OMP RPC 协议导入 Claude Code 会话。");
  }, []);


  return {
    createSession,
    switchSession,
    deleteSession,
    renameSession,
    deselectSession,
    importCCSession,
  };
}
