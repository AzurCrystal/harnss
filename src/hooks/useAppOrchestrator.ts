import { useCallback, useEffect } from "react";
import { useProjectManager } from "@/hooks/useProjectManager";
import { useSessionManager } from "@/hooks/useSessionManager";
import { useSidebar } from "@/hooks/useSidebar";
import { useSpaceManager } from "@/hooks/useSpaceManager";
import { useSettingsCompat as useSettings } from "@/hooks/useSettingsCompat";
import { useTheme } from "@/hooks/useTheme";
import { useSpaceTerminals } from "@/hooks/useSpaceTerminals";
import { useSplitView } from "@/hooks/useSplitView";
import { useFolderManager } from "@/hooks/useFolderManager";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { resolveModelValue } from "@/lib/model-utils";
import type { ToolId } from "@/types/tools";
import type { AcpPermissionBehavior, EngineId } from "@/types";
import { getSyncedPlanMode } from "@/hooks/app-layout/session-utils";
import { useAppEnvironmentState } from "@/hooks/app-layout/useAppEnvironmentState";
import { useAppSessionActions } from "@/hooks/app-layout/useAppSessionActions";
import { useAppSpaceWorkflow } from "@/hooks/app-layout/useAppSpaceWorkflow";
import { useAppContextualPanels } from "@/hooks/app-layout/useAppContextualPanels";

export { getSyncedPlanMode } from "@/hooks/app-layout/session-utils";

export function useAppOrchestrator() {
  const sidebar = useSidebar();
  const splitView = useSplitView();
  const projectManager = useProjectManager();
  const spaceManager = useSpaceManager();
  // Read ACP permission behavior early — it's a global setting (same localStorage key as useSettings)
  // so we can read it before useSettings which depends on manager.activeSession for per-project scoping
  const acpPermissionBehavior = (localStorage.getItem("harnss-acp-permission-behavior") ?? "ask") as AcpPermissionBehavior;
  const manager = useSessionManager(
    projectManager.projects,
    acpPermissionBehavior,
    spaceManager.setActiveSpaceId,
    splitView.visibleSessionIds,
  );

  const settingsEngine: EngineId = "omp";
  const settingsProjectId = manager.activeSession?.projectId ?? manager.draftProjectId ?? null;
  const settings = useSettings(settingsProjectId, settingsEngine);
  const resolvedTheme = useTheme(settings.theme);
  const spaceTerminals = useSpaceTerminals();

  // ── Tool toggle with suppression ──

  const handleToggleTool = useCallback(
    (toolId: ToolId) => {
      const isContextual = toolId === "tasks" || toolId === "agents";
      settings.setActiveTools((prev) => {
        const next = new Set(prev);
        if (next.has(toolId)) {
          next.delete(toolId);
          // User manually closed a contextual panel — suppress auto-open
          if (isContextual) settings.suppressPanel(toolId);
        } else {
          next.add(toolId);
          // User manually opened a contextual panel — clear suppression
          if (isContextual) settings.unsuppressPanel(toolId);
        }
        return next;
      });
    },
    [settings],
  );

  // Reorder panel tools in the ToolPicker (moves fromId to toId's position)
  const handleToolReorder = useCallback(
    (fromId: ToolId, toId: ToolId) => {
      settings.setToolOrder((prev) => {
        const next = [...prev];
        const fromIdx = next.indexOf(fromId);
        const toIdx = next.indexOf(toId);
        if (fromIdx < 0 || toIdx < 0) return prev;
        next.splice(fromIdx, 1);
        next.splice(toIdx, 0, fromId);
        return next;
      });
    },
    [settings],
  );
  const environment = useAppEnvironmentState({
    macBackgroundEffect: settings.macBackgroundEffect,
    setMacBackgroundEffect: settings.setMacBackgroundEffect,
    transparency: settings.transparency,
    theme: settings.theme,
    pendingPermission: manager.pendingPermission,
    activeSessionId: manager.activeSessionId,
    activeSession: manager.activeSession,
    sessionInfo: manager.sessionInfo,
    isProcessing: manager.isProcessing,
    onOpenSession: manager.switchSession,
  });

  const sessionActions = useAppSessionActions({
    manager,
    settings,
    setShowSettings: environment.setShowSettings,
    activeSpaceId: spaceManager.activeSpaceId,
    projectManager,
  });

  const spaceWorkflow = useAppSpaceWorkflow({
    projectManager,
    spaceManager,
    manager,
    splitView,
    handleNewChat: sessionActions.handleNewChat,
    destroySpaceTerminals: spaceTerminals.destroySpaceTerminals,
  });

  const contextualState = useAppContextualPanels({
    manager,
    settings,
    isSpaceSwitching: spaceWorkflow.isSpaceSwitching,
  });

  useEffect(() => {
    const ompModels = manager.supportedModels;
    if (ompModels.length === 0) return;

    const currentModel = settings.getModelForEngine("omp");
    const resolvedModel = resolveModelValue(currentModel, ompModels);
    if (resolvedModel && resolvedModel !== currentModel) {
      settings.setModelForEngine("omp", resolvedModel);
    }
  }, [manager.supportedModels, settings.getModelForEngine, settings.setModelForEngine]);

  // Sync the active OMP session model into the existing frontend setting value.
  useEffect(() => {
    if (!manager.activeSessionId || manager.isDraft || manager.supportedModels.length === 0) return;
    const session = manager.sessions.find((entry) => entry.id === manager.activeSessionId);
    if (!session?.model) return;

    const syncedModel = resolveModelValue(session.model, manager.supportedModels) ?? session.model;
    if (syncedModel !== settings.getModelForEngine("omp")) {
      settings.setModelForEngine("omp", syncedModel);
    }
  }, [manager.activeSessionId, manager.isDraft, manager.sessions, manager.supportedModels, settings.getModelForEngine, settings.setModelForEngine]);


  // ── Keyboard shortcuts ──
  useKeyboardShortcuts({
    planMode: settings.planMode,
    setPlanMode: settings.setPlanMode,
    setActivePlanMode: manager.setActivePlanMode,
    activeSessionId: manager.activeSessionId,
    setChatSearchOpen: environment.setChatSearchOpen,
  });

  // Sync plan toggle to the active chat session (handles both sessionInfo.permissionMode
  // changes like ExitPlanMode and session switches).
  useEffect(() => {
    if (!manager.activeSessionId || manager.isDraft || !manager.activeSession) return;
    const nextPlanMode = getSyncedPlanMode(
      manager.activeSession.planMode,
      manager.sessionInfo?.permissionMode,
    );
    if (settings.planMode !== nextPlanMode) settings.setPlanMode(nextPlanMode);
    if (!!manager.activeSession.planMode !== nextPlanMode) {
      manager.setActivePlanMode(nextPlanMode);
    }
  }, [
    manager.activeSessionId,
    manager.activeSession?.planMode,
    manager.isDraft,
    manager.sessionInfo?.permissionMode,
    manager.setActivePlanMode,
    settings.planMode,
    settings.setPlanMode,
  ]);

  const activeSpaceTerminals = spaceTerminals.getSpaceState(spaceManager.activeSpaceId);

  // ── Folder & Pin management ──
  const folders = useFolderManager({
    projects: projectManager.projects,
    setSessions: manager.setSessions,
  });

  const ui = {
    showSettings: environment.showSettings,
    setShowSettings: environment.setShowSettings,
    scrollToMessageId: environment.scrollToMessageId,
    setScrollToMessageId: environment.setScrollToMessageId,
    chatSearchOpen: environment.chatSearchOpen,
    setChatSearchOpen: environment.setChatSearchOpen,
  };

  const state = {
    activeProjectId: spaceWorkflow.activeProjectId,
    activeProject: spaceWorkflow.activeProject,
    activeProjectPath: spaceWorkflow.activeProjectPath,
    activeSpaceProject: spaceWorkflow.activeSpaceProject,
    activeSpaceTerminalCwd: spaceWorkflow.activeSpaceTerminalCwd,
    showThinking: true as const,
    settingsEngine,
    hasProjects: spaceWorkflow.hasProjects,
    isSpaceSwitching: spaceWorkflow.isSpaceSwitching,
    showToolPicker: contextualState.showToolPicker,
    hasRightPanel: contextualState.hasRightPanel,
    hasToolsColumn: contextualState.hasToolsColumn,
    hasBottomTools: contextualState.hasBottomTools,
    activeTodos: contextualState.activeTodos,
    bgAgents: contextualState.bgAgents,
    hasTodos: contextualState.hasTodos,
    hasAgents: contextualState.hasAgents,
    availableContextual: contextualState.availableContextual,
    glassSupported: environment.glassSupported,
    macLiquidGlassSupported: environment.macLiquidGlassSupported,
    liveMacBackgroundEffect: environment.liveMacBackgroundEffect,
    devFillEnabled: environment.devFillEnabled,
    jiraBoardEnabled: environment.jiraBoardEnabled,
    draftSpaceId: spaceWorkflow.draftSpaceId,
  };


  const actions = {
    handleToggleTool,
    handleToolReorder,
    handleNewChat: sessionActions.handleNewChat,
    handleSend: sessionActions.handleSend,
    handleModelChange: sessionActions.handleModelChange,
    handlePermissionModeChange: sessionActions.handlePermissionModeChange,
    handlePlanModeChange: sessionActions.handlePlanModeChange,
    handleAgentWorktreeChange: sessionActions.handleAgentWorktreeChange,
    handleStop: sessionActions.handleStop,
    handleSendQueuedNow: sessionActions.handleSendQueuedNow,
    handleUnqueueMessage: sessionActions.handleUnqueueMessage,
    handleSelectSession: sessionActions.handleSelectSession,
    handleCreateProject: sessionActions.handleCreateProject,
    handleImportCCSession: sessionActions.handleImportCCSession,
    handleSeedDevExampleSpaceData: sessionActions.handleSeedDevExampleSpaceData,
    handleNavigateToMessage: (sessionId: string, messageId: string) => sessionActions.handleNavigateToMessage(sessionId, environment.setScrollToMessageId, messageId),
    handleStartCreateSpace: spaceWorkflow.handleStartCreateSpace,
    handleConfirmCreateSpace: spaceWorkflow.handleConfirmCreateSpace,
    handleCancelCreateSpace: spaceWorkflow.handleCancelCreateSpace,
    handleUpdateSpace: spaceWorkflow.handleUpdateSpace,
    handleDeleteSpace: spaceWorkflow.handleDeleteSpace,
    handleMoveProjectToSpace: spaceWorkflow.handleMoveProjectToSpace,
    ...folders,
  };

  const managers = {
    sidebar,
    splitView,
    projectManager,
    spaceManager,
    manager,
    settings,
    resolvedTheme,
    spaceTerminals,
    activeSpaceTerminals,
  };

  return {
    managers,
    state,
    ui,
    actions,

    // Core managers
    sidebar,
    splitView,
    projectManager,
    spaceManager,
    manager,
    settings,
    resolvedTheme,


    // Derived state
    activeProjectId: spaceWorkflow.activeProjectId,
    activeProject: spaceWorkflow.activeProject,
    activeProjectPath: spaceWorkflow.activeProjectPath,
    activeSpaceProject: spaceWorkflow.activeSpaceProject,
    activeSpaceTerminalCwd: spaceWorkflow.activeSpaceTerminalCwd,
    showThinking: true as const,
    settingsEngine,
    hasProjects: spaceWorkflow.hasProjects,
    isSpaceSwitching: spaceWorkflow.isSpaceSwitching,
    showToolPicker: contextualState.showToolPicker,
    hasRightPanel: contextualState.hasRightPanel,
    hasToolsColumn: contextualState.hasToolsColumn,
    hasBottomTools: contextualState.hasBottomTools,
    activeTodos: contextualState.activeTodos,
    bgAgents: contextualState.bgAgents,
    hasTodos: contextualState.hasTodos,
    hasAgents: contextualState.hasAgents,
    availableContextual: contextualState.availableContextual,
    glassSupported: environment.glassSupported,
    macLiquidGlassSupported: environment.macLiquidGlassSupported,
    liveMacBackgroundEffect: environment.liveMacBackgroundEffect,
    devFillEnabled: environment.devFillEnabled,
    jiraBoardEnabled: environment.jiraBoardEnabled,

    // Settings view
    showSettings: ui.showSettings,
    setShowSettings: ui.setShowSettings,

    // Space management (draft = real space, deleted on cancel)
    draftSpaceId: state.draftSpaceId,

    // Scroll navigation
    scrollToMessageId: ui.scrollToMessageId,
    setScrollToMessageId: ui.setScrollToMessageId,

    // In-chat search
    chatSearchOpen: ui.chatSearchOpen,
    setChatSearchOpen: ui.setChatSearchOpen,

    // Terminals
    spaceTerminals,
    activeSpaceTerminals,

    // Callbacks
    handleToggleTool,
    handleToolReorder,
    handleNewChat: sessionActions.handleNewChat,
    handleSend: sessionActions.handleSend,
    handleModelChange: sessionActions.handleModelChange,
    handlePermissionModeChange: sessionActions.handlePermissionModeChange,
    handlePlanModeChange: sessionActions.handlePlanModeChange,
    handleAgentWorktreeChange: sessionActions.handleAgentWorktreeChange,
    handleStop: sessionActions.handleStop,
    handleSendQueuedNow: sessionActions.handleSendQueuedNow,
    handleUnqueueMessage: sessionActions.handleUnqueueMessage,
    handleSelectSession: sessionActions.handleSelectSession,
    handleCreateProject: sessionActions.handleCreateProject,
    handleImportCCSession: sessionActions.handleImportCCSession,
    handleSeedDevExampleSpaceData: sessionActions.handleSeedDevExampleSpaceData,
    handleNavigateToMessage: (sessionId: string, messageId: string) => sessionActions.handleNavigateToMessage(sessionId, environment.setScrollToMessageId, messageId),
    handleStartCreateSpace: spaceWorkflow.handleStartCreateSpace,
    handleConfirmCreateSpace: spaceWorkflow.handleConfirmCreateSpace,
    handleCancelCreateSpace: spaceWorkflow.handleCancelCreateSpace,
    handleUpdateSpace: spaceWorkflow.handleUpdateSpace,
    handleDeleteSpace: spaceWorkflow.handleDeleteSpace,
    handleMoveProjectToSpace: spaceWorkflow.handleMoveProjectToSpace,

    // Folder & Pin management
    ...folders,
  };
}
