import { Plug, PanelRight, FolderOpen, Activity } from "lucide-react";

export function McpSettings() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4">
      <div className="flex max-w-md flex-col items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border/50 bg-muted/30">
          <Plug className="h-7 w-7 text-foreground/80" />
        </div>
        <h2 className="mt-1 text-xl font-semibold text-foreground">MCP 服务器</h2>
        <p className="max-w-sm text-center text-sm text-muted-foreground">
          MCP 服务器在右侧工具栏的{" "}
          <Plug className="inline h-3.5 w-3.5 -translate-y-px text-foreground/70" />{" "}
          <span className="font-medium text-foreground">MCP 服务器</span>面板中管理。
        </p>

        <div className="mt-4 w-full space-y-3 rounded-xl border border-border/50 bg-muted/20 px-5 py-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
            为什么放在工具栏？
          </h3>
          <div className="flex gap-3">
            <FolderOpen className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/70" />
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground/90">按项目配置</span>{" "}
              &mdash; 每个项目都有独立的 MCP 服务器集合，因此它们与项目工作区放在一起。
            </p>
          </div>
          <div className="flex gap-3">
            <Activity className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/70" />
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground/90">实时状态监控</span>{" "}
              &mdash; 服务器可能在会话中途断开连接。工具栏面板显示实时连接状态，便于快速发现并解决问题。
            </p>
          </div>
          <div className="flex gap-3">
            <PanelRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/70" />
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground/90">随时可用</span>{" "}
              &mdash; 无需离开对话即可添加、移除、验证和重新连接服务器。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
