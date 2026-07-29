/**
 * Shared types for the pane controller pattern.
 *
 * A PaneController encapsulates all model/permission/send/stop
 * callbacks for a single chat pane — used identically by both
 * the single-chat view and each split-view pane.
 */

import type { ImageAttachment, SlashCommand, EngineId, ModelInfo, GrabbedElement } from "@/types";
import type { OMPHookState } from "@/hooks/useOMP";
import type { TerminalTab } from "@/lib/terminal-tabs";
import type { ResolvedTheme } from "@/hooks/useTheme";

export interface PaneController {
  paneEngine: EngineId;
  paneModel: string;
  paneHeaderModel: string;
  panePermissionMode: string;
  panePlanMode: boolean;
  paneSupportedModels: ModelInfo[];
  paneSlashCommands: SlashCommand[];
  paneThinkingLevels: OMPHookState["thinkingLevels"];
  paneThinkingLevel: OMPHookState["thinkingLevel"];
  handlePaneModelChange: (nextModel: string) => void;
  handlePaneThinkingLevelChange: (level: NonNullable<OMPHookState["thinkingLevel"]>) => void;
  handlePanePlanModeChange: (enabled: boolean) => void;
  handlePanePermissionModeChange: (nextMode: string) => void;
  handlePaneClear: () => Promise<void>;
  handlePaneSend: (text: string, images?: ImageAttachment[], displayText?: string) => Promise<void>;
  handlePaneStop: () => Promise<void>;
}

/**
 * Props shared by ToolIslandContent across all three render sites.
 * These come from the space/terminal/mcp context and don't change per-island.
 */
export interface ToolIslandContextProps {
  spaceId: string;
  terminalTabs: TerminalTab[];
  activeTerminalTabId: string | null;
  terminalsReady: boolean;
  onSetActiveTab: (tabId: string | null) => void;
  onCreateTerminal: () => Promise<void>;
  onEnsureTerminal: () => Promise<void>;
  onCloseTerminal: (tabId: string) => Promise<void>;
  resolvedTheme: ResolvedTheme;
  onElementGrab?: (element: GrabbedElement) => void;
  onScrollToToolCall?: (messageId: string) => void;
  onPreviewFile?: (path: string, rect: DOMRect) => void;
  collapsedRepos: Set<string>;
  onToggleRepoCollapsed: (path: string) => void;
}
