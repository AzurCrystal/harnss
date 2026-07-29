import type { BackgroundAgent, BackgroundAgentActivity } from "@/types";
import type {
  OmpRpcFrame,
  OmpSessionFrame,
  OmpSubagentEventPayload,
  OmpSubagentLifecyclePayload,
  OmpSubagentProgress,
  OmpSubagentProgressPayload,
  OmpSubagentRecentTool,
  OmpSubagentSnapshot,
  OmpSubagentSource,
  OmpSubagentStatus,
} from "@shared/types/omp";

type Listener = (sessionId: string) => void;

/**
 * OMP-only subagent registry for the existing Agents panel.
 *
 * The registry snapshot reports live subagents only; terminal lifecycle frames
 * are retained here until the user dismisses their card.
 */
class BackgroundAgentStore {
  private agents = new Map<string, Map<string, BackgroundAgent>>();
  private listeners = new Set<Listener>();
  private snapshotCache = new Map<string, BackgroundAgent[]>();

  subscribe(callback: Listener): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  getAgents(sessionId: string): BackgroundAgent[] {
    const cached = this.snapshotCache.get(sessionId);
    if (cached) return cached;
    const agents = this.agents.get(sessionId);
    const snapshot = agents
      ? Array.from(agents.values()).sort((left, right) => left.index - right.index || left.subagentId.localeCompare(right.subagentId))
      : [];
    this.snapshotCache.set(sessionId, snapshot);
    return snapshot;
  }

  clearSession(sessionId: string): void {
    if (!this.agents.delete(sessionId)) return;
    this.notify(sessionId);
  }

  dismissAgent(sessionId: string, subagentId: string): void {
    const agents = this.agents.get(sessionId);
    if (!agents?.delete(subagentId)) return;
    this.notify(sessionId);
  }

  /** Consume only official OMP subagent snapshots and frames. */
  handleOmpFrame(frame: OmpSessionFrame): void {
    switch (frame.type) {
      case "response": {
        if (frame.success !== true || frame.command !== "get_subagents") return;
        const snapshots = readSubagentSnapshots(frame.data);
        if (snapshots && this.applySnapshots(frame._sessionId, snapshots)) this.notify(frame._sessionId);
        return;
      }

      case "subagent_lifecycle": {
        const payload = readLifecyclePayload(frame.payload);
        if (payload && this.applyLifecycle(frame._sessionId, payload)) this.notify(frame._sessionId);
        return;
      }

      case "subagent_progress": {
        const payload = readProgressPayload(frame.payload);
        if (payload && this.applyProgress(frame._sessionId, payload)) this.notify(frame._sessionId);
        return;
      }

      case "subagent_event": {
        const payload = readEventPayload(frame.payload);
        if (payload && this.applyEvent(frame._sessionId, payload)) this.notify(frame._sessionId);
        return;
      }
    }
  }

  private applySnapshots(sessionId: string, snapshots: OmpSubagentSnapshot[]): boolean {
    let changed = false;
    for (const snapshot of snapshots) {
      changed = this.upsertSnapshot(sessionId, snapshot) || changed;
    }
    return changed;
  }

  private applyLifecycle(sessionId: string, payload: OmpSubagentLifecyclePayload): boolean {
    const agents = this.getOrCreate(sessionId);
    const wasTerminal = isTerminalStatus(agents.get(payload.id)?.status);
    const snapshot: OmpSubagentSnapshot = {
      id: payload.id,
      index: payload.index,
      agent: payload.agent,
      agentSource: payload.agentSource,
      ...(payload.description ? { description: payload.description } : {}),
      status: payload.status === "started" ? "running" : payload.status,
      ...(payload.sessionFile ? { sessionFile: payload.sessionFile } : {}),
      lastUpdate: Date.now(),
      ...(payload.parentToolCallId ? { parentToolCallId: payload.parentToolCallId } : {}),
    };
    const changed = this.upsertSnapshot(sessionId, snapshot);
    const agent = this.agents.get(sessionId)?.get(payload.id);
    if (!agent || payload.status === "started") return changed;

    agent.currentTool = null;
    if (!wasTerminal && payload.status !== "completed") {
      appendActivity(agent, {
        type: "error",
        summary: payload.status === "aborted" ? "子智能体已中止" : "子智能体失败",
        timestamp: snapshot.lastUpdate,
      });
    }
    return true;
  }

  private applyProgress(sessionId: string, payload: OmpSubagentProgressPayload): boolean {
    const progress = payload.progress;
    return this.upsertSnapshot(sessionId, {
      id: progress.id,
      index: payload.index,
      agent: payload.agent,
      agentSource: payload.agentSource,
      ...(progress.description ? { description: progress.description } : {}),
      status: progress.status,
      task: payload.task,
      ...(payload.assignment ? { assignment: payload.assignment } : {}),
      ...(payload.sessionFile ? { sessionFile: payload.sessionFile } : {}),
      lastUpdate: Date.now(),
      progress,
      ...(payload.parentToolCallId ? { parentToolCallId: payload.parentToolCallId } : {}),
    });
  }

  private applyEvent(sessionId: string, payload: OmpSubagentEventPayload): boolean {
    const agent = this.agents.get(sessionId)?.get(payload.id);
    if (!agent || isTerminalStatus(agent.status)) return false;

    const event = payload.event;
    const eventToolName = typeof event.toolName === "string" ? event.toolName : undefined;
    if (event.type === "tool_execution_start" || event.type === "tool_execution_update") {
      const toolName = eventToolName ?? agent.currentTool?.name;
      if (!toolName) return false;
      const start = event.startedAtMs;
      agent.currentTool = {
        name: toolName,
        elapsedSeconds: typeof start === "number" ? Math.max(0, (Date.now() - start) / 1000) : 0,
      };
      return true;
    }

    if (event.type !== "tool_execution_end") return false;
    const toolName = eventToolName ?? agent.currentTool?.name ?? "工具";
    const isError = event.isError === true;
    agent.currentTool = null;
    appendActivity(agent, {
      type: isError ? "error" : "tool_call",
      ...(isError ? {} : { toolName }),
      summary: textContent(event.result) || (isError ? `${toolName} 执行失败` : toolName),
      timestamp: Date.now(),
    });
    return true;
  }

  private upsertSnapshot(sessionId: string, snapshot: OmpSubagentSnapshot): boolean {
    const agents = this.getOrCreate(sessionId);
    const existing = agents.get(snapshot.id);
    const status = toPanelStatus(snapshot.status);
    if (existing && isTerminalStatus(existing.status) && status === "running") return false;

    if (!existing) {
      agents.set(snapshot.id, createAgent(sessionId, snapshot));
      return true;
    }

    if (isTerminalStatus(existing.status) && isTerminalStatus(status)) {
      if (snapshot.sessionFile && !existing.sessionFile) {
        existing.sessionFile = snapshot.sessionFile;
        return true;
      }
      return false;
    }

    existing.index = snapshot.index;
    existing.description = snapshot.description
      ?? snapshot.progress?.description
      ?? snapshot.task
      ?? snapshot.progress?.task
      ?? existing.description
      ?? snapshot.agent;
    existing.prompt = snapshot.task ?? snapshot.progress?.task ?? snapshot.assignment ?? snapshot.progress?.assignment ?? existing.prompt;
    existing.status = status;
    if (snapshot.sessionFile) existing.sessionFile = snapshot.sessionFile;
    if (snapshot.progress) applyProgress(existing, snapshot.progress, snapshot.lastUpdate);
    if (isTerminalStatus(status)) existing.currentTool = null;
    return true;
  }

  private getOrCreate(sessionId: string): Map<string, BackgroundAgent> {
    let agents = this.agents.get(sessionId);
    if (!agents) {
      agents = new Map();
      this.agents.set(sessionId, agents);
    }
    return agents;
  }

  private notify(sessionId: string): void {
    this.snapshotCache.delete(sessionId);
    for (const listener of this.listeners) listener(sessionId);
  }
}

function createAgent(sessionId: string, snapshot: OmpSubagentSnapshot): BackgroundAgent {
  const progress = snapshot.progress;
  const agent: BackgroundAgent = {
    parentSessionId: sessionId,
    subagentId: snapshot.id,
    index: snapshot.index,
    ...(snapshot.sessionFile ? { sessionFile: snapshot.sessionFile } : {}),
    description: snapshot.description
      ?? snapshot.progress?.description
      ?? snapshot.task
      ?? snapshot.progress?.task
      ?? snapshot.agent,
    prompt: snapshot.task ?? snapshot.progress?.task ?? snapshot.assignment ?? snapshot.progress?.assignment ?? "",
    launchedAt: Math.max(0, snapshot.lastUpdate - (progress?.durationMs ?? 0)),
    status: toPanelStatus(snapshot.status),
    activity: activityFromProgress(progress, snapshot.lastUpdate),
  };
  if (progress) applyProgress(agent, progress, snapshot.lastUpdate);
  if (isTerminalStatus(agent.status)) agent.currentTool = null;
  return agent;
}

function applyProgress(agent: BackgroundAgent, progress: OmpSubagentProgress, lastUpdate: number): void {
  agent.usage = {
    totalTokens: progress.tokens,
    toolUses: progress.toolCount,
    durationMs: progress.durationMs,
  };
  agent.progressSummary = progress.currentToolArgs
    ?? progress.lastIntent
    ?? progress.assignment
    ?? progress.description
    ?? progress.task;
  agent.currentTool = progress.currentTool
    ? {
        name: progress.currentTool,
        elapsedSeconds: progress.currentToolStartMs === undefined
          ? 0
          : Math.max(0, (lastUpdate - progress.currentToolStartMs) / 1000),
      }
    : null;
  if (agent.activity.length === 0) agent.activity = activityFromProgress(progress, lastUpdate);
}

function activityFromProgress(progress: OmpSubagentProgress | undefined, lastUpdate: number): BackgroundAgentActivity[] {
  if (!progress) return [];
  const activity: BackgroundAgentActivity[] = [];
  for (const tool of progress.recentTools) {
    activity.push({
      type: "tool_call",
      toolName: tool.tool,
      summary: tool.args,
      timestamp: tool.endMs,
    });
  }
  for (let index = 0; index < progress.recentOutput.length; index += 1) {
    const text = progress.recentOutput[index];
    if (text) activity.push({ type: "text", summary: text, timestamp: lastUpdate + index });
  }
  return activity.sort((left, right) => left.timestamp - right.timestamp);
}

function appendActivity(agent: BackgroundAgent, activity: BackgroundAgentActivity): void {
  const previous = agent.activity[agent.activity.length - 1];
  if (
    previous
    && previous.type === activity.type
    && previous.toolName === activity.toolName
    && previous.summary === activity.summary
  ) return;
  agent.activity.push(activity);
}



type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSubagentSource(value: unknown): value is OmpSubagentSource {
  return value === "bundled" || value === "user" || value === "project";
}

function isSubagentStatus(value: unknown): value is OmpSubagentStatus {
  return value === "pending" || value === "running" || value === "completed" || value === "failed" || value === "aborted";
}

function optionalString(value: UnknownRecord, key: string): string | null | undefined {
  const candidate = value[key];
  return candidate === undefined || typeof candidate === "string" ? candidate : null;
}

function readRecentTools(value: unknown): OmpSubagentRecentTool[] | null {
  if (!Array.isArray(value)) return null;
  const tools: OmpSubagentRecentTool[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.tool !== "string" || typeof item.args !== "string" || typeof item.endMs !== "number") return null;
    tools.push({ tool: item.tool, args: item.args, endMs: item.endMs });
  }
  return tools;
}

function readRecentOutput(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const output: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return null;
    output.push(item);
  }
  return output;
}

function readSubagentProgress(value: unknown): OmpSubagentProgress | null {
  if (!isRecord(value)
    || typeof value.index !== "number"
    || typeof value.id !== "string"
    || typeof value.agent !== "string"
    || !isSubagentSource(value.agentSource)
    || !isSubagentStatus(value.status)
    || typeof value.task !== "string"
    || typeof value.toolCount !== "number"
    || typeof value.requests !== "number"
    || typeof value.tokens !== "number"
    || typeof value.cost !== "number"
    || typeof value.durationMs !== "number") return null;

  const recentTools = readRecentTools(value.recentTools);
  const recentOutput = readRecentOutput(value.recentOutput);
  const assignment = optionalString(value, "assignment");
  const description = optionalString(value, "description");
  if (!recentTools || !recentOutput || assignment === null || description === null) return null;

  return {
    index: value.index,
    id: value.id,
    agent: value.agent,
    agentSource: value.agentSource,
    status: value.status,
    task: value.task,
    ...(assignment !== undefined ? { assignment } : {}),
    ...(description !== undefined ? { description } : {}),
    recentTools,
    recentOutput,
    toolCount: value.toolCount,
    requests: value.requests,
    tokens: value.tokens,
    cost: value.cost,
    durationMs: value.durationMs,
  };
}

function readSubagentSnapshot(value: unknown): OmpSubagentSnapshot | null {
  if (!isRecord(value)
    || typeof value.id !== "string"
    || typeof value.index !== "number"
    || typeof value.agent !== "string"
    || !isSubagentSource(value.agentSource)
    || !isSubagentStatus(value.status)
    || typeof value.lastUpdate !== "number") return null;

  const description = optionalString(value, "description");
  const task = optionalString(value, "task");
  const assignment = optionalString(value, "assignment");
  const sessionFile = optionalString(value, "sessionFile");
  const parentToolCallId = optionalString(value, "parentToolCallId");
  const progress = value.progress === undefined ? undefined : readSubagentProgress(value.progress);
  if (description === null || task === null || assignment === null || sessionFile === null || parentToolCallId === null || (value.progress !== undefined && !progress)) return null;

  return {
    id: value.id,
    index: value.index,
    agent: value.agent,
    agentSource: value.agentSource,
    status: value.status,
    lastUpdate: value.lastUpdate,
    ...(description !== undefined ? { description } : {}),
    ...(task !== undefined ? { task } : {}),
    ...(assignment !== undefined ? { assignment } : {}),
    ...(sessionFile !== undefined ? { sessionFile } : {}),
    ...(parentToolCallId !== undefined ? { parentToolCallId } : {}),
    ...(progress ? { progress } : {}),
  };
}

function readSubagentSnapshots(value: unknown): OmpSubagentSnapshot[] | null {
  if (!isRecord(value) || !Array.isArray(value.subagents)) return null;
  const snapshots: OmpSubagentSnapshot[] = [];
  for (const item of value.subagents) {
    const snapshot = readSubagentSnapshot(item);
    if (!snapshot) return null;
    snapshots.push(snapshot);
  }
  return snapshots;
}

function readLifecyclePayload(value: unknown): OmpSubagentLifecyclePayload | null {
  if (!isRecord(value)
    || typeof value.id !== "string"
    || typeof value.index !== "number"
    || typeof value.agent !== "string"
    || !isSubagentSource(value.agentSource)
    || (value.status !== "started" && value.status !== "completed" && value.status !== "failed" && value.status !== "aborted")) return null;

  const description = optionalString(value, "description");
  const sessionFile = optionalString(value, "sessionFile");
  const parentToolCallId = optionalString(value, "parentToolCallId");
  if (description === null || sessionFile === null || parentToolCallId === null) return null;

  return {
    id: value.id,
    index: value.index,
    agent: value.agent,
    agentSource: value.agentSource,
    status: value.status,
    ...(description !== undefined ? { description } : {}),
    ...(sessionFile !== undefined ? { sessionFile } : {}),
    ...(parentToolCallId !== undefined ? { parentToolCallId } : {}),
  };
}

function readProgressPayload(value: unknown): OmpSubagentProgressPayload | null {
  if (!isRecord(value)
    || typeof value.index !== "number"
    || typeof value.agent !== "string"
    || !isSubagentSource(value.agentSource)
    || typeof value.task !== "string") return null;

  const progress = readSubagentProgress(value.progress);
  const assignment = optionalString(value, "assignment");
  const sessionFile = optionalString(value, "sessionFile");
  const parentToolCallId = optionalString(value, "parentToolCallId");
  if (!progress || assignment === null || sessionFile === null || parentToolCallId === null) return null;

  return {
    index: value.index,
    agent: value.agent,
    agentSource: value.agentSource,
    task: value.task,
    progress,
    ...(assignment !== undefined ? { assignment } : {}),
    ...(sessionFile !== undefined ? { sessionFile } : {}),
    ...(parentToolCallId !== undefined ? { parentToolCallId } : {}),
  };
}

function readEventPayload(value: unknown): OmpSubagentEventPayload | null {
  if (!isRecord(value) || typeof value.id !== "string" || !isRecord(value.event) || typeof value.event.type !== "string") return null;

  const toolName = optionalString(value.event, "toolName");
  const startedAtMs = value.event.startedAtMs;
  const isError = value.event.isError;
  if (toolName === null || (startedAtMs !== undefined && typeof startedAtMs !== "number") || (isError !== undefined && typeof isError !== "boolean")) return null;

  const event: OmpRpcFrame = {
    type: value.event.type,
    ...(toolName !== undefined ? { toolName } : {}),
    ...(startedAtMs !== undefined ? { startedAtMs } : {}),
    ...(isError !== undefined ? { isError } : {}),
    ...(value.event.result !== undefined ? { result: value.event.result } : {}),
  };
  return { id: value.id, event };
}

function toPanelStatus(status: OmpSubagentStatus | OmpSubagentLifecyclePayload["status"]): BackgroundAgent["status"] {
  if (status === "completed") return "completed";
  if (status === "failed" || status === "aborted") return "error";
  return "running";
}

function isTerminalStatus(status: BackgroundAgent["status"] | undefined): boolean {
  return status === "completed" || status === "error";
}


function textContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || !("content" in value)) return "";
  const content = value.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const text: string[] = [];
  for (const block of content) {
    if (
      !block
      || typeof block !== "object"
      || !("type" in block)
      || block.type !== "text"
      || !("text" in block)
      || typeof block.text !== "string"
    ) continue;
    text.push(block.text);
  }
  return text.join("\n");
}

export const bgAgentStore = new BackgroundAgentStore();
