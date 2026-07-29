/**
 * Pure session persistence helpers shared between Electron and CLI.
 */

export interface SessionMeta {
  id: string;
  projectId: string;
  title: string;
  createdAt: number;
  /** Timestamp of the most recent user message — used for sidebar sort order */
  lastMessageAt: number;
  model?: string;
  effort?: string;
  permissionMode?: string;
  planMode?: boolean;
  totalCost?: number;
  engine?: "omp";
  /** Original persisted backend before the runtime is normalized to OMP. */
  sourceEngine?: string;
  /** OMP session identity used to resume the agent session. */
  agentSessionId?: string;
  /** Which folder this chat belongs to (undefined = root level). */
  folderId?: string;
  /** Whether this chat is pinned to the top of the sidebar. */
  pinned?: boolean;
  /** Git branch at session creation time. */
  branch?: string;
}

/**
 * Walk messages backward to find the timestamp of the last user message.
 */
export function getLastUserMessageTimestamp(
  messages?: Array<{ role?: string; timestamp?: number }>,
): number | undefined {
  if (!Array.isArray(messages) || messages.length === 0) return undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "user" && typeof msg.timestamp === "number") return msg.timestamp;
  }
  return undefined;
}

/**
 * Extract a SessionMeta from a raw session data object.
 */
export function extractSessionMeta(data: Record<string, unknown>, lastMessageAt: number): SessionMeta {
  return {
    id: data.id as string,
    projectId: data.projectId as string,
    title: (data.title as string) || "未命名对话",
    createdAt: (data.createdAt as number) || 0,
    lastMessageAt,
    model: data.model as string | undefined,
    effort: data.effort as string | undefined,
    permissionMode: data.permissionMode as string | undefined,
    planMode: data.planMode as boolean | undefined,
    totalCost: (data.totalCost as number) || 0,
    engine: "omp",
    sourceEngine: typeof data.sourceEngine === "string"
      ? data.sourceEngine
      : typeof data.engine === "string" ? data.engine : undefined,
    agentSessionId: data.agentSessionId as string | undefined,
    folderId: data.folderId as string | undefined,
    pinned: data.pinned as boolean | undefined,
    branch: data.branch as string | undefined,
  };
}
