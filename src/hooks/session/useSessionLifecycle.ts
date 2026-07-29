import { useCallback } from "react";
import type { ImageAttachment, Project } from "@/types";
import { createUserMessage } from "../../lib/message-factory";
import { capture } from "../../lib/analytics/analytics";
import { DRAFT_ID, getOmpThinkingLevel } from "./types";
import type { SharedSessionRefs, SharedSessionSetters, EngineHooks, StartOptions } from "./types";
import { useSessionCache } from "./useSessionCache";
import { useSessionCrud } from "./useSessionCrud";
import { useSessionSettings } from "./useSessionSettings";
import { useSessionRestart } from "./useSessionRestart";

interface UseSessionLifecycleParams {
  refs: SharedSessionRefs;
  setters: SharedSessionSetters;
  engines: EngineHooks;
  projects: Project[];
  activeSessionId: string | null;
  findProject: (projectId: string) => Project | null;
  getProjectCwd: (project: Project) => string;
  saveCurrentSession: () => Promise<void>;
  seedBackgroundStore: () => void;
  abandonDraftSession: (reason?: string) => void;
  materializeDraft: (text: string, images?: ImageAttachment[], displayText?: string) => Promise<string>;
  reviveSession: (text: string, images?: ImageAttachment[], displayText?: string) => Promise<void>;
  enqueueMessage: (text: string, images?: ImageAttachment[], displayText?: string) => void;
  clearQueue: () => void;
}

export function useSessionLifecycle({
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
}: UseSessionLifecycleParams) {
  const { omp } = engines;

  const {
    cacheSessionPayload,
    consumeCachedSessionPayload,
    applyLoadedSession,
    evictFromCache,
  } = useSessionCache({
    refs,
    setters,
    projects,
    activeSessionId,
  });

  const {
    createSession,
    switchSession,
    deleteSession,
    renameSession,
    deselectSession,
    importCCSession,
  } = useSessionCrud({
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
  });

  const {
    setActiveModel,
    setActivePermissionMode,
    setActivePlanMode,
    setActiveThinking,
    setActiveClaudeEffort,
    setActiveClaudeModelAndEffort,
    setSessionModel,
    setSessionPermissionMode,
    setSessionPlanMode,
    setSessionClaudeModelAndEffort,
  } = useSessionSettings({
    refs,
    setters,
    engines,
  });

  const {
    restartActiveSessionInCurrentWorktree,
    fullRevertSession,
  } = useSessionRestart({
    refs,
    setters,
    engines,
    findProject,
    getProjectCwd,
  });

  const applyDraftRuntimeSettings = useCallback(async (options: StartOptions) => {
    if (options.model?.trim() && options.model.trim().toLowerCase() !== "default") {
      const result = await omp.setModel(options.model);
      if (result.error) return false;
    }

    const thinkingLevel = getOmpThinkingLevel(options);
    if (!thinkingLevel) return true;
    const result = await omp.setThinkingLevel(thinkingLevel);
    return !result.error;
  }, [omp.setModel, omp.setThinkingLevel]);

  const send = useCallback(async (text: string, images?: ImageAttachment[], displayText?: string) => {
    const sessionId = refs.activeSessionIdRef.current;
    if (sessionId === DRAFT_ID) {
      const options = { ...refs.startOptionsRef.current, engine: "omp" as const };
      omp.setMessages((messages) => [
        ...messages,
        createUserMessage(text, images, displayText),
      ]);
      omp.setIsProcessing(true);

      const startedSessionId = await materializeDraft(text, images, displayText);
      if (!startedSessionId) {
        omp.setIsProcessing(false);
        return;
      }

      if (!await applyDraftRuntimeSettings(options)) {
        omp.setIsProcessing(false);
        return;
      }

      capture("message_sent", {
        engine: "omp",
        has_images: !!images?.length,
        message_length: text.length,
      });
      await omp.sendRaw(text, images);
      return;
    }

    if (!sessionId) return;
    if (refs.isProcessingRef.current && refs.liveSessionIdsRef.current.has(sessionId)) {
      enqueueMessage(text, images, displayText);
      return;
    }

    if (refs.liveSessionIdsRef.current.has(sessionId)) {
      capture("message_sent", {
        engine: "omp",
        has_images: !!images?.length,
        message_length: text.length,
      });
      await omp.send(text, images, displayText);
      return;
    }

    await reviveSession(text, images, displayText);
  }, [
    applyDraftRuntimeSettings,
    enqueueMessage,
    materializeDraft,
    omp.send,
    omp.sendRaw,
    omp.setIsProcessing,
    omp.setMessages,
    refs,
    reviveSession,
  ]);

  return {
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
    setActiveClaudeEffort,
    setActiveClaudeModelAndEffort,
    setSessionClaudeModelAndEffort,
    restartActiveSessionInCurrentWorktree,
    fullRevertSession,
    send,
  };
}
