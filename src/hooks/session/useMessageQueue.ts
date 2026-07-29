import { useCallback, useEffect, useRef, useState } from "react";
import type { ImageAttachment, UIMessage } from "../../types";
import { imageAttachmentsToOmpImages } from "../../lib/engine/omp-adapter";
import { suppressNextSessionCompletion } from "../../lib/notification-utils";
import { createSystemMessage } from "../../lib/message-factory";
import { DRAFT_ID } from "./types";
import type { SharedSessionRefs, SharedSessionSetters, EngineHooks, QueuedMessage } from "./types";

interface UseMessageQueueParams {
  refs: SharedSessionRefs;
  setters: SharedSessionSetters;
  engines: EngineHooks;
  activeSessionId: string | null;
}

type BoundaryWaitState =
  | { kind: "after_stream" }
  | { kind: "after_tool"; pendingToolMessageIdsAtClick: string[] }
  | { kind: "asap" };

export function useMessageQueue({ refs, setters, engines, activeSessionId }: UseMessageQueueParams) {
  const { omp } = engines;
  const { setQueuedCount } = setters;
  const {
    activeSessionIdRef,
    liveSessionIdsRef,
    backgroundStoreRef,
    messageQueueRef,
    messagesRef,
  } = refs;
  const drainingSessionIdsRef = useRef<Set<string>>(new Set());
  const boundaryWaitRef = useRef<Map<string, BoundaryWaitState>>(new Map());
  const sessionSwitchGuardRef = useRef(false);
  const [switchDrainRetryTick, setSwitchDrainRetryTick] = useState(0);
  const [sendNextId, setSendNextId] = useState<string | null>(null);

  const getPendingToolMessageIds = useCallback((messages: UIMessage[]) => {
    const ids: string[] = [];
    for (const message of messages) {
      if (message.role === "tool_call" && !message.toolResult && !message.toolError) ids.push(message.id);
    }
    return ids;
  }, []);


  const getQueueForSession = useCallback((sessionId: string): QueuedMessage[] => {
    const existing = messageQueueRef.current.get(sessionId);
    if (existing) return existing;
    const queue: QueuedMessage[] = [];
    messageQueueRef.current.set(sessionId, queue);
    return queue;
  }, [messageQueueRef]);

  const reorderSentQueuedMessage = useCallback((messages: UIMessage[], messageId: string) => {
    const index = messages.findIndex((message) => message.id === messageId);
    if (index < 0) return messages;
    const sentMessage = { ...messages[index], isQueued: false };
    const rest = messages.filter((message) => message.id !== messageId);
    return [
      ...rest.filter((message) => !message.isQueued),
      sentMessage,
      ...rest.filter((message) => message.isQueued),
    ];
  }, []);

  const updateSessionMessages = useCallback((
    sessionId: string,
    updater: (messages: UIMessage[]) => UIMessage[],
  ) => {
    if (sessionId === activeSessionIdRef.current) {
      omp.setMessages(updater);
      return;
    }
    backgroundStoreRef.current.updateMessages(sessionId, updater);
  }, [activeSessionIdRef, backgroundStoreRef, omp.setMessages]);

  const setSessionProcessing = useCallback((sessionId: string, isProcessing: boolean) => {
    if (sessionId === activeSessionIdRef.current) {
      omp.setIsProcessing(isProcessing);
      return;
    }
    backgroundStoreRef.current.setProcessing(sessionId, isProcessing);
  }, [activeSessionIdRef, backgroundStoreRef, omp.setIsProcessing]);

  const clearQueueForSession = useCallback((sessionId: string) => {
    if (!sessionId || sessionId === DRAFT_ID) {
      if (sessionId === activeSessionIdRef.current) setQueuedCount(0);
      return;
    }

    const queue = messageQueueRef.current.get(sessionId) ?? [];
    const queuedIds = new Set(queue.map((entry) => entry.messageId));
    messageQueueRef.current.delete(sessionId);
    boundaryWaitRef.current.delete(sessionId);
    drainingSessionIdsRef.current.delete(sessionId);
    setSendNextId((current) => (current && queuedIds.has(current) ? null : current));
    if (sessionId === activeSessionIdRef.current) setQueuedCount(0);
    if (queuedIds.size === 0) return;

    updateSessionMessages(sessionId, (messages) => messages.filter((message) => !queuedIds.has(message.id)));
  }, [activeSessionIdRef, messageQueueRef, setQueuedCount, updateSessionMessages]);

  const enqueueMessage = useCallback((text: string, images?: ImageAttachment[], displayText?: string) => {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId || sessionId === DRAFT_ID) return;

    const messageId = `user-queued-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const queue = getQueueForSession(sessionId);
    queue.push({ text, images, displayText, messageId });
    setQueuedCount(queue.length);
    omp.setMessages((messages) => [
      ...messages,
      {
        id: messageId,
        role: "user",
        content: text,
        timestamp: Date.now(),
        isQueued: true,
        ...(images?.length ? { images } : {}),
        ...(displayText ? { displayContent: displayText } : {}),
      },
    ]);
  }, [activeSessionIdRef, getQueueForSession, omp.setMessages, setQueuedCount]);

  const reorderQueuedMessagesInUI = useCallback((orderedMessageIds: string[]) => {
    const rank = new Map(orderedMessageIds.map((messageId, index) => [messageId, index]));
    omp.setMessages((messages) => {
      const nonQueued = messages.filter((message) => !message.isQueued);
      const queued = messages.filter((message) => message.isQueued);
      if (queued.length <= 1) return messages;
      queued.sort((left, right) => {
        const leftRank = rank.get(left.id) ?? Number.MAX_SAFE_INTEGER;
        const rightRank = rank.get(right.id) ?? Number.MAX_SAFE_INTEGER;
        return leftRank === rightRank ? left.timestamp - right.timestamp : leftRank - rightRank;
      });
      return [...nonQueued, ...queued];
    });
  }, [omp.setMessages]);

  const clearQueue = useCallback(() => {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId || sessionId === DRAFT_ID) {
      setQueuedCount(0);
      return;
    }
    clearQueueForSession(sessionId);
  }, [activeSessionIdRef, clearQueueForSession, setQueuedCount]);

  const drainQueuedMessageForSession = useCallback(async (sessionId: string) => {
    if (!sessionId || sessionId === DRAFT_ID) return false;
    if (drainingSessionIdsRef.current.has(sessionId)) return false;
    if (!liveSessionIdsRef.current.has(sessionId)) return false;

    const isActiveSession = sessionId === activeSessionIdRef.current;
    const isProcessing = isActiveSession
      ? omp.isProcessing
      : (backgroundStoreRef.current.get(sessionId)?.isProcessing ?? false);
    if (isProcessing) return false;

    const queue = messageQueueRef.current.get(sessionId);
    if (!queue?.length) return false;

    const next = queue.shift()!;
    if (queue.length === 0) {
      messageQueueRef.current.delete(sessionId);
      boundaryWaitRef.current.delete(sessionId);
    }
    setSendNextId((current) => (current === next.messageId ? null : current));
    if (isActiveSession) setQueuedCount(queue.length);
    drainingSessionIdsRef.current.add(sessionId);
    updateSessionMessages(sessionId, (messages) => reorderSentQueuedMessage(messages, next.messageId));

    const fail = (message: string) => {
      updateSessionMessages(sessionId, (messages) => [
        ...messages,
        createSystemMessage(message, true),
      ]);
      clearQueueForSession(sessionId);
      setSessionProcessing(sessionId, false);
    };

    try {
      setSessionProcessing(sessionId, true);
      if (isActiveSession) {
        const sent = await omp.sendRaw(next.text, next.images);
        if (!sent) {
          clearQueueForSession(sessionId);
          setSessionProcessing(sessionId, false);
          return false;
        }
      } else {
        const images = imageAttachmentsToOmpImages(next.images);
        const result = await window.claude.omp.command(sessionId, {
          type: "prompt",
          message: next.text,
          ...(images?.length ? { images } : {}),
        });
        if (result.error) {
          fail(result.error);
          return false;
        }
      }
      return true;
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      drainingSessionIdsRef.current.delete(sessionId);
    }
  }, [
    activeSessionIdRef,
    backgroundStoreRef,
    clearQueueForSession,
    liveSessionIdsRef,
    messageQueueRef,
    omp.isProcessing,
    omp.sendRaw,
    reorderSentQueuedMessage,
    setQueuedCount,
    setSessionProcessing,
    updateSessionMessages,
  ]);

  const drainNextQueuedMessage = useCallback(async () => {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId || sessionId === DRAFT_ID) return false;
    return drainQueuedMessageForSession(sessionId);
  }, [activeSessionIdRef, drainQueuedMessageForSession]);

  const continueQueuedBackgroundSession = useCallback((sessionId: string) => {
    if (!sessionId || sessionId === DRAFT_ID || sessionId === activeSessionIdRef.current) return false;
    if (drainingSessionIdsRef.current.has(sessionId)) return false;
    if (!liveSessionIdsRef.current.has(sessionId)) return false;
    if (backgroundStoreRef.current.get(sessionId)?.isProcessing) return false;
    if (!messageQueueRef.current.get(sessionId)?.length) return false;
    void drainQueuedMessageForSession(sessionId);
    return true;
  }, [activeSessionIdRef, backgroundStoreRef, drainQueuedMessageForSession, liveSessionIdsRef, messageQueueRef]);

  const unqueueMessage = useCallback((messageId: string) => {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId || sessionId === DRAFT_ID) return;

    const queue = messageQueueRef.current.get(sessionId);
    if (!queue) return;
    const index = queue.findIndex((entry) => entry.messageId === messageId);
    if (index < 0) return;

    queue.splice(index, 1);
    if (queue.length === 0) {
      messageQueueRef.current.delete(sessionId);
      boundaryWaitRef.current.delete(sessionId);
    } else if (sendNextId === messageId) {
      boundaryWaitRef.current.delete(sessionId);
    }
    setSendNextId((current) => (current === messageId ? null : current));
    setQueuedCount(queue.length);
    omp.setMessages((messages) => messages.filter((message) => message.id !== messageId));
  }, [activeSessionIdRef, messageQueueRef, omp.setMessages, sendNextId, setQueuedCount]);

  const sendQueuedMessageNext = useCallback(async (messageId: string) => {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId || sessionId === DRAFT_ID) return;

    const queue = messageQueueRef.current.get(sessionId) ?? [];
    const index = queue.findIndex((entry) => entry.messageId === messageId);
    if (index < 0) return;
    if (index > 0) queue.unshift(queue.splice(index, 1)[0]);
    setSendNextId(messageId);
    setQueuedCount(queue.length);
    reorderQueuedMessagesInUI(queue.map((entry) => entry.messageId));

    if (omp.isProcessing) {
      const messages = messagesRef.current;
      const pendingToolMessageIds = getPendingToolMessageIds(messages);
      const isStreaming = messages.some((message) => message.role === "assistant" && message.isStreaming);
      boundaryWaitRef.current.set(sessionId, isStreaming
        ? { kind: "after_stream" }
        : pendingToolMessageIds.length > 0
          ? { kind: "after_tool", pendingToolMessageIdsAtClick: pendingToolMessageIds }
          : { kind: "asap" });
      return;
    }

    if (liveSessionIdsRef.current.has(sessionId)) await drainNextQueuedMessage();
  }, [
    activeSessionIdRef,
    drainNextQueuedMessage,
    getPendingToolMessageIds,
    liveSessionIdsRef,
    messageQueueRef,
    messagesRef,
    omp.isProcessing,
    reorderQueuedMessagesInUI,
    setQueuedCount,
  ]);

  useEffect(() => {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId || sessionId === DRAFT_ID) return;
    const waitState = boundaryWaitRef.current.get(sessionId);
    if (!waitState || !omp.isProcessing || !liveSessionIdsRef.current.has(sessionId)) {
      if (waitState) boundaryWaitRef.current.delete(sessionId);
      return;
    }

    const messages = messagesRef.current;
    if (messages.some((message) => message.role === "assistant" && message.isStreaming)) return;
    const shouldInterrupt = waitState.kind === "after_stream"
      || waitState.kind === "asap"
      || waitState.pendingToolMessageIdsAtClick.some((messageId) => {
        const message = messages.find((entry) => entry.id === messageId);
        return !message || message.role !== "tool_call" || !!message.toolResult || !!message.toolError;
      });
    if (!shouldInterrupt) return;

    boundaryWaitRef.current.delete(sessionId);
    suppressNextSessionCompletion(sessionId);
    void omp.interrupt();
  }, [
    activeSessionId,
    activeSessionIdRef,
    liveSessionIdsRef,
    messagesRef,
    omp.interrupt,
    omp.isProcessing,
  ]);

  useEffect(() => {
    if (!activeSessionId || activeSessionId === DRAFT_ID) {
      setQueuedCount(0);
      setSendNextId(null);
      boundaryWaitRef.current.clear();
      return;
    }
    setQueuedCount(messageQueueRef.current.get(activeSessionId)?.length ?? 0);
  }, [activeSessionId, messageQueueRef, setQueuedCount]);

  useEffect(() => {
    sessionSwitchGuardRef.current = true;
    setSwitchDrainRetryTick((tick) => tick + 1);
  }, [activeSessionId]);

  useEffect(() => {
    if (sessionSwitchGuardRef.current) {
      sessionSwitchGuardRef.current = false;
      return;
    }
    if (omp.isProcessing) return;
    void drainNextQueuedMessage();
  }, [activeSessionId, drainNextQueuedMessage, omp.isProcessing, switchDrainRetryTick]);

  return {
    enqueueMessage,
    clearQueue,
    unqueueMessage,
    sendQueuedMessageNext,
    continueQueuedBackgroundSession,
    sendNextId,
  };
}
