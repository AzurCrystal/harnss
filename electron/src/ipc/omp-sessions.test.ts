import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type OmpFrame = { type: string; [key: string]: unknown };
type OmpStartCall = {
  cwd: string;
  resumeSession?: string;
  approvalMode?: "always-ask" | "write" | "yolo";
};
type OmpCommandResponse = { success: boolean; data?: unknown; error?: string } | undefined;
type OmpTransportHandlers = {
  onFrame: (frame: OmpFrame) => void;
  onStderr: (data: string) => void;
  onExit: (code: number | null, signal: string | null, error?: string) => void;
  onError: (error: Error) => void;
};
type IpcHandler = (_event: unknown, ...args: unknown[]) => unknown;
type SentEvent = { channel: string; payload: unknown };

const testHarness = vi.hoisted(() => {
  const handlers = new Map<string, IpcHandler>();
  const sent: SentEvent[] = [];
  const transports: MockOmpRpcTransport[] = [];

  const safeSend = vi.fn((_getMainWindow: unknown, channel: string, payload: unknown): void => {
    sent.push({ channel, payload });
  });
  const reportError = vi.fn((_label: string, error: unknown): string =>
    error instanceof Error ? error.message : String(error),
  );
  const ipcMain = {
    handle: vi.fn((channel: string, handler: IpcHandler): void => {
      handlers.set(channel, handler);
    }),
  };

  class MockOmpRpcTransport {
    commandResult: Promise<OmpCommandResponse> = Promise.resolve(undefined);
    private exited = false;

    readonly start = vi.fn(async (_options: OmpStartCall): Promise<void> => undefined);
    readonly command = vi.fn((_command: { type: string }): Promise<OmpCommandResponse> => this.commandResult);
    readonly stop = vi.fn();

    constructor(private readonly handlers: OmpTransportHandlers) {
      transports.push(this);
    }

    emitFrame(frame: OmpFrame): void {
      this.handlers.onFrame(frame);
    }

    emitExit(code: number | null = 0, signal: string | null = null, error?: string): void {
      if (this.exited) return;
      this.exited = true;
      this.handlers.onExit(code, signal, error);
    }
  }

  const reset = (): void => {
    handlers.clear();
    sent.splice(0);
    transports.splice(0);
    ipcMain.handle.mockClear();
    safeSend.mockClear();
    reportError.mockClear();
  };

  return { handlers, sent, transports, safeSend, reportError, ipcMain, MockOmpRpcTransport, reset };
});

vi.mock("electron", () => ({
  BrowserWindow: class BrowserWindow {},
  ipcMain: testHarness.ipcMain,
}));

vi.mock("../lib/error-utils", () => ({ reportError: testHarness.reportError }));
vi.mock("../lib/omp-rpc", () => ({ OmpRpcTransport: testHarness.MockOmpRpcTransport }));
vi.mock("../lib/safe-send", () => ({ safeSend: testHarness.safeSend }));

import { register } from "./omp-sessions";

function registeredHandler(channel: string): IpcHandler {
  const handler = testHarness.handlers.get(channel);
  if (!handler) throw new Error(`No handler registered for ${channel}`);
  return handler;
}

function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  return Promise.resolve(registeredHandler(channel)({}, ...args));
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function onlyTransport(): InstanceType<typeof testHarness.MockOmpRpcTransport> {
  const transport = testHarness.transports[0];
  if (!transport) throw new Error("Expected one OMP transport");
  return transport;
}

describe("OMP session IPC restart", () => {
  beforeEach(() => {
    testHarness.reset();
    register(() => null);
  });

  afterEach(() => {
    for (const transport of [...testHarness.transports]) {
      transport.emitExit();
    }
    testHarness.reset();
  });

  it("reports a non-live session as not restarted", async () => {
    await expect(invoke("omp:restart", "not-live")).resolves.toEqual({ data: { restarted: false } });
    expect(testHarness.transports).toHaveLength(0);
  });

  for (const busyState of ["isStreaming", "isCompacting"] as const) {
    it(`does not restart a session while ${busyState}`, async () => {
      const options = {
        sessionId: `busy-${busyState}`,
        cwd: "/work/busy-project",
        approvalMode: "write" as const,
      };

      await expect(invoke("omp:start", options)).resolves.toEqual({});
      const transport = onlyTransport();
      transport.commandResult = Promise.resolve({
        success: true,
        data: { sessionFile: "/work/busy-project/.omp/session.jsonl", [busyState]: true },
      });

      const result = await invoke("omp:restart", options.sessionId);

      expect(transport.command).toHaveBeenCalledTimes(1);
      expect(transport.command).toHaveBeenCalledWith({ type: "get_state" });
      expect(transport.stop).not.toHaveBeenCalled();
      expect(testHarness.transports).toHaveLength(1);
      expect(result).toMatchObject({ error: expect.any(String) });
    });
  }

  it("restarts an idle session without publishing its internal exit", async () => {
    const options = {
      sessionId: "harnss-session-42",
      cwd: "/work/project with spaces",
      resumeSession: "/previous/session.jsonl",
      approvalMode: "always-ask" as const,
    };
    const sessionFile = "/work/project with spaces/.omp/sessions/current-session.jsonl";

    await expect(invoke("omp:start", options)).resolves.toEqual({});
    const original = onlyTransport();
    const state = deferred<OmpCommandResponse>();
    const stopped = deferred<void>();
    original.commandResult = state.promise;
    original.stop.mockImplementation(() => stopped.resolve());

    const restarting = invoke("omp:restart", options.sessionId);
    expect(original.command).toHaveBeenCalledWith({ type: "get_state" });

    state.resolve({
      success: true,
      data: { sessionFile, isStreaming: false, isCompacting: false },
    });
    await stopped.promise;

    expect(original.stop).toHaveBeenCalledTimes(1);
    expect(testHarness.transports).toHaveLength(1);

    original.emitExit();
    await expect(restarting).resolves.toEqual({ data: { restarted: true } });

    expect(testHarness.sent.filter(({ channel }) => channel === "omp:exit")).toEqual([]);
    expect(testHarness.transports).toHaveLength(2);

    const replacement = testHarness.transports[1];
    if (!replacement) throw new Error("Expected a replacement OMP transport");
    expect(replacement.start).toHaveBeenCalledWith({
      cwd: options.cwd,
      resumeSession: sessionFile,
      approvalMode: options.approvalMode,
    });

    replacement.emitFrame({ type: "ready", protocolVersion: 1 });
    expect(testHarness.sent).toContainEqual({
      channel: "omp:event",
      payload: { type: "ready", protocolVersion: 1, _sessionId: options.sessionId },
    });
  });
});
