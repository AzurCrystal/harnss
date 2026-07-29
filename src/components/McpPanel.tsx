import { memo, useState, useCallback } from "react";
import { Plug, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PanelHeader } from "@/components/PanelHeader";
import { useMcpServers } from "@/hooks/useMcpServers";
import { McpServerRow } from "@/components/mcp/McpServerRow";
import { AddServerDialog } from "@/components/mcp/AddServerDialog";
import type { McpServerConfig } from "@/types";

interface McpPanelProps {
  projectPath: string | undefined;
  sessionId: string | null;
  isSessionProcessing: boolean;
  isSessionCompacting: boolean;
  headerControls?: React.ReactNode;
}


export const McpPanel = memo(function McpPanel({
  projectPath,
  sessionId,
  isSessionProcessing,
  isSessionCompacting,
  headerControls,
}: McpPanelProps) {
  const { servers, loading, error, addServer, removeServer } = useMcpServers(projectPath);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [removingName, setRemovingName] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const isSessionBusy = isSessionProcessing || isSessionCompacting;
  const mutationsDisabled = isSessionBusy || isAdding || removingName !== null;
  const displayError = mutationError ?? error;

  const restartAfterMutation = useCallback(async () => {
    if (!sessionId) return;

    try {
      const result = await window.claude.omp.restart(sessionId);
      if (result.error) throw new Error(result.error);
    } catch (cause) {
      throw new Error(
        `MCP 配置已保存并已重新读取，但未能重启当前会话：${cause instanceof Error ? cause.message : "未知错误"}`,
      );
    }
  }, [sessionId]);

  const handleRemove = useCallback(async (serverName: string) => {
    if (mutationsDisabled) return;

    setRemovingName(serverName);
    setMutationError(null);
    try {
      await removeServer(serverName);
      await restartAfterMutation();
    } catch (cause) {
      setMutationError(cause instanceof Error ? cause.message : "无法删除 MCP 服务器");
    } finally {
      setRemovingName(null);
    }
  }, [mutationsDisabled, removeServer, restartAfterMutation]);

  const handleAdd = useCallback(async (server: McpServerConfig) => {
    if (mutationsDisabled) {
      const cause = new Error("MCP 配置当前无法更改");
      setMutationError(cause.message);
      throw cause;
    }

    setIsAdding(true);
    setMutationError(null);
    try {
      await addServer(server);
      await restartAfterMutation();
      setDialogOpen(false);
    } catch (cause) {
      setMutationError(cause instanceof Error ? cause.message : "无法添加 MCP 服务器");
      throw cause;
    } finally {
      setIsAdding(false);
    }
  }, [addServer, mutationsDisabled, restartAfterMutation]);

  if (!projectPath) {
    return (
      <div className="flex h-full flex-col">
        <PanelHeader icon={Plug} label="MCP 服务器" iconClass="text-violet-600/70 dark:text-violet-200/50">
          {headerControls}
        </PanelHeader>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-foreground/[0.03]">
            <Plug className="h-5 w-5 text-foreground/15" />
          </div>
          <p className="text-[11px] text-muted-foreground/45">打开项目以管理 MCP 服务器</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded-md bg-foreground/[0.04]">
            <Plug className="h-3 w-3 text-violet-600/70 dark:text-violet-200/50" />
          </div>
          <span className="text-[11px] font-semibold tracking-wide text-muted-foreground/80 uppercase">
            MCP 服务器
          </span>
          {servers.length > 0 && (
            <Badge variant="secondary" className="h-5 rounded-full px-2 text-[10px] font-semibold tabular-nums">
              {servers.length}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground/50 hover:text-muted-foreground"
            onClick={() => {
              setMutationError(null);
              setDialogOpen(true);
            }}
            disabled={mutationsDisabled}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
          {headerControls}
        </div>
      </div>

      {/* Header separator */}
      <div className="mx-2">
        <div className="h-px bg-gradient-to-r from-foreground/[0.04] via-foreground/[0.08] to-foreground/[0.04]" />
      </div>

      {displayError && (
        <div className="px-3 py-2" role="alert">
          <p className="text-[10px] text-destructive">{displayError}</p>
        </div>
      )}

      {/* Server list */}
      <ScrollArea className="flex-1 px-2">
        {loading ? (
          <p className="px-2 py-4 text-xs text-muted-foreground text-center">加载中…</p>
        ) : servers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center px-4 gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-foreground/[0.03]">
              <Plug className="h-5 w-5 text-foreground/15" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground/60">暂无 MCP 服务器</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground/40">
                添加服务器以扩展智能体能力
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-1 pb-2">
            {servers.map((server) => (
              <McpServerRow
                key={server.name}
                server={server}
                isRemoving={removingName === server.name}
                mutationsDisabled={mutationsDisabled}
                onRemove={handleRemove}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Add Server Dialog */}
      <AddServerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onAdd={handleAdd}
        disabled={mutationsDisabled}
        error={displayError}
      />
    </div>
  );
});
