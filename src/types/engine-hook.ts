import type { SessionInfo } from "./session";
import type { ContextUsage } from "./mcp";

/** Metadata snapshot for restoring a session from the background store. */
export interface BackgroundSessionSnapshot {
  isProcessing: boolean;
  isConnected: boolean;
  sessionInfo: SessionInfo | null;
  totalCost: number;
  contextUsage: ContextUsage | null;
  isCompacting?: boolean;
}

