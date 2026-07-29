import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export interface McpServerConfig {
  name: string;
  transport: "stdio" | "sse" | "http";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

interface OmpMcpConfig {
  mcpServers?: Record<string, unknown>;
  [key: string]: unknown;
}

const MCP_CONFIG_SCHEMA_URL = "https://raw.githubusercontent.com/can1357/oh-my-pi/main/packages/coding-agent/src/config/mcp-schema.json";
const SERVER_NAME_PATTERN = /^[A-Za-z0-9_.-]{1,100}$/;
const SHARED_SERVER_FIELDS = ["enabled", "timeout", "auth", "oauth"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}


function readMcpConfig(cwd: string): OmpMcpConfig {
  const filePath = path.join(cwd, ".omp", "mcp.json");

  try {
    const config: unknown = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    if (!isRecord(config)) {
      throw new Error(`OMP MCP config at ${filePath} must be an object`);
    }
    if (config.mcpServers !== undefined && !isRecord(config.mcpServers)) {
      throw new Error(`OMP MCP config at ${filePath} must contain an object mcpServers map`);
    }
    return config as OmpMcpConfig;
  } catch (error) {
    if (
      typeof error === "object"
      && error !== null
      && "code" in error
      && error.code === "ENOENT"
    ) {
      return { $schema: MCP_CONFIG_SCHEMA_URL, mcpServers: {} };
    }
    throw error;
  }
}

function writeMcpConfig(cwd: string, config: OmpMcpConfig): void {
  const filePath = path.join(cwd, ".omp", "mcp.json");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, JSON.stringify(config, null, 2), "utf-8");
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    try {
      fs.unlinkSync(temporaryPath);
    } catch {
      // The temporary file may not have been created.
    }
    throw error;
  }
}

function validateServerName(name: unknown): void {
  if (typeof name !== "string" || !SERVER_NAME_PATTERN.test(name)) {
    throw new Error("MCP server names must match [A-Za-z0-9_.-]{1,100}");
  }
}

function requireText(value: unknown, description: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${description} is required`);
  }
  return value;
}

function validateMcpServer(server: McpServerConfig): void {
  if (!server || typeof server !== "object") {
    throw new Error("MCP server must be an object");
  }

  validateServerName(server.name);
  switch (server.transport) {
    case "stdio":
      requireText(server.command, `MCP stdio server \"${server.name}\" command`);
      return;
    case "http":
    case "sse":
      requireText(server.url, `MCP ${server.transport} server \"${server.name}\" URL`);
      return;
    default:
      throw new Error("MCP server transport must be stdio, sse, or http");
  }
}

function sharedServerFields(server: unknown): Record<string, unknown> {
  if (!isRecord(server)) return {};

  const shared: Record<string, unknown> = {};
  for (const field of SHARED_SERVER_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(server, field)) {
      shared[field] = server[field];
    }
  }
  return shared;
}

function toOmpServer(server: McpServerConfig, existing: unknown): Record<string, unknown> {
  const shared = sharedServerFields(existing);

  if (server.transport === "stdio") {
    const ompServer: Record<string, unknown> = {
      ...shared,
      type: "stdio",
      command: server.command!,
    };
    if (server.args !== undefined) ompServer.args = server.args;
    if (server.env !== undefined) ompServer.env = server.env;
    return ompServer;
  }

  const ompServer: Record<string, unknown> = {
    ...shared,
    type: server.transport,
    url: server.url!,
  };
  if (server.headers !== undefined) ompServer.headers = server.headers;
  return ompServer;
}

function optionalStringArray(value: unknown, description: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${description} must be an array of strings`);
  }
  return value;
}

function optionalStringRecord(value: unknown, description: string): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || Object.values(value).some((item) => typeof item !== "string")) {
    throw new Error(`${description} must be a string map`);
  }
  return value as Record<string, string>;
}

function fromOmpServer(name: string, value: unknown): McpServerConfig {
  validateServerName(name);
  if (!isRecord(value)) {
    throw new Error(`MCP server \"${name}\" must be an object`);
  }

  if (value.type === undefined || value.type === "stdio") {
    const server: McpServerConfig = {
      name,
      transport: "stdio",
      command: requireText(value.command, `MCP stdio server \"${name}\" command`),
    };
    const args = optionalStringArray(value.args, `MCP stdio server \"${name}\" args`);
    const env = optionalStringRecord(value.env, `MCP stdio server \"${name}\" env`);
    if (args !== undefined) server.args = args;
    if (env !== undefined) server.env = env;
    return server;
  }

  if (value.type === "http" || value.type === "sse") {
    const server: McpServerConfig = {
      name,
      transport: value.type,
      url: requireText(value.url, `MCP ${value.type} server \"${name}\" URL`),
    };
    const headers = optionalStringRecord(value.headers, `MCP ${value.type} server \"${name}\" headers`);
    if (headers !== undefined) server.headers = headers;
    return server;
  }

  throw new Error(`MCP server \"${name}\" has unsupported transport`);
}

export function listMcpServers(cwd: string): McpServerConfig[] {
  const config = readMcpConfig(cwd);
  return Object.entries(config.mcpServers ?? {}).map(([name, server]) => fromOmpServer(name, server));
}

export function addMcpServer(cwd: string, server: McpServerConfig): void {
  validateMcpServer(server);

  const config = readMcpConfig(cwd);
  const mcpServers = config.mcpServers ?? {};
  const updated: OmpMcpConfig = {
    ...config,
    mcpServers: {
      ...mcpServers,
      [server.name]: toOmpServer(server, mcpServers[server.name]),
    },
  };
  writeMcpConfig(cwd, updated);
}

export function removeMcpServer(cwd: string, name: string): void {
  validateServerName(name);

  const config = readMcpConfig(cwd);
  const { [name]: _removed, ...mcpServers } = config.mcpServers ?? {};
  writeMcpConfig(cwd, { ...config, mcpServers });
}

