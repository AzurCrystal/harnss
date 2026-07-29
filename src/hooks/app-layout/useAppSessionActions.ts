import { useCallback } from "react";
import { useProjectManager } from "@/hooks/useProjectManager";
import { useSessionManager } from "@/hooks/useSessionManager";
import { useSettingsCompat } from "@/hooks/useSettingsCompat";
import type { ImageAttachment } from "@/types";
import type { SettingsSection } from "@/components/SettingsView";
import { buildSessionOptions } from "./session-utils";

type SessionManagerState = ReturnType<typeof useSessionManager>;
type SettingsState = ReturnType<typeof useSettingsCompat>;
type ProjectManagerState = ReturnType<typeof useProjectManager>;

interface UseAppSessionActionsInput {
  manager: SessionManagerState;
  settings: SettingsState;
  setShowSettings: (show: SettingsSection | false) => void;
  activeSpaceId: string;
  projectManager: Pick<ProjectManagerState, "projects" | "createProject" | "createDevProject">;
}

export function useAppSessionActions(input: UseAppSessionActionsInput) {

  const handleAgentWorktreeChange = useCallback((nextPath: string | null) => {
    input.settings.setGitCwd(nextPath);

    const activeSession = input.manager.activeSession;
    if (input.manager.activeSessionId && !input.manager.isDraft && activeSession) {
      const options = buildSessionOptions(
        input.settings.getModelForEngine,
        input.settings.permissionMode,
        input.settings.planMode,
        input.settings.thinking,
      );
      void input.manager.createSession(activeSession.projectId, options);
    }
  }, [input.manager, input.settings]);


  const handleNewChat = useCallback(async (projectId: string) => {
    input.setShowSettings(false);
    input.settings.setPlanMode(false);
    await input.manager.createSession(
      projectId,
      buildSessionOptions(
        input.settings.getModelForEngine,
        input.settings.permissionMode,
        false,
        input.settings.thinking,
      ),
    );
  }, [input.manager, input.setShowSettings, input.settings]);

  const handleSend = useCallback(async (text: string, images?: ImageAttachment[], displayText?: string) => {
    await input.manager.send(text, images, displayText);
  }, [input.manager]);

  const handleModelChange = useCallback((nextModel: string) => {
    input.settings.setModel(nextModel);
    input.manager.setActiveModel(nextModel);
  }, [input.manager, input.settings]);

  const handlePermissionModeChange = useCallback((nextMode: string) => {
    input.settings.setPermissionMode(nextMode);
    input.manager.setActivePermissionMode(nextMode);
  }, [input.manager, input.settings]);

  const handlePlanModeChange = useCallback((enabled: boolean) => {
    input.settings.setPlanMode(enabled);
    input.manager.setActivePlanMode(enabled);
    if (enabled) {
      void input.manager.enterPlanMode?.();
    } else {
      void input.manager.exitPlanMode?.();
    }
  }, [input.manager, input.settings]);


  const handleStop = useCallback(async () => {
    await input.manager.interrupt();
  }, [input.manager]);

  const handleSendQueuedNow = useCallback(async (messageId: string) => {
    await input.manager.sendQueuedMessageNext(messageId);
  }, [input.manager]);

  const handleUnqueueMessage = useCallback((messageId: string) => {
    input.manager.unqueueMessage(messageId);
  }, [input.manager]);

  const handleSelectSession = useCallback((sessionId: string) => {
    input.setShowSettings(false);
    input.settings.setPlanMode(false);
    input.manager.switchSession(sessionId);
  }, [input.manager, input.setShowSettings, input.settings]);

  const handleCreateProject = useCallback(async () => {
    input.setShowSettings(false);
    await input.projectManager.createProject(input.activeSpaceId);
  }, [input.activeSpaceId, input.projectManager, input.setShowSettings]);

  const handleImportCCSession = useCallback(async (projectId: string, ccSessionId: string) => {
    await input.manager.importCCSession(projectId, ccSessionId);
  }, [input.manager]);

  const handleSeedDevExampleSpaceData = useCallback(async () => {
    if (!import.meta.env.DEV) return;
    const { seedDevExampleSpaceData } = await import("@/lib/dev-seeding/space-seeding");
    await seedDevExampleSpaceData({
      activeSpaceId: input.activeSpaceId,
      existingProjects: input.projectManager.projects,
      createDevProject: input.projectManager.createDevProject,
      saveSession: window.claude.sessions.save,
      refreshSessions: input.manager.refreshSessions,
    });
  }, [input.activeSpaceId, input.manager.refreshSessions, input.projectManager.createDevProject, input.projectManager.projects]);

  const handleNavigateToMessage = useCallback((sessionId: string, setScrollToMessageId: (messageId: string) => void, messageId: string) => {
    input.settings.setPlanMode(false);
    input.manager.switchSession(sessionId);
    setTimeout(() => setScrollToMessageId(messageId), 200);
  }, [input.manager, input.settings]);


  return {
    handleAgentWorktreeChange,
    handleNewChat,
    handleSend,
    handleModelChange,
    handlePermissionModeChange,
    handlePlanModeChange,
    handleStop,
    handleSendQueuedNow,
    handleUnqueueMessage,
    handleSelectSession,
    handleCreateProject,
    handleImportCCSession,
    handleSeedDevExampleSpaceData,
    handleNavigateToMessage,
  };
}
