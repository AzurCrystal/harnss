import { app } from "electron";
import * as path from "path";
import * as fs from "fs";

/**
 * Resolves the OMP binary path. In packaged builds, uses the binary bundled
 * in app resources (downloaded from our fork's GitHub Releases). In
 * development, falls back to `omp` on PATH.
 */
function resolveOmpBinary(): string {
  if (app.isPackaged) {
    const binaryName = process.platform === "win32" ? "omp.exe" : "omp";
    const bundled = path.join(process.resourcesPath, "omp", binaryName);
    if (fs.existsSync(bundled)) return bundled;
  }
  return "omp";
}

import { spawn, type ChildProcess } from "child_process";
import type {
  OmpRpcCommand,
  OmpRpcFrame,
  OmpRpcResponseFrame,
  OmpStartOptions,
} from "@shared/types/omp";

const MAX_RPC_FRAME_BYTES = 1024 * 1024;
const MAX_RPC_REASSEMBLED_FRAME_BYTES = 64 * 1024 * 1024;
const RPC_CHUNK_PAYLOAD_BYTES = 256 * 1024;

interface PendingRpcChunks {
  chunkId: string;
  count: number;
  byteLength: number;
  nextIndex: number;
  chunks: Buffer[];
  receivedBytes: number;
}

interface PendingRequest {
  resolve: (frame: OmpRpcResponseFrame) => void;
  reject: (error: Error) => void;
}
interface OmpRpcTransportStartOptions extends Omit<OmpStartOptions, "sessionId"> {
  noSession?: boolean;
}

export interface OmpRpcTransportHandlers {
  onFrame: (frame: OmpRpcFrame) => void;
  onStderr: (data: string) => void;
  onExit: (code: number | null, signal: string | null, error?: string) => void;
  onError: (error: Error) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function supportsProtocol2(frame: OmpRpcFrame): frame is OmpRpcFrame & {
  type: "ready";
  supportedProtocolVersions: unknown[];
  maxFrameBytes: number;
  maxReassembledFrameBytes: number;
} {
  return (
    frame.type === "ready" &&
    Array.isArray(frame.supportedProtocolVersions) &&
    frame.supportedProtocolVersions.includes(2) &&
    frame.maxFrameBytes === MAX_RPC_FRAME_BYTES &&
    frame.maxReassembledFrameBytes === MAX_RPC_REASSEMBLED_FRAME_BYTES
  );
}

function isResponseFrame(frame: OmpRpcFrame): frame is OmpRpcResponseFrame {
  return (
    frame.type === "response" &&
    typeof frame.command === "string" &&
    typeof frame.success === "boolean" &&
    (frame.id === undefined || typeof frame.id === "string")
  );
}

function decodeBase64(data: unknown): Buffer {
  if (
    typeof data !== "string" ||
    data.length === 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)
  ) {
    throw new Error("invalid rpc chunk data");
  }

  const bytes = Buffer.from(data, "base64");
  if (bytes.toString("base64") !== data) {
    throw new Error("invalid rpc chunk data");
  }
  return bytes;
}

/** Reassembles OMP protocol-v2 rpc_chunk frames after JSONL parsing. */
class OmpRpcFrameDecoder {
  private pending?: PendingRpcChunks;

  push(value: unknown): OmpRpcFrame | undefined {
    if (!isRecord(value)) {
      throw new Error("rpc frame must be an object");
    }

    if (value.type !== "rpc_chunk") {
      if (this.pending) {
        throw new Error("rpc chunk sequence interrupted");
      }
      return value as OmpRpcFrame;
    }

    const { chunkId, index, count, byteLength } = value;
    if (
      typeof chunkId !== "string" ||
      typeof index !== "number" ||
      typeof count !== "number" ||
      typeof byteLength !== "number" ||
      chunkId.length === 0 ||
      chunkId.length > 128 ||
      !Number.isSafeInteger(index) ||
      !Number.isSafeInteger(count) ||
      !Number.isSafeInteger(byteLength) ||
      index < 0 ||
      count < 2 ||
      count > Math.ceil(MAX_RPC_REASSEMBLED_FRAME_BYTES / RPC_CHUNK_PAYLOAD_BYTES) ||
      index >= count ||
      byteLength < MAX_RPC_FRAME_BYTES ||
      byteLength > MAX_RPC_REASSEMBLED_FRAME_BYTES
    ) {
      throw new Error("invalid rpc chunk metadata");
    }

    const bytes = decodeBase64(value.data);
    if (bytes.byteLength > RPC_CHUNK_PAYLOAD_BYTES) {
      throw new Error("rpc chunk payload exceeds the transport limit");
    }

    if (!this.pending) {
      if (index !== 0) {
        throw new Error("rpc chunk sequence must start at index 0");
      }
      this.pending = {
        chunkId,
        count,
        byteLength,
        nextIndex: 0,
        chunks: [],
        receivedBytes: 0,
      };
    }

    const pending = this.pending;
    if (
      pending.chunkId !== chunkId ||
      pending.count !== count ||
      pending.byteLength !== byteLength ||
      pending.nextIndex !== index
    ) {
      throw new Error("rpc chunk sequence mismatch");
    }

    pending.chunks.push(bytes);
    pending.receivedBytes += bytes.byteLength;
    pending.nextIndex++;

    if (pending.receivedBytes > pending.byteLength) {
      throw new Error("rpc chunk sequence exceeds declared length");
    }
    if (pending.nextIndex < pending.count) {
      return undefined;
    }
    if (pending.receivedBytes !== pending.byteLength) {
      throw new Error("rpc chunk sequence length mismatch");
    }

    this.pending = undefined;
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.concat(pending.chunks, pending.byteLength),
    );
    const frame: unknown = JSON.parse(decoded);
    if (!isRecord(frame)) {
      throw new Error("rpc frame must be an object");
    }
    return frame as OmpRpcFrame;
  }
}

/**
 * One official OMP RPC process. It owns JSONL parsing, protocol-v2 negotiation,
 * request correlation, and strict reassembly of oversized official frames.
 */
export class OmpRpcTransport {
  private readonly decoder = new OmpRpcFrameDecoder();
  private readonly pendingRequests = new Map<string, PendingRequest>();
  private process: ChildProcess | null = null;
  private resolveReady: ((frame: OmpRpcFrame) => void) | null = null;
  private rejectReady: ((error: Error) => void) | null = null;
  private lineBuffer = "";
  private requestCounter = 0;
  private acceptsChunks = false;
  private stopping = false;
  private closed = false;
  private transportError: Error | undefined;

  constructor(private readonly handlers: OmpRpcTransportHandlers) {}

  async start(options: OmpRpcTransportStartOptions): Promise<void> {
    if (this.process) {
      throw new Error("OMP RPC transport is already started");
    }

    const readyPromise = new Promise<OmpRpcFrame>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });

    const args = ["--mode", "rpc", "--cwd", options.cwd];
    if (options.resumeSession !== undefined) {
      args.push("--resume", options.resumeSession);
    }
    if (options.approvalMode !== undefined) {
      args.push("--approval-mode", options.approvalMode);
    }
    if (options.noSession) {
      args.push("--no-session");
    }

    const process = spawn(resolveOmpBinary(), args, {
      cwd: options.cwd,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.process = process;
    this.attachProcess(process);

    try {
      const ready = await readyPromise;
      if (!supportsProtocol2(ready)) {
        throw new Error("OMP RPC protocol v2 is not available");
      }

      // OMP starts emitting v2 frames immediately after the successful response.
      this.acceptsChunks = true;
      const response = await this.request({ type: "negotiate_protocol", protocolVersion: 2 });
      if (
        !response.success ||
        response.command !== "negotiate_protocol" ||
        !isRecord(response.data) ||
        response.data.protocolVersion !== 2
      ) {
        throw new Error("OMP RPC protocol v2 negotiation failed");
      }
    } catch (error) {
      this.stop();
      throw error;
    }
  }

  async command(command: OmpRpcCommand): Promise<OmpRpcResponseFrame | undefined> {
    if (command.type === "extension_ui_response") {
      this.writeFrame(command);
      return undefined;
    }
    return this.request(command);
  }

  stop(): void {
    const process = this.process;
    if (!process || this.closed) {
      return;
    }

    if (this.stopping) {
      return;
    }

    this.stopping = true;
    const stdin = process.stdin;
    if (process.exitCode === null && !process.killed && stdin && !stdin.destroyed && !stdin.writableEnded) {
      stdin.end();
    }
  }

  private attachProcess(process: ChildProcess): void {
    if (!process.stdin || !process.stdout || !process.stderr) {
      this.fail(new Error("OMP RPC process did not expose stdio streams"));
      return;
    }

    process.stdout.setEncoding("utf8");
    process.stdout.on("data", (chunk: string) => this.handleStdout(chunk));
    process.stdout.on("end", () => this.handleStdoutEnd());
    process.stderr.setEncoding("utf8");
    process.stderr.on("data", (chunk: string) => {
      if (chunk) {
        this.handlers.onStderr(chunk);
      }
    });
    process.stdin.on("error", (error) => this.fail(error));
    process.on("error", (error) => this.fail(error));
    process.on("close", (code, signal) => this.handleClose(code, signal));
  }

  private handleStdout(chunk: string): void {
    if (this.transportError) {
      return;
    }

    this.lineBuffer += chunk;
    let newlineIndex = this.lineBuffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = this.lineBuffer.slice(0, newlineIndex).replace(/\r$/, "");
      this.lineBuffer = this.lineBuffer.slice(newlineIndex + 1);
      if (line.trim()) {
        try {
          this.handlePhysicalFrame(JSON.parse(line) as unknown);
        } catch (error) {
          this.fail(new Error(`OMP RPC frame error: ${asError(error).message}`));
          return;
        }
      }
      newlineIndex = this.lineBuffer.indexOf("\n");
    }
  }

  private handleStdoutEnd(): void {
    if (this.transportError || this.closed) {
      return;
    }

    if (this.lineBuffer.trim()) {
      try {
        this.handlePhysicalFrame(JSON.parse(this.lineBuffer) as unknown);
      } catch (error) {
        this.fail(new Error(`OMP RPC frame error: ${asError(error).message}`));
        return;
      }
    }

    if (!this.stopping) {
      this.fail(new Error("OMP RPC stdout closed"));
    }
  }

  private handlePhysicalFrame(value: unknown): void {
    if (isRecord(value) && value.type === "rpc_chunk" && !this.acceptsChunks) {
      throw new Error("OMP RPC chunk received before protocol-v2 negotiation");
    }

    const frame = this.decoder.push(value);
    if (frame) {
      this.handleFrame(frame);
    }
  }

  private handleFrame(frame: OmpRpcFrame): void {
    this.handlers.onFrame(frame);

    if (frame.type === "ready" && this.resolveReady) {
      this.resolveReady(frame);
      this.resolveReady = null;
      this.rejectReady = null;
    }

    if (!isResponseFrame(frame) || !frame.id) {
      return;
    }

    const pending = this.pendingRequests.get(frame.id);
    if (!pending) {
      return;
    }

    this.pendingRequests.delete(frame.id);
    pending.resolve(frame);
  }

  private request(command: Exclude<OmpRpcCommand, { type: "extension_ui_response" }>): Promise<OmpRpcResponseFrame> {
    const id = command.id ?? `omp-${++this.requestCounter}`;
    if (this.pendingRequests.has(id)) {
      return Promise.reject(new Error(`OMP RPC request id is already pending: ${id}`));
    }

    const frame = { ...command, id } as OmpRpcCommand;
    return new Promise<OmpRpcResponseFrame>((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      try {
        this.writeFrame(frame);
      } catch (error) {
        this.pendingRequests.delete(id);
        reject(asError(error));
      }
    });
  }

  private writeFrame(frame: OmpRpcCommand): void {
    const stdin = this.process?.stdin;
    if (!stdin || stdin.destroyed) {
      throw new Error("OMP RPC process is not running");
    }
    stdin.write(`${JSON.stringify(frame)}\n`);
  }

  private fail(error: Error): void {
    if (this.transportError) {
      return;
    }

    this.transportError = error;
    this.handlers.onError(error);
    this.rejectStartup(error);
    this.rejectPending(error);

    const process = this.process;
    if (process && process.exitCode === null && !process.killed) {
      process.kill();
    }
  }

  private handleClose(code: number | null, signal: string | null): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    const error = this.transportError ?? new Error(
      `OMP RPC process exited (code=${code}, signal=${signal})`,
    );
    this.rejectStartup(error);
    this.rejectPending(error);
    this.handlers.onExit(code, signal, this.transportError?.message);
  }

  private rejectStartup(error: Error): void {
    if (this.rejectReady) {
      this.rejectReady(error);
      this.resolveReady = null;
      this.rejectReady = null;
    }
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pendingRequests.values()) {
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }
}
