import { useState, useCallback, useEffect } from "react";
import type { McpServerConfig } from "@/types";

export function useMcpServers(cwd: string | undefined) {
  const [servers, setServers] = useState<McpServerConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cwd) {
      setServers([]);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    window.claude.mcp
      .list(cwd)
      .then((canonicalServers) => {
        if (!cancelled) setServers(canonicalServers);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "无法读取 MCP 服务器配置");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cwd]);

  const refetchServers = useCallback(async () => {
    if (!cwd) {
      const cause = new Error("没有可用的项目路径");
      setError(cause.message);
      throw cause;
    }

    setLoading(true);
    setError(null);
    try {
      const canonicalServers = await window.claude.mcp.list(cwd);
      setServers(canonicalServers);
      return canonicalServers;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "无法读取 MCP 服务器配置";
      setError(message);
      throw cause instanceof Error ? cause : new Error(message);
    } finally {
      setLoading(false);
    }
  }, [cwd]);

  const addServer = useCallback(
    async (server: McpServerConfig) => {
      if (!cwd) {
        const cause = new Error("没有可用的项目路径");
        setError(cause.message);
        throw cause;
      }

      try {
        const result = await window.claude.mcp.add(cwd, server);
        if (result.error || !result.ok) {
          throw new Error(result.error ?? "无法保存 MCP 服务器配置");
        }
        await refetchServers();
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "无法保存 MCP 服务器配置";
        setError(message);
        throw cause instanceof Error ? cause : new Error(message);
      }
    },
    [cwd, refetchServers],
  );

  const removeServer = useCallback(
    async (name: string) => {
      if (!cwd) {
        const cause = new Error("没有可用的项目路径");
        setError(cause.message);
        throw cause;
      }

      try {
        const result = await window.claude.mcp.remove(cwd, name);
        if (result.error || !result.ok) {
          throw new Error(result.error ?? "无法删除 MCP 服务器配置");
        }
        await refetchServers();
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "无法删除 MCP 服务器配置";
        setError(message);
        throw cause instanceof Error ? cause : new Error(message);
      }
    },
    [cwd, refetchServers],
  );

  return { servers, loading, error, addServer, removeServer };
}
