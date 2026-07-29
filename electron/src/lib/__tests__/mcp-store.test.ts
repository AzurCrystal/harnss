import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  addMcpServer,
  listMcpServers,
  removeMcpServer,
} from "../mcp-store";

const MCP_CONFIG_SCHEMA_URL = "https://raw.githubusercontent.com/can1357/oh-my-pi/main/packages/coding-agent/src/config/mcp-schema.json";
const temporaryDirectories: string[] = [];

function createTemporaryCwd(): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "harnss-mcp-store-"));
  temporaryDirectories.push(cwd);
  return cwd;
}

function configPath(cwd: string): string {
  return path.join(cwd, ".omp", "mcp.json");
}

function writeConfig(cwd: string, config: unknown): void {
  fs.mkdirSync(path.dirname(configPath(cwd)), { recursive: true });
  fs.writeFileSync(configPath(cwd), JSON.stringify(config), "utf-8");
}

function readConfig(cwd: string): unknown {
  return JSON.parse(fs.readFileSync(configPath(cwd), "utf-8"));
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("OMP MCP config store", () => {
  it("creates the canonical OMP config for a missing workspace config", () => {
    const cwd = createTemporaryCwd();

    addMcpServer(cwd, {
      name: "filesystem",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"],
      env: { LOG_LEVEL: "info" },
    });

    expect(readConfig(cwd)).toEqual({
      $schema: MCP_CONFIG_SCHEMA_URL,
      mcpServers: {
        filesystem: {
          type: "stdio",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"],
          env: { LOG_LEVEL: "info" },
        },
      },
    });
  });

  it("maps OMP stdio, HTTP, and SSE servers to the application server shape", () => {
    const cwd = createTemporaryCwd();
    writeConfig(cwd, {
      $schema: MCP_CONFIG_SCHEMA_URL,
      mcpServers: {
        local: {
          type: "stdio",
          command: "node",
          args: ["server.js"],
          env: { NODE_ENV: "test" },
        },
        remote: {
          type: "http",
          url: "https://mcp.example.test/http",
          headers: { Authorization: "Bearer token" },
        },
        events: {
          type: "sse",
          url: "https://mcp.example.test/sse",
          headers: { "X-Client": "harnss" },
        },
      },
    });

    expect(listMcpServers(cwd)).toEqual([
      {
        name: "local",
        transport: "stdio",
        command: "node",
        args: ["server.js"],
        env: { NODE_ENV: "test" },
      },
      {
        name: "remote",
        transport: "http",
        url: "https://mcp.example.test/http",
        headers: { Authorization: "Bearer token" },
      },
      {
        name: "events",
        transport: "sse",
        url: "https://mcp.example.test/sse",
        headers: { "X-Client": "harnss" },
      },
    ]);
  });

  it("replaces one server without losing shared OMP settings or unrelated config", () => {
    const cwd = createTemporaryCwd();
    const auth = { type: "bearer", token: "secret" };
    const oauth = { issuer: "https://auth.example.test" };
    writeConfig(cwd, {
      $schema: MCP_CONFIG_SCHEMA_URL,
      workspace: { displayName: "Demo" },
      mcpServers: {
        replaceMe: {
          type: "http",
          url: "https://old.example.test/mcp",
          headers: { Authorization: "Bearer obsolete" },
          enabled: false,
          timeout: 12_000,
          auth,
          oauth,
        },
        sibling: {
          type: "sse",
          url: "https://sibling.example.test/events",
        },
      },
    });

    addMcpServer(cwd, {
      name: "replaceMe",
      transport: "stdio",
      command: "node",
      args: ["new-server.js"],
      env: { MODE: "replacement" },
    });

    expect(readConfig(cwd)).toEqual({
      $schema: MCP_CONFIG_SCHEMA_URL,
      workspace: { displayName: "Demo" },
      mcpServers: {
        replaceMe: {
          enabled: false,
          timeout: 12_000,
          auth,
          oauth,
          type: "stdio",
          command: "node",
          args: ["new-server.js"],
          env: { MODE: "replacement" },
        },
        sibling: {
          type: "sse",
          url: "https://sibling.example.test/events",
        },
      },
    });
  });

  it("removes only the requested server", () => {
    const cwd = createTemporaryCwd();
    writeConfig(cwd, {
      $schema: MCP_CONFIG_SCHEMA_URL,
      workspace: { displayName: "Demo" },
      mcpServers: {
        removeMe: { type: "stdio", command: "node" },
        keepMe: { type: "http", url: "https://keep.example.test/mcp" },
      },
    });

    removeMcpServer(cwd, "removeMe");

    expect(readConfig(cwd)).toEqual({
      $schema: MCP_CONFIG_SCHEMA_URL,
      workspace: { displayName: "Demo" },
      mcpServers: {
        keepMe: { type: "http", url: "https://keep.example.test/mcp" },
      },
    });
  });

  it("propagates malformed configs and invalid server input", () => {
    const malformedCwd = createTemporaryCwd();
    fs.mkdirSync(path.dirname(configPath(malformedCwd)), { recursive: true });
    fs.writeFileSync(configPath(malformedCwd), "{not valid JSON", "utf-8");

    expect(() => listMcpServers(malformedCwd)).toThrow(SyntaxError);

    const cwd = createTemporaryCwd();
    expect(() => addMcpServer(cwd, {
      name: "invalid/name",
      transport: "stdio",
      command: "node",
    })).toThrow(/must match/);
    expect(() => addMcpServer(cwd, {
      name: "missing-command",
      transport: "stdio",
      command: " ",
    })).toThrow(/command.*required/);
    expect(() => addMcpServer(cwd, {
      name: "missing-url",
      transport: "http",
      url: " ",
    })).toThrow(/URL.*required/);
  });
});
