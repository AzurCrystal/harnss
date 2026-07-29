import { useCallback } from "react";
import type { ImageAttachment, Project } from "../../types";
import { suppressNextSessionCompletion } from "../../lib/notification-utils";
import { capture } from "../../lib/analytics/analytics";
import { createSystemMessage } from "../../lib/message-factory";
import { getOmpResumeSession } from "../../lib/session/records";
import { DRAFT_ID, getOmpApprovalMode, getOmpThinkingLevel } from "./types";
import type { SharedSessionRefs, SharedSessionSetters, EngineHooks } from "./types";

interface UseSessionRevivalParams {
  refs: SharedSessionRefs;
  setters: SharedSessionSetters;
  engines: EngineHooks;
  findProject: (projectId: string) => Project | null;
  getProjectCwd: (project: Project) => string;
}

export function useSessionRevival({
  refs,
  setters,
  engines,
  findProject,
  getProjectCwd,
}: UseSessionRevivalParams) {
  const { omp } = engines;
  const { setSessions } = setters;
  const {
    activeSessionIdRef,
    sessionsRef,
    liveSessionIdsRef,
    startOptionsRef,
  } = refs;

  const reviveSession = useCallback(async (text: string, images?: ImageAttachment[], displayText?: string) => {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId || sessionId === DRAFT_ID) return;

    const session = sessionsRef.current.find((entry) => entry.id === sessionId);
    if (!session) return;
    const project = findProject(session.projectId);
    if (!project) return;

    const options = {
      ...startOptionsRef.current,
      model: session.model ?? startOptionsRef.current.model,
      effort: session.effort ?? startOptionsRef.current.effort,
      permissionMode: session.permissionMode ?? startOptionsRef.current.permissionMode,
      planMode: session.planMode ?? startOptionsRef.current.planMode,
    };
    const replacingLegacyIdentity = session.sourceEngine !== undefined && session.sourceEngine !== "omp";
    const resumeSession = getOmpResumeSession(session);
    const started = await window.claude.omp.start({
      sessionId,
      cwd: getProjectCwd(project),
      ...(resumeSession ? { resumeSession } : {}),
      approvalMode: getOmpApprovalMode(options.permissionMode),
    });
    if (started.error) {
      omp.setMessages((messages) => [
        ...messages,
        createSystemMessage(`恢复会话失败：${started.error}`, true),
      ]);
      return;
    }

    if (activeSessionIdRef.current !== sessionId) {
      suppressNextSessionCompletion(sessionId);
      const stopped = await window.claude.omp.stop(sessionId);
      if (stopped.error) throw new Error(stopped.error);
      return;
    }

    liveSessionIdsRef.current.add(sessionId);
    setSessions((sessions) => sessions.map((entry) => (
      entry.id === sessionId
        ? {
            ...entry,
            engine: "omp",
            sourceEngine: "omp",
            isActive: true,
            ...(replacingLegacyIdentity ? { agentSessionId: undefined } : {}),
          }
        : entry
    )));

    if (options.model?.trim() && options.model.trim().toLowerCase() !== "default") {
      const result = await omp.setModel(options.model);
      if (result.error) return;
    }
    const thinkingLevel = getOmpThinkingLevel(options);
    if (thinkingLevel) {
      const result = await omp.setThinkingLevel(thinkingLevel);
      if (result.error) return;
    }

    capture("session_revived", { engine: "omp", success: true });
    capture("message_sent", {
      engine: "omp",
      has_images: !!images?.length,
      message_length: text.length,
    });
    await omp.send(text, images, displayText);
  }, [
    activeSessionIdRef,
    findProject,
    getProjectCwd,
    liveSessionIdsRef,
    omp.send,
    omp.setMessages,
    omp.setModel,
    omp.setThinkingLevel,
    sessionsRef,
    setSessions,
    startOptionsRef,
  ]);

  return { reviveSession };
}
