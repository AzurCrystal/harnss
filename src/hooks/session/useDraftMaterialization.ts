import { useCallback } from "react";
import { flushSync } from "react-dom";
import type { ChatSession, ImageAttachment, Project, UIMessage } from "../../types";
import { suppressNextSessionCompletion } from "../../lib/notification-utils";
import { captureException } from "../../lib/analytics/analytics";
import { createSystemMessage, createUserMessage } from "../../lib/message-factory";
import { DRAFT_ID, getOmpApprovalMode } from "./types";
import type { SharedSessionRefs, SharedSessionSetters } from "./types";

interface UseDraftMaterializationParams {
  refs: SharedSessionRefs;
  setters: SharedSessionSetters;
  findProject: (projectId: string) => Project | null;
  getProjectCwd: (project: Project) => string;
  generateSessionTitle: (sessionId: string, message: string, projectPath: string) => Promise<void>;
}

export function useDraftMaterialization({
  refs,
  setters,
  findProject,
  getProjectCwd,
  generateSessionTitle,
}: UseDraftMaterializationParams) {
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
    setDraftProjectId,
    setDraftSessionId,
  } = setters;
  const {
    activeSessionIdRef,
    draftProjectIdRef,
    startOptionsRef,
    liveSessionIdsRef,
    backgroundStoreRef,
    draftSessionIdRef,
    materializingRef,
    currentBranchRef,
  } = refs;

  const abandonDraftSession = useCallback((reason = "cleanup") => {
    void reason;
    if (!draftSessionIdRef.current) return;
    draftSessionIdRef.current = null;
    setDraftSessionId(null);
  }, [draftSessionIdRef, setDraftSessionId]);

  const materializeDraft = useCallback(
    async (text: string, images?: ImageAttachment[], displayText?: string) => {
      if (materializingRef.current) return "";
      materializingRef.current = true;

      const projectId = draftProjectIdRef.current;
      const project = projectId ? findProject(projectId) : null;
      if (!project) {
        materializingRef.current = false;
        return "";
      }

      const options = startOptionsRef.current;
      const sessionId = crypto.randomUUID();
      const now = Date.now();
      const currentBranch = currentBranchRef.current;
      const messages: UIMessage[] = [createUserMessage(text, images, displayText)];
      const session: ChatSession = {
        id: sessionId,
        projectId: project.id,
        title: "新对话",
        createdAt: now,
        lastMessageAt: now,
        model: options.model,
        effort: options.effort,
        permissionMode: options.permissionMode,
        planMode: !!options.planMode,
        totalCost: 0,
        isActive: true,
        titleGenerating: true,
        ...(currentBranch ? { branch: currentBranch } : {}),
        engine: "omp",
      };
      draftSessionIdRef.current = sessionId;
      setDraftSessionId(sessionId);

      const isCurrentMaterialization = () => (
        draftSessionIdRef.current === sessionId
        && activeSessionIdRef.current === sessionId
      );
      const failDraft = (error: string) => {
        if (!isCurrentMaterialization()) return;

        const failedId = `failed-omp-${Date.now()}`;
        const failedMessages = [...messages, createSystemMessage(error, true)];
        const failedSession: ChatSession = {
          ...session,
          id: failedId,
          titleGenerating: false,
        };

        flushSync(() => {
          setSessions((prev) => [
            failedSession,
            ...prev
              .filter((entry) => entry.id !== DRAFT_ID && entry.id !== sessionId)
              .map((entry) => ({ ...entry, isActive: false })),
          ]);
          setInitialMessages(failedMessages);
          setInitialMeta({
            isProcessing: false,
            isConnected: false,
            sessionInfo: null,
            totalCost: 0,
            contextUsage: null,
          });
          setInitialPermission(null);
          setInitialSupportedModels([]);
          setInitialOmpModels([]);
          setInitialThinkingLevels([]);
          setInitialThinkingLevel(undefined);
          setInitialSlashCommands([]);
          setActiveSessionId(failedId);
          setDraftProjectId(null);
        });
        void window.claude.sessions.save({
          ...failedSession,
          messages: failedMessages,
        });
      };

      flushSync(() => {
        setSessions((prev) => [
          session,
          ...prev
            .filter((entry) => entry.id !== DRAFT_ID && entry.id !== sessionId)
            .map((entry) => ({ ...entry, isActive: false })),
        ]);
        setInitialMessages(messages);
        setInitialMeta({
          isProcessing: true,
          isConnected: false,
          sessionInfo: null,
          totalCost: 0,
          contextUsage: null,
        });
        setInitialPermission(null);
        setInitialSupportedModels([]);
        setInitialOmpModels([]);
        setInitialThinkingLevels([]);
        setInitialThinkingLevel(undefined);
        setInitialSlashCommands([]);
        setActiveSessionId(sessionId);
        setDraftProjectId(null);
      });

      try {
        const result = await window.claude.omp.start({
          sessionId,
          cwd: getProjectCwd(project),
          approvalMode: getOmpApprovalMode(options.permissionMode),
        });
        if (result.error) {
          failDraft(result.error);
          return "";
        }

        if (!isCurrentMaterialization()) {
          suppressNextSessionCompletion(sessionId);
          const stopped = await window.claude.omp.stop(sessionId);
          if (stopped.error) throw new Error(stopped.error);
          backgroundStoreRef.current.delete(sessionId);
          setSessions((prev) => prev.filter((entry) => entry.id !== sessionId));
          return "";
        }

        liveSessionIdsRef.current.add(sessionId);
        void generateSessionTitle(sessionId, text, getProjectCwd(project));
        return sessionId;
      } catch (error) {
        captureException(error instanceof Error ? error : new Error(String(error)), { label: "OMP_START_ERR" });
        failDraft(error instanceof Error ? error.message : String(error));
        throw error;
      } finally {
        if (draftSessionIdRef.current === sessionId) {
          draftSessionIdRef.current = null;
          setDraftSessionId(null);
        }
        materializingRef.current = false;
      }
    },
    [
      activeSessionIdRef,
      backgroundStoreRef,
      currentBranchRef,
      draftProjectIdRef,
      draftSessionIdRef,
      findProject,
      generateSessionTitle,
      getProjectCwd,
      liveSessionIdsRef,
      materializingRef,
      setActiveSessionId,
      setDraftProjectId,
      setDraftSessionId,
      setInitialMessages,
      setInitialMeta,
      setInitialPermission,
      setInitialSupportedModels,
      setInitialOmpModels,
      setInitialThinkingLevels,
      setInitialThinkingLevel,
      setInitialSlashCommands,
      setSessions,
      startOptionsRef,
    ],
  );

  return {
    abandonDraftSession,
    materializeDraft,
  };
}
