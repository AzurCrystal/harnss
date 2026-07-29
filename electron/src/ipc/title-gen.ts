import { ipcMain } from "electron";
import { randomUUID } from "crypto";
import { log } from "../lib/logger";
import { OmpRpcTransport } from "../lib/omp-rpc";
import { reportError } from "../lib/error-utils";
import { gitExec } from "../lib/git-exec";

function firstNonEmptyLine(text: string): string | undefined {
  for (const line of text.split(/\r?\n/g)) {
    const trimmed = line.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return undefined;
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : undefined;
}

function stringAt(value: UnknownRecord, key: string): string | undefined {
  const result = value[key];
  return typeof result === "string" ? result : undefined;
}

function assistantText(message: unknown): string | undefined {
  const assistant = asRecord(message);
  if (!assistant || stringAt(assistant, "role") !== "assistant") return undefined;

  const content = assistant.content;
  if (!Array.isArray(content)) return "";

  let text = "";
  for (const value of content) {
    const block = asRecord(value);
    if (!block || stringAt(block, "type") !== "text") continue;
    const blockText = stringAt(block, "text");
    if (blockText !== undefined) text += blockText;
  }
  return text;
}

function lastAssistantText(messages: unknown): string | undefined {
  if (!Array.isArray(messages)) return undefined;

  let text: string | undefined;
  for (const message of messages) {
    const candidate = assistantText(message);
    if (candidate !== undefined) text = candidate;
  }
  return text;
}

function assistantError(event: UnknownRecord): string | undefined {
  const error = asRecord(event.error);
  return stringAt(error ?? event, "errorMessage")
    ?? stringAt(error ?? event, "message")
    ?? stringAt(event, "error");
}

/** Sends one isolated official OMP RPC prompt and returns its first text line. */
async function oneShotOmpPrompt(
  prompt: string,
  cwd: string,
  logLabel: string,
): Promise<{ result?: string; error?: string }> {
  const startedAt = Date.now();
  let eventCount = 0;
  let lastEventType = "none";
  let lastStderr = "";
  let streamedAssistantText = "";
  let completedAssistantText: string | undefined;
  let terminalAssistantText: string | undefined;
  let terminalError: Error | undefined;
  let terminalComplete = false;
  let resolveTerminal: () => void = () => {};
  const terminal = new Promise<void>((resolve) => {
    resolveTerminal = () => resolve();
  });

  const finishTerminal = (error?: Error): void => {
    if (terminalComplete) return;
    terminalComplete = true;
    terminalError = error;
    resolveTerminal();
  };
  const promptId = `omp-one-shot-${randomUUID()}`;

  const transport = new OmpRpcTransport({
    onFrame: (frame) => {
      eventCount += 1;
      lastEventType = frame.type;

      switch (frame.type) {
        case "response":
          if (frame.id === promptId && frame.command === "prompt" && frame.success === false) {
            finishTerminal(new Error(typeof frame.error === "string" ? frame.error : "OMP 提示失败"));
          }
          break;
        case "message_start":
          if (assistantText(frame.message) !== undefined) {
            streamedAssistantText = "";
          }
          break;
        case "message_update": {
          const event = asRecord(frame.assistantMessageEvent);
          if (!event) break;

          const eventType = stringAt(event, "type");
          if (eventType === "text_delta") {
            const delta = stringAt(event, "delta");
            if (delta !== undefined) streamedAssistantText += delta;
          } else if (eventType === "done") {
            const text = assistantText(event.message) ?? assistantText(frame.message);
            if (text !== undefined) completedAssistantText = text;
          } else if (eventType === "error") {
            terminalError ??= new Error(assistantError(event) ?? "OMP 智能体消息失败");
          }
          break;
        }
        case "message_end": {
          const text = assistantText(frame.message);
          if (text !== undefined) completedAssistantText = text;
          break;
        }
        case "prompt_result":
          if (frame.agentInvoked === false) {
            finishTerminal(new Error("OMP 提示未调用智能体"));
          }
          break;
        case "agent_end":
          if (frame.isTerminal !== false) {
            terminalAssistantText = lastAssistantText(frame.messages);
            finishTerminal(terminalError);
          }
          break;
      }
    },
    onStderr: (data) => {
      const trimmed = data.trim();
      if (!trimmed) return;
      lastStderr = trimmed;
      log(`${logLabel}_STDERR`, trimmed);
    },
    onExit: (code, signal, error) => {
      finishTerminal(new Error(error ?? `OMP RPC 进程已退出（代码=${code}，信号=${signal}）`));
    },
    onError: (error) => {
      finishTerminal(error);
    },
  });

  log(logLabel, `one-shot:start cwd=${cwd} prompt_len=${prompt.length}`);

  try {
    await transport.start({ cwd, noSession: true });
    const response = await transport.command({ id: promptId, type: "prompt", message: prompt });
    if (!response?.success) {
      throw new Error(response?.error ?? "OMP 提示失败");
    }

    await terminal;
    if (terminalError) throw terminalError;

    const result = firstNonEmptyLine(
      terminalAssistantText ?? completedAssistantText ?? streamedAssistantText,
    );
    if (!result) {
      const elapsed = Date.now() - startedAt;
      log(
        `${logLabel}_ERR`,
        `empty result elapsed_ms=${elapsed} events=${eventCount} last_event=${lastEventType} stderr="${lastStderr || "none"}"`,
      );
      return { error: "结果为空" };
    }

    const elapsed = Date.now() - startedAt;
    log(logLabel, `Generated elapsed_ms=${elapsed} text="${result}"`);
    return { result };
  } catch (error) {
    const message = reportError(`${logLabel}_ERR`, error, { context: "omp-one-shot" });
    const elapsed = Date.now() - startedAt;
    log(
      `${logLabel}_ERR`,
      `${message} elapsed_ms=${elapsed} events=${eventCount} last_event=${lastEventType} stderr="${lastStderr || "none"}"`,
    );
    return { error: message };
  } finally {
    transport.stop();
  }
}

export function register(): void {
  ipcMain.handle("omp:generate-title", async (_event, {
    message,
    cwd,
  }: {
    message: string;
    cwd?: string;
  }) => {
    const truncatedMsg = message.length > 500 ? message.slice(0, 500) + "..." : message;
    const prompt = `Generate a very short title (3-7 words) for a chat that starts with this message. Reply with ONLY the title, no quotes, no punctuation at the end.\n\nMessage: ${truncatedMsg}`;

    log("TITLE_GEN", `engine=omp msg="${truncatedMsg.slice(0, 80)}..."`);

    log("TITLE_GEN", `Spawning OMP RPC for: "${truncatedMsg.slice(0, 80)}..." cwd=${cwd}`);
    const { result, error } = await oneShotOmpPrompt(prompt, cwd || process.cwd(), "TITLE_GEN");
    return { title: result, error };
  });

  ipcMain.handle("git:generate-commit-message", async (_event, {
    cwd,
  }: {
    cwd: string;
  }) => {
    try {
      let diff = "";
      let diffSource: "staged" | "working" | "status" | "none" = "none";
      try {
        diff = (await gitExec(["diff", "--staged"], cwd)).trim();
        if (diff) diffSource = "staged";
      } catch {
        diff = "";
      }
      if (!diff) {
        try {
          diff = (await gitExec(["diff"], cwd)).trim();
          if (diff) diffSource = "working";
        } catch {
          diff = "";
        }
      }
      if (!diff) {
        try {
          diff = (await gitExec(["status", "--short"], cwd)).trim();
          if (diff) diffSource = "status";
        } catch {
          diff = "";
        }
      }
      if (!diff) return { error: "没有可描述的更改" };

      const maxChars = 500000;
      const truncated = diff.length > maxChars ? diff.slice(0, maxChars) + "\n... (truncated)" : diff;

      const prompt = `Generate a commit message for the following diff. Follow any CLAUDE.md instructions for commit message format and style. Reply with ONLY the commit message, nothing else.\n\n${truncated}`;

      log(
        "COMMIT_MSG_GEN",
        `engine=omp diff_chars=${diff.length} diff_source=${diffSource} cwd=${cwd}`,
      );

      const { result, error } = await oneShotOmpPrompt(prompt, cwd, "COMMIT_MSG_GEN");
      return { message: result, error };
    } catch (err) {
      const errMsg = reportError("COMMIT_MSG_GEN_ERR", err, { context: "spawn" });
      return { error: errMsg };
    }
  });
}
