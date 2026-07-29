/**
 * useExtraPaneLoader — loads session bootstrap data for one split view pane.
 *
 * The hook only marks a pane as ready after the bootstrap data has been loaded,
 * which prevents engine hooks from binding to a session ID before their initial
 * messages and metadata are available.
 */

import { useEffect, useRef, useState, startTransition } from "react";
import type { ChatSession, PermissionRequest, UIMessage } from "@/types";
import type { InitialMeta, SessionPaneBootstrap } from "./types";

interface ExtraPaneLoaderResult {
  readyId: string | null;
  session: ChatSession | null;
  cwd: string | undefined;
  initialMessages: UIMessage[];
  initialMeta: InitialMeta | null;
  initialPermission: PermissionRequest | null;
  initialSupportedModels: SessionPaneBootstrap["initialSupportedModels"];
  initialOmpModels: SessionPaneBootstrap["initialOmpModels"];
  initialThinkingLevels: SessionPaneBootstrap["initialThinkingLevels"];
  initialThinkingLevel: SessionPaneBootstrap["initialThinkingLevel"];
  initialSlashCommands: SessionPaneBootstrap["initialSlashCommands"];
}

interface UseExtraPaneLoaderOptions {
  sessionId: string | null;
  loadBootstrap: (sessionId: string) => Promise<SessionPaneBootstrap | null>;
}

export function useExtraPaneLoader({
  sessionId,
  loadBootstrap,
}: UseExtraPaneLoaderOptions): ExtraPaneLoaderResult {
  const [readyId, setReadyId] = useState<string | null>(null);
  const [session, setSession] = useState<ChatSession | null>(null);
  const [cwd, setCwd] = useState<string>();
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [initialMeta, setInitialMeta] = useState<InitialMeta | null>(null);
  const [initialPermission, setInitialPermission] = useState<PermissionRequest | null>(null);
  const [initialSupportedModels, setInitialSupportedModels] = useState<SessionPaneBootstrap["initialSupportedModels"]>([]);
  const [initialOmpModels, setInitialOmpModels] = useState<SessionPaneBootstrap["initialOmpModels"]>([]);
  const [initialThinkingLevels, setInitialThinkingLevels] = useState<SessionPaneBootstrap["initialThinkingLevels"]>([]);
  const [initialThinkingLevel, setInitialThinkingLevel] = useState<SessionPaneBootstrap["initialThinkingLevel"]>();
  const [initialSlashCommands, setInitialSlashCommands] = useState<SessionPaneBootstrap["initialSlashCommands"]>([]);

  const latestSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (sessionId === latestSessionIdRef.current) {
      return;
    }
    latestSessionIdRef.current = sessionId;

    if (!sessionId) {
      startTransition(() => {
        setReadyId(null);
        setSession(null);
        setCwd(undefined);
        setInitialMessages([]);
        setInitialMeta(null);
        setInitialPermission(null);
        setInitialSupportedModels([]);
        setInitialOmpModels([]);
        setInitialThinkingLevels([]);
        setInitialThinkingLevel(undefined);
        setInitialSlashCommands([]);
      });
      return;
    }

    void loadBootstrap(sessionId).then((bootstrap) => {
      if (!bootstrap || latestSessionIdRef.current !== sessionId) {
        return;
      }

      startTransition(() => {
        setReadyId(sessionId);
        setSession(bootstrap.session);
        setCwd(bootstrap.cwd);
        setInitialMessages(bootstrap.initialMessages);
        setInitialMeta(bootstrap.initialMeta);
        setInitialPermission(bootstrap.initialPermission);
        setInitialSupportedModels(bootstrap.initialSupportedModels ?? []);
        setInitialOmpModels(bootstrap.initialOmpModels ?? []);
        setInitialThinkingLevels(bootstrap.initialThinkingLevels ?? []);
        setInitialThinkingLevel(bootstrap.initialThinkingLevel);
        setInitialSlashCommands(bootstrap.initialSlashCommands ?? []);
      });
    }).catch(() => {
      if (latestSessionIdRef.current !== sessionId) {
        return;
      }

      startTransition(() => {
        setReadyId(null);
        setSession(null);
        setCwd(undefined);
        setInitialMessages([]);
        setInitialMeta(null);
        setInitialPermission(null);
        setInitialSupportedModels([]);
        setInitialOmpModels([]);
        setInitialThinkingLevels([]);
        setInitialThinkingLevel(undefined);
        setInitialSlashCommands([]);
      });
    });
  }, [loadBootstrap, sessionId]);

  return {
    readyId,
    session,
    cwd,
    initialMessages,
    initialMeta,
    initialPermission,
    initialSupportedModels,
    initialOmpModels,
    initialThinkingLevels,
    initialThinkingLevel,
    initialSlashCommands,
  };
}
