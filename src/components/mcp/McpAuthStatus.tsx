import { memo } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { McpServerConfig } from "@/types";



// ── Public composite component ──

export interface McpAuthStatusProps {
  server: McpServerConfig;
}

/** Renders stored MCP authentication state without runtime session controls. */
export const McpAuthStatus = memo(function McpAuthStatus({
  server,
}: McpAuthStatusProps) {
  if (server.transport === "stdio") return null;

  return (
    <div className="flex items-center gap-1 mt-1">
      <Button
        variant="outline"
        size="sm"
        className="h-5 text-[10px] px-2 gap-1"
        disabled
      >
        <Lock className="h-2.5 w-2.5" />
        OAuth 认证
      </Button>
      <span className="text-[10px] text-muted-foreground/60">OMP RPC 不支持 MCP OAuth 管理</span>
    </div>
  );
});
