import { useCallback } from "react";
import { toast } from "sonner";
import type { ClaudeEffort, PersistedSession } from "../../types";
import { capture } from "../../lib/analytics/analytics";
import { DRAFT_ID, getOmpThinkingLevel } from "./types";
import type { SharedSessionRefs, SharedSessionSetters, EngineHooks, StartOptions } from "./types";

interface UseSessionSettingsParams {
  refs: SharedSessionRefs;
  setters: SharedSessionSetters;
  engines: EngineHooks;
}

export function useSessionSettings({ refs, setters, engines }: UseSessionSettingsParams) {
  const { omp } = engines;
  const { setSessions, setStartOptions } = setters;
  const {
    activeSessionIdRef,
    sessionsRef,
    liveSessionIdsRef,
    startOptionsRef,
  } = refs;

  const persistSessionPatch = useCallback((sessionId: string, patch: Partial<PersistedSession>) => {
    const session = sessionsRef.current.find((entry) => entry.id === sessionId);
    if (!session) return;

    const ompPatch: Partial<PersistedSession> = { ...patch, engine: "omp" };
    setSessions((sessions) => sessions.map((entry) => (
      entry.id === sessionId ? { ...entry, ...ompPatch } : entry
    )));
    window.claude.sessions.load(session.projectId, sessionId).then((data) => {
      if (data) return window.claude.sessions.save({ ...data, ...ompPatch });
    }).catch(() => { /* session may have been deleted */ });
  }, [sessionsRef, setSessions]);

  const applyActiveModel = useCallback(async (sessionId: string, model: string) => {
    if (sessionId !== activeSessionIdRef.current || !liveSessionIdsRef.current.has(sessionId)) return true;
    if (!model.trim() || model.trim().toLowerCase() === "default") return true;

    const result = await omp.setModel(model);
    if (!result.error) return true;
    toast.error("切换模型失败", { description: result.error });
    return false;
  }, [activeSessionIdRef, liveSessionIdsRef, omp.setModel]);

  const applyActiveThinkingLevel = useCallback(async (sessionId: string, options: StartOptions) => {
    const level = getOmpThinkingLevel(options);
    if (!level || sessionId !== activeSessionIdRef.current || !liveSessionIdsRef.current.has(sessionId)) return true;

    const result = await omp.setThinkingLevel(level);
    if (!result.error) return true;
    toast.error("更新思考级别失败", { description: result.error });
    return false;
  }, [activeSessionIdRef, liveSessionIdsRef, omp.setThinkingLevel]);

  const setActiveModel = useCallback(async (model: string) => {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId) return;

    setStartOptions((options) => ({ ...options, model }));
    if (sessionId === DRAFT_ID) return;
    if (!await applyActiveModel(sessionId, model)) return;
    persistSessionPatch(sessionId, { model });
  }, [activeSessionIdRef, applyActiveModel, persistSessionPatch, setStartOptions]);

  const setActivePermissionMode = useCallback(async (permissionMode: string) => {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId) return;

    setStartOptions((options) => ({ ...options, permissionMode }));
    if (sessionId === DRAFT_ID) return;
    await omp.setPermissionMode(permissionMode);
    persistSessionPatch(sessionId, { permissionMode });
  }, [activeSessionIdRef, omp.setPermissionMode, persistSessionPatch, setStartOptions]);

  const setActivePlanMode = useCallback((planMode: boolean) => {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId) return;

    setStartOptions((options) => ({ ...options, planMode }));
    if (sessionId === DRAFT_ID) return;
    persistSessionPatch(sessionId, { planMode });
  }, [activeSessionIdRef, persistSessionPatch, setStartOptions]);

  const setActiveThinking = useCallback(async (thinkingEnabled: boolean) => {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId) return;

    const options = { ...startOptionsRef.current, thinkingEnabled };
    setStartOptions(options);
    capture("thinking_toggled", { enabled: thinkingEnabled });
    if (sessionId === DRAFT_ID) return;
    await applyActiveThinkingLevel(sessionId, options);
  }, [activeSessionIdRef, applyActiveThinkingLevel, setStartOptions, startOptionsRef]);

  const setActiveClaudeEffort = useCallback(async (effort: ClaudeEffort) => {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId) return;

    const options = { ...startOptionsRef.current, effort };
    setStartOptions(options);
    if (sessionId === DRAFT_ID) return;
    if (!await applyActiveThinkingLevel(sessionId, options)) return;
    persistSessionPatch(sessionId, { effort });
  }, [activeSessionIdRef, applyActiveThinkingLevel, persistSessionPatch, setStartOptions, startOptionsRef]);

  const setActiveClaudeModelAndEffort = useCallback(async (model: string, effort: ClaudeEffort) => {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId) return;

    const options = { ...startOptionsRef.current, model, effort };
    setStartOptions(options);
    if (sessionId === DRAFT_ID) return;
    if (!await applyActiveModel(sessionId, model)) return;
    if (!await applyActiveThinkingLevel(sessionId, options)) return;
    persistSessionPatch(sessionId, { model, effort });
  }, [
    activeSessionIdRef,
    applyActiveModel,
    applyActiveThinkingLevel,
    persistSessionPatch,
    setStartOptions,
    startOptionsRef,
  ]);

  const setSessionModel = useCallback(async (sessionId: string, model: string) => {
    if (!sessionId || sessionId === DRAFT_ID) return;
    if (!sessionsRef.current.some((entry) => entry.id === sessionId)) return;

    if (!await applyActiveModel(sessionId, model)) return;
    persistSessionPatch(sessionId, { model });
  }, [applyActiveModel, persistSessionPatch, sessionsRef]);

  const setSessionPermissionMode = useCallback(async (sessionId: string, permissionMode: string) => {
    if (!sessionId || sessionId === DRAFT_ID) return;
    if (!sessionsRef.current.some((entry) => entry.id === sessionId)) return;
    if (sessionId === activeSessionIdRef.current) await omp.setPermissionMode(permissionMode);
    persistSessionPatch(sessionId, { permissionMode });
  }, [activeSessionIdRef, omp.setPermissionMode, persistSessionPatch, sessionsRef]);

  const setSessionPlanMode = useCallback((sessionId: string, planMode: boolean) => {
    if (!sessionId || sessionId === DRAFT_ID) return;
    if (!sessionsRef.current.some((entry) => entry.id === sessionId)) return;
    persistSessionPatch(sessionId, { planMode });
  }, [persistSessionPatch, sessionsRef]);

  const setSessionClaudeModelAndEffort = useCallback(async (
    sessionId: string,
    model: string,
    effort: ClaudeEffort,
  ) => {
    if (!sessionId || sessionId === DRAFT_ID) return;
    const session = sessionsRef.current.find((entry) => entry.id === sessionId);
    if (!session) return;

    const options = {
      ...startOptionsRef.current,
      model,
      effort,
      permissionMode: session.permissionMode ?? startOptionsRef.current.permissionMode,
      planMode: session.planMode ?? startOptionsRef.current.planMode,
    };
    if (!await applyActiveModel(sessionId, model)) return;
    if (!await applyActiveThinkingLevel(sessionId, options)) return;
    persistSessionPatch(sessionId, { model, effort });
  }, [
    applyActiveModel,
    applyActiveThinkingLevel,
    persistSessionPatch,
    sessionsRef,
    startOptionsRef,
  ]);

  return {
    persistSessionPatch,
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
  };
}
