import type { McpTransport, McpServerStatusState } from "@/types";
import {
  Terminal,
  Globe,
  Network,
  CircleCheck,
  CircleDashed,
  Lock,
  CircleX,
  CircleAlert,
} from "lucide-react";

// ── Transport display config ──

export const TRANSPORT_ICON: Record<McpTransport, typeof Terminal> = {
  stdio: Terminal,
  sse: Globe,
  http: Network,
};

export const TRANSPORT_COLOR: Record<McpTransport, string> = {
  stdio: "text-amber-500",
  sse: "text-emerald-500",
  http: "text-blue-500",
};

// ── Status display config ──

export const STATUS_CONFIG: Record<
  McpServerStatusState,
  { icon: typeof CircleCheck; color: string; label: string }
> = {
  connected: { icon: CircleCheck, color: "text-emerald-500", label: "已连接" },
  pending: { icon: CircleDashed, color: "text-muted-foreground animate-spin", label: "连接中…" },
  "needs-auth": { icon: Lock, color: "text-amber-500", label: "需要认证" },
  failed: { icon: CircleX, color: "text-destructive", label: "连接失败" },
  disabled: { icon: CircleAlert, color: "text-muted-foreground/50", label: "已禁用" },
};

// ── Auth status ──

export interface AuthStatusInfo {
  hasToken: boolean;
  expiresAt?: number;
}

// ── Pure helpers ──

/** Parse KEY=value pairs (one per line) into a record. */
export function parseKeyValuePairs(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      result[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
    }
  }
  return result;
}
