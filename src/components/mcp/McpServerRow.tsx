import { memo } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { McpServerConfig } from "@/types";
import { TRANSPORT_ICON, TRANSPORT_COLOR } from "./mcp-utils";
import { McpAuthStatus } from "./McpAuthStatus";

export interface McpServerRowProps {
  server: McpServerConfig;
  isRemoving: boolean;
  mutationsDisabled: boolean;
  onRemove: (serverName: string) => void;
}

/** A single MCP server row with transport icon, status indicator, auth controls, and remove button. */
export const McpServerRow = memo(function McpServerRow({
  server,
  isRemoving,
  mutationsDisabled,
  onRemove,
}: McpServerRowProps) {
  const Icon = TRANSPORT_ICON[server.transport];
  const color = TRANSPORT_COLOR[server.transport];

  return (
    <div className="group flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors">
      <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${color}`} />
      <div className="min-w-0 flex-1">
        {/* Name + transport badge */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium truncate">{server.name}</span>
          <Badge variant="outline" className="h-3.5 px-1 text-[9px] shrink-0">
            {server.transport}
          </Badge>
        </div>

        {/* Connection detail (command or URL) */}
        <p className="text-[10px] text-muted-foreground font-mono truncate mt-0.5">
          {server.transport === "stdio" ? server.command : server.url}
        </p>

        {/* Environment variable count */}
        {server.env && Object.keys(server.env).length > 0 && (
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
            {Object.keys(server.env).length} 个环境变量
          </p>
        )}

        <McpAuthStatus server={server} />

      </div>

      {/* Remove button */}
      <Button
        variant="ghost"
        size="icon"
        className="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive"
        onClick={() => onRemove(server.name)}
        disabled={isRemoving || mutationsDisabled}
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
});
