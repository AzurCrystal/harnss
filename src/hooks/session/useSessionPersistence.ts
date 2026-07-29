import { useCallback, useEffect } from "react";
import { toast } from "sonner";
import type { PersistedSession, PermissionRequest } from "@/types";
import type { OmpExitEvent } from "@shared/types/omp";
import { getSessionNotificationActor } from "@/lib/session-notifications";
import { buildPersistedSession } from "../../lib/session/records";
import { DRAFT_ID } from "./types";
import type { SharedSessionRefs, SharedSessionSetters, EngineHooks } from "./types";

interface UseSessionPersistenceParams {
  refs: SharedSessionRefs;
  setters: SharedSessionSetters;
  engines: EngineHooks;
  activeSessionId: string | null;
  continueQueuedBackgroundSession?: (sessionId: string) => boolean;
}

export function useSessionPersistence({
  refs,
  setters,
  engines,
  activeSessionId,
  continueQueuedBackgroundSession,
}: UseSessionPersistenceParams) {
  const { omp: engine } = engines;
  const { messages, totalCost, sessionInfo } = engine;
  const { setSessions, setDraftSessionId } = setters;
  const {
    activeSessionIdRef,
    sessionsRef,
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
    draftSessionIdRef,
    lastMessageSyncSessionRef,
    switchSessionRef,
    saveTimerRef,
    visibleSplitSessionIdsRef,
  } = refs;

  // Wire background-store callbacks to sidebar state and notifications.
  useEffect(() => {
    const onProcessingChange = (sessionId: string, isProcessing: boolean) => {
      const session = sessionsRef.current.find((entry) => entry.id === sessionId);
      const wasProcessing = !!session?.isProcessing;
      setSessions((prev) =>
        prev.map((entry) =>
          entry.id === sessionId
            ? {
                ...entry,
                isProcessing,
                ...(isProcessing
                  ? { hasUnreadCompletion: false }
                  : { hasUnreadCompletion: true }),
              }
            : entry,
        ),
      );

      if (!wasProcessing || isProcessing || !session) return;
      const backgroundState = backgroundStoreRef.current.get(sessionId);
      const sessionFile = backgroundState?.sessionInfo?.agentName ?? session.agentSessionId;
      const persisted = backgroundState
        ? buildPersistedSession(
            {
              ...session,
              model: session.model || backgroundState.sessionInfo?.model,
              ...(sessionFile ? { agentSessionId: sessionFile } : {}),
            },
            [...backgroundState.messages],
            backgroundState.totalCost,
            backgroundState.contextUsage ? { ...backgroundState.contextUsage } : null,
          )
        : null;

      void (async () => {
        if (persisted) await window.claude.sessions.save(persisted);
        const continuedQueuedSession = !!continueQueuedBackgroundSession?.(sessionId);
        if (continuedQueuedSession) return;
        window.dispatchEvent(new CustomEvent("harnss:background-session-complete", {
          detail: {
            sessionId,
            sessionTitle: session.title,
            actor: getSessionNotificationActor(session),
          },
        }));
      })();
    };

    const onPermissionRequest = (sessionId: string, permission: PermissionRequest) => {
      setSessions((prev) =>
        prev.map((entry) =>
          entry.id === sessionId ? { ...entry, hasPendingPermission: true } : entry,
        ),
      );

      const session = sessionsRef.current.find((entry) => entry.id === sessionId);
      const sessionTitle = session?.title ?? "后台会话";
      toast(sessionTitle, {
        id: `permission-${sessionId}`,
        description: `正在等待权限：${permission.toolName}`,
        duration: Infinity,
        action: {
          label: "切换",
          onClick: () => switchSessionRef.current?.(sessionId),
        },
      });

      window.dispatchEvent(new CustomEvent("harnss:background-permission-request", {
        detail: {
          sessionId,
          sessionTitle,
          actor: getSessionNotificationActor(session),
          permission,
        },
      }));
    };

    backgroundStoreRef.current.onProcessingChange = onProcessingChange;
    backgroundStoreRef.current.onPermissionRequest = onPermissionRequest;
    return () => {
      if (backgroundStoreRef.current.onProcessingChange === onProcessingChange) {
        backgroundStoreRef.current.onProcessingChange = undefined;
      }
      if (backgroundStoreRef.current.onPermissionRequest === onPermissionRequest) {
        backgroundStoreRef.current.onPermissionRequest = undefined;
      }
    };
  }, [backgroundStoreRef, continueQueuedBackgroundSession, pendingPermissionRef, sessionsRef, setSessions, switchSessionRef]);

  // A single OMP exit stream owns lifecycle cleanup for active and background sessions.
  useEffect(() => {
    const handleSessionExit = async (sessionId: string, exit: OmpExitEvent) => {
      liveSessionIdsRef.current.delete(sessionId);

      if (sessionId === draftSessionIdRef.current) {
        draftSessionIdRef.current = null;
        setDraftSessionId(null);
        backgroundStoreRef.current.delete(sessionId);
        return;
      }

      if (sessionId !== activeSessionIdRef.current && backgroundStoreRef.current.has(sessionId)) {
        const error = exit.error ?? (exit.code !== null && exit.code !== 0
          ? `OMP 进程已退出，退出码为 ${exit.code}`
          : undefined);
        backgroundStoreRef.current.markOMPDisconnected(sessionId, error);
        const backgroundState = backgroundStoreRef.current.get(sessionId);
        const session = sessionsRef.current.find((entry) => entry.id === sessionId);
        if (backgroundState && session) {
          const sessionFile = backgroundState.sessionInfo?.agentName ?? session.agentSessionId;
          const persisted = buildPersistedSession(
            {
              ...session,
              model: session.model || backgroundState.sessionInfo?.model,
              ...(sessionFile ? { agentSessionId: sessionFile } : {}),
            },
            backgroundState.messages,
            backgroundState.totalCost,
            backgroundState.contextUsage,
          );
          await window.claude.sessions.save(persisted);
        }
      }
    };

    const unsubscribe = window.claude.omp.onExit((data) => {
      void handleSessionExit(data._sessionId, data);
    });
    return unsubscribe;
  }, [activeSessionIdRef, backgroundStoreRef, draftSessionIdRef, liveSessionIdsRef, sessionsRef, setDraftSessionId]);

  // Foreground panes consume their own OMP frames. Inactive, non-split panes use the background store.
  useEffect(() => {
    const unsubscribeEvent = window.claude.omp.onEvent((event) => {
      const sessionId = event._sessionId;
      if (sessionId === activeSessionIdRef.current) return;
      if (visibleSplitSessionIdsRef.current.includes(sessionId)) return;
      backgroundStoreRef.current.handleOMPEvent(event);
    });
    const unsubscribeStderr = window.claude.omp.onStderr((event) => {
      if (event._sessionId === activeSessionIdRef.current) return;
      if (visibleSplitSessionIdsRef.current.includes(event._sessionId)) return;
      backgroundStoreRef.current.handleOMPStderr(event._sessionId, event.data);
    });
    return () => {
      unsubscribeEvent();
      unsubscribeStderr();
    };
  }, [activeSessionIdRef, backgroundStoreRef, visibleSplitSessionIdsRef]);

  // Debounced active-session persistence.
  useEffect(() => {
    if (!activeSessionId || activeSessionId === DRAFT_ID || messages.length === 0) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const session = sessionsRef.current.find((entry) => entry.id === activeSessionId);
      if (!session) return;
      const sessionFile = sessionInfo?.agentName ?? session.agentSessionId;
      const data: PersistedSession = {
        id: activeSessionId,
        projectId: session.projectId,
        title: session.title,
        createdAt: session.createdAt,
        messages: messagesRef.current.filter((message) => !message.isQueued),
        model: session.model || sessionInfo?.model,
        effort: session.effort,
        permissionMode: session.permissionMode,
        planMode: session.planMode,
        totalCost: totalCostRef.current,
        contextUsage: contextUsageRef.current,
        engine: "omp",
        ...(sessionFile ? { agentSessionId: sessionFile } : {}),
      };
      void window.claude.sessions.save(data);
    }, 2000);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [activeSessionId, messages, saveTimerRef, sessionInfo?.agentName, sessionInfo?.model, sessionsRef]);

  // Synchronize active OMP metadata into the session list.
  useEffect(() => {
    if (!activeSessionId || activeSessionId === DRAFT_ID) return;

    let lastMessageAt: number | undefined;
    if (messages.length > 0) {
      if (lastMessageSyncSessionRef.current !== activeSessionId) {
        lastMessageSyncSessionRef.current = activeSessionId;
      } else {
        for (let index = messages.length - 1; index >= 0; index -= 1) {
          const message = messages[index];
          if (message.role === "user" && typeof message.timestamp === "number") {
            lastMessageAt = message.timestamp;
            break;
          }
        }
      }
    }

    setSessions((prev) => {
      let changed = false;
      const next = prev.map((session) => {
        if (session.id !== activeSessionId) return session;

        const updates: Partial<typeof session> = {};
        if (sessionInfo?.model && session.model !== sessionInfo.model) {
          updates.model = sessionInfo.model;
        }
        if (sessionInfo?.permissionMode && session.permissionMode !== sessionInfo.permissionMode) {
          updates.permissionMode = sessionInfo.permissionMode;
        }
        if (sessionInfo?.agentName && session.agentSessionId !== sessionInfo.agentName) {
          updates.agentSessionId = sessionInfo.agentName;
        }
        if (totalCost !== 0 && session.totalCost !== totalCost) {
          updates.totalCost = totalCost;
        }
        if (lastMessageAt !== undefined && session.lastMessageAt !== lastMessageAt) {
          updates.lastMessageAt = lastMessageAt;
        }
        if (session.isProcessing !== engine.isProcessing) {
          updates.isProcessing = engine.isProcessing;
        }
        if (!engine.pendingPermission && session.hasPendingPermission) {
          updates.hasPendingPermission = false;
        }

        if (Object.keys(updates).length === 0) return session;
        changed = true;
        return { ...session, ...updates };
      });
      return changed ? next : prev;
    });
  }, [activeSessionId, engine.isProcessing, engine.pendingPermission, messages.length, sessionInfo?.agentName, sessionInfo?.model, sessionInfo?.permissionMode, setSessions, totalCost]);

  const saveCurrentSession = useCallback(async () => {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId || sessionId === DRAFT_ID || messagesRef.current.length === 0) return;
    const session = sessionsRef.current.find((entry) => entry.id === sessionId);
    if (!session) return;

    const sessionFile = sessionInfoRef.current?.agentName ?? session.agentSessionId;
    const persisted = buildPersistedSession(
      {
        ...session,
        ...(sessionFile ? { agentSessionId: sessionFile } : {}),
      },
      messagesRef.current.filter((message) => !message.isQueued),
      totalCostRef.current,
      contextUsageRef.current,
    );
    await window.claude.sessions.save(persisted);
  }, [activeSessionIdRef, contextUsageRef, messagesRef, sessionInfoRef, sessionsRef, totalCostRef]);

  const seedBackgroundStore = useCallback(() => {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId || sessionId === DRAFT_ID) return;

    backgroundStoreRef.current.initFromState(sessionId, {
      messages: messagesRef.current,
      isProcessing: isProcessingRef.current,
      isConnected: isConnectedRef.current,
      isCompacting: isCompactingRef.current,
      sessionInfo: sessionInfoRef.current,
      totalCost: totalCostRef.current,
      contextUsage: contextUsageRef.current,
      pendingPermission: pendingPermissionRef.current,
      slashCommands: engine.slashCommands,
      supportedModels: engine.supportedModels,
      ompModels: [...engine.ompModels],
      thinkingLevels: engine.thinkingLevels,
      thinkingLevel: engine.thinkingLevel,
    });
  }, [activeSessionIdRef, backgroundStoreRef, contextUsageRef, engine.ompModels, engine.slashCommands, engine.supportedModels, engine.thinkingLevel, engine.thinkingLevels, isCompactingRef, isConnectedRef, isProcessingRef, messagesRef, pendingPermissionRef, sessionInfoRef, totalCostRef]);

  const generateSessionTitle = useCallback(async (sessionId: string, message: string, projectPath: string) => {
    const fallbackTitle = message.length > 60 ? `${message.slice(0, 57)}...` : message;
    const result = await window.claude.generateTitle(message, projectPath, "omp", sessionId);
    const title = result.title?.trim() || fallbackTitle;
    const session = sessionsRef.current.find((entry) => entry.id === sessionId);
    if (!session?.titleGenerating) return;

    setSessions((prev) => prev.map((entry) => (
      entry.id === sessionId ? { ...entry, title, titleGenerating: false } : entry
    )));
    const persisted = await window.claude.sessions.load(session.projectId, sessionId);
    if (persisted) await window.claude.sessions.save({ ...persisted, title, engine: "omp" });
  }, [sessionsRef, setSessions]);

  return {
    saveCurrentSession,
    seedBackgroundStore,
    generateSessionTitle,
  };
}
