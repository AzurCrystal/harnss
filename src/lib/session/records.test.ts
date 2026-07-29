import { describe, expect, it } from "vitest";
import type { ChatSession, UIMessage } from "@/types";
import { buildPersistedSession, getOmpResumeSession, toChatSession } from "./records";

describe("session records", () => {
  it("normalizes loaded sessions to OMP while preserving resume identity and sidebar metadata", () => {
    const session = toChatSession({
      id: "session-1",
      projectId: "project-1",
      title: "Chat",
      createdAt: 100,
      lastMessageAt: 200,
      totalCost: 12,
      agentSessionId: "omp-session-1",
      folderId: "folder-1",
      pinned: true,
      branch: "feature/test",
    }, false);

    expect(session.engine).toBe("omp");
    expect(session.agentSessionId).toBe("omp-session-1");
    expect(session.folderId).toBe("folder-1");
    expect(session.pinned).toBe(true);
    expect(session.branch).toBe("feature/test");
    expect(session.isActive).toBe(false);
  });

  it("does not reuse a non-OMP session identity", () => {
    expect(getOmpResumeSession({ sourceEngine: "claude", agentSessionId: "legacy-session" })).toBeUndefined();
    expect(getOmpResumeSession({ sourceEngine: "omp", agentSessionId: "omp-session" })).toBe("omp-session");
  });

  it("persists OMP resume identity with sidebar metadata", () => {
    const session: ChatSession = {
      id: "session-1",
      projectId: "project-1",
      title: "Chat",
      createdAt: 100,
      totalCost: 12,
      isActive: true,
      engine: "omp",
      agentSessionId: "omp-session-1",
      folderId: "folder-1",
      pinned: true,
      branch: "feature/test",
    };
    const messages: UIMessage[] = [{
      id: "message-1",
      role: "user",
      content: "hi",
      timestamp: 101,
    }];

    const persisted = buildPersistedSession(session, messages, 12, null);

    expect(persisted.engine).toBe("omp");
    expect(persisted.agentSessionId).toBe("omp-session-1");
    expect(persisted.folderId).toBe("folder-1");
    expect(persisted.pinned).toBe(true);
    expect(persisted.branch).toBe("feature/test");
    expect(persisted.messages).toEqual(messages);
  });
});
