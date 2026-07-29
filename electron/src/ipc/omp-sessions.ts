import { BrowserWindow, ipcMain } from "electron";
import { reportError } from "../lib/error-utils";
import { OmpRpcTransport } from "../lib/omp-rpc";
import { safeSend } from "../lib/safe-send";
import type { OmpInvokeResult, OmpRpcCommand, OmpStartOptions } from "@shared/types/omp";

interface OmpSession {
  transport: OmpRpcTransport;
  exited: Promise<void>;
  options: OmpStartOptions;
  suppressExitEvent: boolean;
}

const sessions = new Map<string, OmpSession>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function startSession(
  getMainWindow: () => BrowserWindow | null,
  options: OmpStartOptions,
): Promise<OmpInvokeResult> {
  if (sessions.has(options.sessionId)) {
    return { error: `OMP 会话已在运行：${options.sessionId}` };
  }

  let entry: OmpSession | undefined;
  let resolveExited!: () => void;
  const exited = new Promise<void>((resolve) => {
    resolveExited = resolve;
  });
  try {
    const transport = new OmpRpcTransport({
      onFrame: (frame) => {
        safeSend(getMainWindow, "omp:event", { ...frame, _sessionId: options.sessionId });
      },
      onStderr: (data) => {
        safeSend(getMainWindow, "omp:stderr", { _sessionId: options.sessionId, data });
      },
      onExit: (code, signal, error) => {
        const closingSession = entry;
        if (closingSession && sessions.get(options.sessionId) === closingSession) {
          sessions.delete(options.sessionId);
        }
        if (!closingSession?.suppressExitEvent) {
          const exitError = error ?? (code !== 0 && code !== null ? `OMP RPC 进程已退出，退出代码为 ${code}` : undefined);
          safeSend(getMainWindow, "omp:exit", {
            _sessionId: options.sessionId,
            code,
            signal,
            ...(exitError ? { error: exitError } : {}),
          });
        }
        resolveExited();
      },
      onError: (error) => {
        const message = reportError("OMP_RPC", error, { sessionId: options.sessionId });
        safeSend(getMainWindow, "omp:event", {
          type: "error",
          error: message,
          _sessionId: options.sessionId,
        });
      },
    });
    entry = { transport, exited, options, suppressExitEvent: false };
    sessions.set(options.sessionId, entry);
    await transport.start({
      cwd: options.cwd,
      resumeSession: options.resumeSession,
      approvalMode: options.approvalMode,
    });
    return {};
  } catch (error) {
    if (sessions.get(options.sessionId) === entry) {
      sessions.delete(options.sessionId);
    }
    return { error: reportError("OMP_START", error, { sessionId: options.sessionId }) };
  }
}

async function restartSession(
  getMainWindow: () => BrowserWindow | null,
  sessionId: string,
): Promise<OmpInvokeResult> {
  const session = sessions.get(sessionId);
  if (!session) {
    return { data: { restarted: false } };
  }

  try {
    const response = await session.transport.command({ type: "get_state" });
    if (!response?.success) {
      return { error: response?.error ?? "OMP get_state 失败" };
    }
    if (!isRecord(response.data)) {
      return { error: "OMP get_state 未返回会话状态" };
    }
    if (response.data.isStreaming === true || response.data.isCompacting === true) {
      return { error: "OMP 会话正在处理，无法重启" };
    }
    if (typeof response.data.sessionFile !== "string" || response.data.sessionFile.length === 0) {
      return { error: "OMP get_state 未返回 sessionFile" };
    }

    session.suppressExitEvent = true;
    session.transport.stop();
    await session.exited;

    const started = await startSession(getMainWindow, {
      sessionId: session.options.sessionId,
      cwd: session.options.cwd,
      resumeSession: response.data.sessionFile,
      approvalMode: session.options.approvalMode,
    });
    if (started.error) {
      return started;
    }
    return { data: { restarted: true } };
  } catch (error) {
    return { error: reportError("OMP_RESTART", error, { sessionId }) };
  }
}

export function register(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle("omp:start", async (_event, options: OmpStartOptions): Promise<OmpInvokeResult> =>
    startSession(getMainWindow, options),
  );

  ipcMain.handle("omp:restart", async (_event, sessionId: string): Promise<OmpInvokeResult> =>
    restartSession(getMainWindow, sessionId),
  );

  ipcMain.handle(
    "omp:command",
    async (_event, sessionId: string, command: OmpRpcCommand): Promise<OmpInvokeResult> => {
      const session = sessions.get(sessionId);
      if (!session) {
        return { error: `未找到 OMP 会话：${sessionId}` };
      }

      try {
        const response = await session.transport.command(command);
        if (response && !response.success) {
          return { error: response.error ?? `OMP 命令失败：${response.command}` };
        }
        return response ? { data: response.data } : {};
      } catch (error) {
        return { error: reportError("OMP_COMMAND", error, { sessionId, command: command.type }) };
      }
    },
  );

  ipcMain.handle("omp:stop", async (_event, sessionId: string): Promise<OmpInvokeResult> => {
    const session = sessions.get(sessionId);
    if (!session) {
        return { error: `未找到 OMP 会话：${sessionId}` };
    }

    try {
      session.transport.stop();
      await session.exited;
      return {};
    } catch (error) {
      return { error: reportError("OMP_STOP", error, { sessionId }) };
    }
  });
}

/** Stop every OMP process while Electron is quitting. */
export function stopAll(): void {
  for (const [sessionId, session] of sessions) {
    try {
      session.transport.stop();
    } catch (error) {
      reportError("OMP_STOP_ALL", error, { sessionId });
    }
  }
}
