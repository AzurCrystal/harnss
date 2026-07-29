import { useCallback, useRef, useSyncExternalStore } from "react";
import { bgAgentStore } from "@/lib/background/agent-store";
import type { BackgroundAgent } from "@/types";

const EMPTY: BackgroundAgent[] = [];

interface UseBackgroundAgentsOptions {
  sessionId: string | null;
}

/**
 * Subscribes to OMP subagents owned by the active Harnss session.
 *
 * The store receives the official subagent registry snapshot and subscribed
 * lifecycle, progress, and event frames from mounted and inactive OMP sessions.
 */
export function useBackgroundAgents({ sessionId }: UseBackgroundAgentsOptions) {
  // Keep sessionId in a ref so the subscribe/getSnapshot closures
  // always read the latest value without needing to be recreated
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  const agents = useSyncExternalStore(
    // subscribe: stable function — reads sessionId from ref
    subscribeToStore,
    // getSnapshot: stable function — reads sessionId from ref, returns cached array
    () => {
      const sid = sessionIdRef.current;
      return sid ? bgAgentStore.getAgents(sid) : EMPTY;
    },
  );

  const dismissAgent = useCallback(
    (subagentId: string) => {
      if (sessionIdRef.current) bgAgentStore.dismissAgent(sessionIdRef.current, subagentId);
    },
    [],
  );


  return { agents, dismissAgent };
}

// Module-level stable subscribe function — avoids re-subscription on every render.
// Notifies on ANY session change; the getSnapshot function filters by sessionId.
function subscribeToStore(onStoreChange: () => void): () => void {
  return bgAgentStore.subscribe(() => onStoreChange());
}
