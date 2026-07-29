import type { ChatSession } from "@/types";
import type { SessionPaneState } from "@/hooks/session/useSessionPane";
import type { SessionPaneBootstrap } from "@/hooks/session/types";
import { useExtraPaneLoader } from "@/hooks/session/useExtraPaneLoader";
import { useSessionPane } from "@/hooks/session/useSessionPane";

interface SplitPaneHostRenderData {
  session: ChatSession | null;
  paneState: SessionPaneState;
}

interface SplitPaneHostProps {
  sessionId: string;
  loadBootstrap: (sessionId: string) => Promise<SessionPaneBootstrap | null>;
  children: (data: SplitPaneHostRenderData) => React.ReactNode;
}

export function SplitPaneHost({
  sessionId,
  loadBootstrap,
  children,
}: SplitPaneHostProps) {
  const loader = useExtraPaneLoader({
    sessionId,
    loadBootstrap,
  });

  const readySession = loader.readyId ? loader.session : null;
  const paneState = useSessionPane({
    activeSessionId: loader.readyId,
    cwd: loader.cwd,
    initialMessages: loader.initialMessages,
    initialMeta: loader.initialMeta,
    initialPermission: loader.initialPermission,
    initialSupportedModels: loader.initialSupportedModels,
    initialOmpModels: loader.initialOmpModels,
    initialThinkingLevels: loader.initialThinkingLevels,
    initialThinkingLevel: loader.initialThinkingLevel,
    initialSlashCommands: loader.initialSlashCommands,
  });

  return <>{children({ session: readySession, paneState })}</>;
}
