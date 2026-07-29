// ── Background agent types ──

export interface BackgroundAgentUsage {
  totalTokens: number;
  toolUses: number;
  durationMs: number;
}

export interface BackgroundAgent {
  /** Harnss session that owns this OMP subagent. */
  parentSessionId: string;
  /** Stable OMP subagent identity. */
  subagentId: string;
  /** Spawn order within the parent turn. */
  index: number;
  /** OMP session JSONL path when the runtime exposes it. */
  sessionFile?: string;
  description: string;
  prompt: string;
  launchedAt: number;
  status: "running" | "completed" | "error";
  activity: BackgroundAgentActivity[];
  result?: string;
  usage?: BackgroundAgentUsage;
  progressSummary?: string;
  currentTool?: { name: string; elapsedSeconds: number } | null;
}

export interface BackgroundAgentActivity {
  type: "tool_call" | "text" | "error";
  toolName?: string;
  summary: string;
  timestamp: number;
}
