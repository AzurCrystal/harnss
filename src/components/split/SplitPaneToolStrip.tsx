import { memo, useCallback } from "react";
import {
  Bot,
  FileText,
  FolderTree,
  GitBranch,
  Globe,
  ListTodo,
  Plug,
  Terminal,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ToolId } from "@/types/tools";

interface SplitPaneToolStripProps {
  sourceSessionId: string;
  availableContextual?: Set<ToolId>;
  openPanelTools: Set<ToolId>;
  activeContextualTool: ToolId | null;
  onTogglePanelTool: (toolId: ToolId) => void;
  onToggleContextualTool: (toolId: Extract<ToolId, "tasks" | "agents">) => void;
  onDragStart: (event: React.DragEvent<HTMLButtonElement>, toolId: ToolId) => void;
  onDragEnd: () => void;
}

const PANEL_TOOLS: Array<{ id: ToolId; label: string; icon: typeof Terminal }> = [
  { id: "terminal", label: "终端", icon: Terminal },
  { id: "browser", label: "浏览器", icon: Globe },
  { id: "git", label: "源代码管理", icon: GitBranch },
  { id: "files", label: "打开的文件", icon: FileText },
  { id: "project-files", label: "项目文件", icon: FolderTree },
  { id: "mcp", label: "MCP 服务器", icon: Plug },
];

const CONTEXTUAL_TOOLS: Array<{ id: Extract<ToolId, "tasks" | "agents">; label: string; icon: typeof Terminal }> = [
  { id: "tasks", label: "任务", icon: ListTodo },
  { id: "agents", label: "智能体", icon: Bot },
];

export const SplitPaneToolStrip = memo(function SplitPaneToolStrip({
  availableContextual,
  openPanelTools,
  activeContextualTool,
  onTogglePanelTool,
  onToggleContextualTool,
  onDragStart,
  onDragEnd,
}: SplitPaneToolStripProps) {
  const renderButton = useCallback((
    toolId: ToolId,
    label: string,
    Icon: typeof Terminal,
    active: boolean,
    draggable: boolean,
    onClick: () => void,
  ) => (
    <Tooltip key={toolId}>
      <TooltipTrigger asChild>
        <button
          type="button"
          draggable={draggable}
          onDragStart={draggable ? (event) => onDragStart(event, toolId) : undefined}
          onDragEnd={draggable ? onDragEnd : undefined}
          onClick={onClick}
          className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
            active
              ? "bg-foreground/[0.1] text-foreground"
              : "text-foreground/35 hover:bg-foreground/[0.05] hover:text-foreground/65"
          } ${draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="left" sideOffset={8}>
        <p className="text-xs font-medium">{label}</p>
      </TooltipContent>
    </Tooltip>
  ), [onDragEnd, onDragStart]);

  return (
    <div className="flex h-full w-[34px] shrink-0 flex-col items-center border-s border-border/40 py-2">
      <div className="flex flex-1 flex-col items-center gap-1 overflow-y-auto scrollbar-none">
        {PANEL_TOOLS.map(({ id, label, icon }) =>
          renderButton(id, label, icon, openPanelTools.has(id), true, () => onTogglePanelTool(id)))}
      </div>

      {CONTEXTUAL_TOOLS.some(({ id }) => availableContextual?.has(id)) && (
        <>
          <div className="my-2 h-px w-5 bg-foreground/[0.08]" />
          <div className="flex flex-col items-center gap-1">
            {CONTEXTUAL_TOOLS.map(({ id, label, icon }) =>
              availableContextual?.has(id)
                ? renderButton(id, label, icon, activeContextualTool === id, false, () => onToggleContextualTool(id))
                : null)}
          </div>
        </>
      )}
    </div>
  );
});
