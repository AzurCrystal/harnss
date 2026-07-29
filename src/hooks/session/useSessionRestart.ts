import { useCallback } from "react";
import type { Project } from "../../types";
import { suppressNextSessionCompletion } from "../../lib/notification-utils";
import { createSystemMessage } from "../../lib/message-factory";
import { getOmpResumeSession } from "../../lib/session/records";
import { DRAFT_ID, getOmpApprovalMode, getOmpThinkingLevel } from "./types";
import type { SharedSessionRefs, SharedSessionSetters, EngineHooks } from "./types";

interface UseSessionRestartParams {
  refs: SharedSessionRefs;
  setters: SharedSessionSetters;
  engines: EngineHooks;
  findProject: (projectId: string) => Project | null;
  getProjectCwd: (project: Project) => string;
}

export function useSessionRestart({
  refs,
  setters,
  engines,
  findProject,
  getProjectCwd,
}: UseSessionRestartParams) {
  const { omp } = engines;
  const { setSessions } = setters;
  const {
    activeSessionIdRef,
    sessionsRef,
    isProcessingRef,
    liveSessionIdsRef,
    backgroundStoreRef,
    startOptionsRef,
  } = refs;

  const restartActiveSessionInCurrentWorktree = useCallback(async (): Promise<{ ok?: boolean; error?: string }> => {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId || sessionId === DRAFT_ID) return { ok: true };
    if (isProcessingRef.current) {
      return { error: "请等待当前轮次完成后，再在另一个工作树中重启会话。" };
    }

    const session = sessionsRef.current.find((entry) => entry.id === sessionId);
    if (!session) return { error: "找不到当前会话。" };
    const project = findProject(session.projectId);
    if (!project) return { error: "找不到项目。" };

    const options = {
      ...startOptionsRef.current,
      model: session.model ?? startOptionsRef.current.model,
      effort: session.effort ?? startOptionsRef.current.effort,
      permissionMode: session.permissionMode ?? startOptionsRef.current.permissionMode,
      planMode: session.planMode ?? startOptionsRef.current.planMode,
    };
    const replacingLegacyIdentity = session.sourceEngine !== undefined && session.sourceEngine !== "omp";
    const resumeSession = getOmpResumeSession(session);

    if (liveSessionIdsRef.current.has(sessionId)) {
      suppressNextSessionCompletion(sessionId);
      const stopped = await window.claude.omp.stop(sessionId);
      if (stopped.error) {
        omp.setMessages((messages) => [
          ...messages,
          createSystemMessage(`停止会话失败：${stopped.error}`, true),
        ]);
        return { error: stopped.error };
      }
      liveSessionIdsRef.current.delete(sessionId);
    }
    backgroundStoreRef.current.delete(sessionId);

    const started = await window.claude.omp.start({
      sessionId,
      cwd: getProjectCwd(project),
      ...(resumeSession ? { resumeSession } : {}),
      approvalMode: getOmpApprovalMode(options.permissionMode),
    });
    if (started.error) {
      omp.setMessages((messages) => [
        ...messages,
        createSystemMessage(`重启会话失败：${started.error}`, true),
      ]);
      return { error: started.error };
    }

    if (activeSessionIdRef.current !== sessionId) {
      suppressNextSessionCompletion(sessionId);
      const stopped = await window.claude.omp.stop(sessionId);
      if (stopped.error) return { error: stopped.error };
      return { ok: true };
    }

    liveSessionIdsRef.current.add(sessionId);
    setSessions((sessions) => sessions.map((entry) => (
      entry.id === sessionId
        ? {
            ...entry,
            engine: "omp",
            sourceEngine: "omp",
            ...(replacingLegacyIdentity ? { agentSessionId: undefined } : {}),
          }
        : entry
    )));

    if (options.model?.trim() && options.model.trim().toLowerCase() !== "default") {
      const result = await omp.setModel(options.model);
      if (result.error) return { error: result.error };
    }
    const thinkingLevel = getOmpThinkingLevel(options);
    if (thinkingLevel) {
      const result = await omp.setThinkingLevel(thinkingLevel);
      if (result.error) return { error: result.error };
    }

    return { ok: true };
  }, [
    activeSessionIdRef,
    backgroundStoreRef,
    findProject,
    getProjectCwd,
    isProcessingRef,
    liveSessionIdsRef,
    omp.setMessages,
    omp.setModel,
    omp.setThinkingLevel,
    sessionsRef,
    setSessions,
    startOptionsRef,
  ]);

  const fullRevertSession = useCallback(async (_checkpointId: string) => {
    if (!activeSessionIdRef.current || activeSessionIdRef.current === DRAFT_ID) return;
    omp.setMessages((messages) => [
      ...messages,
      createSystemMessage("无法通过 OMP RPC 协议执行完整还原。", true),
    ]);
  }, [activeSessionIdRef, omp.setMessages]);

  return {
    restartActiveSessionInCurrentWorktree,
    fullRevertSession,
  };
}
