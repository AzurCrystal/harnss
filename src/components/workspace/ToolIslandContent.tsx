/**
 * Unified tool island content renderer.
 *
 * Maps a `toolId` to the correct panel component (ToolsPanel, BrowserPanel, etc.)
 * with the provided context. Replaces three copies of the same switch/record:
 * - `renderMainWorkspaceToolContent` (main single-chat)
 * - inline `toolNode` in `renderSplitTopRowItem` (split-view top row)
 * - inline `toolNode` in `renderSplitBottomToolIsland` (split-view bottom dock)
 */

import type { ReactNode } from "react";
import { ToolsPanel } from "@/components/ToolsPanel";
import { BrowserPanel } from "@/components/BrowserPanel";
import { GitPanel } from "@/components/git/GitPanel";
import { FilesPanel } from "@/components/FilesPanel";
import { ProjectFilesPanel } from "@/components/ProjectFilesPanel";
import { McpPanel } from "@/components/McpPanel";
import type { PanelToolId, UIMessage, GrabbedElement } from "@/types";
import type { TerminalTab } from "@/lib/terminal-tabs";
import type { ResolvedTheme } from "@/hooks/useTheme";

// ── Props ──

export interface ToolIslandContentProps {
  toolId: PanelToolId;
  persistKey: string;
  headerControls: ReactNode;

  // Session / project context
  projectPath: string | undefined;
  projectRoot: string | undefined;
  sessionId: string | null;
  messages: UIMessage[];
  isActiveSessionPane: boolean;
  isSessionProcessing: boolean;
  isSessionCompacting: boolean;

  // Space / terminal context
  spaceId: string;
  terminalTabs: TerminalTab[];
  activeTerminalTabId: string | null;
  terminalsReady: boolean;
  onSetActiveTab: (tabId: string | null) => void;
  onCreateTerminal: () => Promise<void>;
  onEnsureTerminal: () => Promise<void>;
  onCloseTerminal: (tabId: string) => Promise<void>;
  resolvedTheme: ResolvedTheme;

  // Panel-specific callbacks
  onElementGrab?: (element: GrabbedElement) => void;
  onScrollToToolCall?: (messageId: string) => void;
  onPreviewFile?: (path: string, rect: DOMRect) => void;
  collapsedRepos: Set<string>;
  onToggleRepoCollapsed: (path: string) => void;
}

export function ToolIslandContent({
  toolId,
  persistKey,
  headerControls,
  projectPath,
  projectRoot,
  sessionId,
  messages,
  isActiveSessionPane,
  isSessionProcessing,
  isSessionCompacting,
  spaceId,
  terminalTabs,
  activeTerminalTabId,
  terminalsReady,
  onSetActiveTab,
  onCreateTerminal,
  onEnsureTerminal,
  onCloseTerminal,
  resolvedTheme,
  onElementGrab,
  onScrollToToolCall,
  onPreviewFile,
  collapsedRepos,
  onToggleRepoCollapsed,
}: ToolIslandContentProps): ReactNode {
  switch (toolId) {
    case "terminal":
      return (
        <ToolsPanel
          spaceId={spaceId}
          tabs={terminalTabs}
          activeTabId={activeTerminalTabId}
          terminalsReady={terminalsReady}
          onSetActiveTab={onSetActiveTab}
          onCreateTerminal={onCreateTerminal}
          onEnsureTerminal={onEnsureTerminal}
          onCloseTerminal={onCloseTerminal}
          resolvedTheme={resolvedTheme}
          headerControls={headerControls}
        />
      );
    case "browser":
      return (
        <BrowserPanel
          persistKey={persistKey}
          onElementGrab={isActiveSessionPane ? onElementGrab : undefined}
          headerControls={headerControls}
        />
      );
    case "git":
      return (
        <GitPanel
          cwd={projectRoot}
          collapsedRepos={collapsedRepos}
          onToggleRepoCollapsed={onToggleRepoCollapsed}
          headerControls={headerControls}
        />
      );
    case "files":
      return (
        <FilesPanel
          sessionId={sessionId}
          messages={messages}
          cwd={projectPath}
          onScrollToToolCall={onScrollToToolCall}
          enabled={true}
          headerControls={headerControls}
        />
      );
    case "project-files":
      return (
        <ProjectFilesPanel
          cwd={projectPath}
          enabled={true}
          onPreviewFile={onPreviewFile}
          headerControls={headerControls}
        />
      );
    case "mcp":
      return (
        <McpPanel
          projectPath={projectPath}
          sessionId={sessionId}
          isSessionProcessing={isSessionProcessing}
          isSessionCompacting={isSessionCompacting}
          headerControls={headerControls}
        />
      );
  }
}
