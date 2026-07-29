import { ipcMain } from "electron";
import { addMcpServer, listMcpServers, removeMcpServer } from "../lib/mcp-store";
import { captureEvent } from "../lib/posthog";
import { reportError } from "../lib/error-utils";
import type { McpServerConfig } from "../lib/mcp-store";

export function register(): void {
  ipcMain.handle("mcp:list", (_event, cwd: string) => {
    return listMcpServers(cwd);
  });

  ipcMain.handle("mcp:add", (_event, cwd: string, server: McpServerConfig) => {
    try {
      addMcpServer(cwd, server);
      void captureEvent("mcp_server_added", { name: server.name, transport: server.transport });
      return { ok: true };
    } catch (err) {
      return { error: reportError("MCP_ADD_ERR", err) };
    }
  });

  ipcMain.handle("mcp:remove", (_event, cwd: string, name: string) => {
    try {
      removeMcpServer(cwd, name);
      return { ok: true };
    } catch (err) {
      return { error: reportError("MCP_REMOVE_ERR", err) };
    }
  });
}
