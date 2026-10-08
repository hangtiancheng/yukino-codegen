import { describe, expect, it } from "vitest";
import {
  mcpServerCreateSchema,
  mcpServerUpdateSchema,
  toMcpCreateData,
  toMcpUpdateData,
  toMcpVo,
} from "../src/agent-runtime/mcp-config.js";
import { decryptStringMap } from "../src/agent-runtime/mcp-crypto.js";

type McpRow = Parameters<typeof toMcpVo>[0];

// Build a realistic AgentMcpServer DB row. Only the fields toMcpVo reads matter;
// the object is cast to the Prisma model type (erased at runtime under vitest).
const makeRow = (overrides: Partial<Record<keyof McpRow, unknown>> = {}): McpRow =>
  ({
    id: "42",
    workspaceId: "7",
    name: "my-server",
    transport: "STDIO",
    command: "node",
    args: ["server.js"],
    url: null,
    encryptedHeaders: null,
    encryptedEnv: null,
    enabled: true,
    status: "UNKNOWN",
    statusMessage: null,
    lastCheckedTime: null,
    createdTime: new Date(0),
    updatedTime: new Date(0),
    ...overrides,
  }) as unknown as McpRow;

describe("toMcpVo - redaction and shape", () => {
  it("never leaks secret material: exposes hasHeaders/hasEnv booleans only", () => {
    const row = makeRow({
      encryptedHeaders: "ENCRYPTED_HEADERS_BLOB",
      encryptedEnv: "ENCRYPTED_ENV_BLOB",
    });
    const vo = toMcpVo(row);
    expect(vo.hasHeaders).toBe(true);
    expect(vo.hasEnv).toBe(true);
    expect("encryptedHeaders" in vo).toBe(false);
    expect("encryptedEnv" in vo).toBe(false);
    const serialized = JSON.stringify(vo);
    expect(serialized).not.toContain("ENCRYPTED_HEADERS_BLOB");
    expect(serialized).not.toContain("ENCRYPTED_ENV_BLOB");
  });

  it("reports false flags when no secrets are stored", () => {
    const vo = toMcpVo(makeRow({ encryptedHeaders: null, encryptedEnv: null }));
    expect(vo.hasHeaders).toBe(false);
    expect(vo.hasEnv).toBe(false);
  });

  it("passes through scalar fields and defaults null args to []", () => {
    const vo = toMcpVo(makeRow({ args: null, command: "python", url: null }));
    expect(vo.id).toBe("42");
    expect(vo.name).toBe("my-server");
    expect(vo.command).toBe("python");
    expect(vo.args).toEqual([]);
    expect(vo.enabled).toBe(true);
  });

  it("maps DB transport enums to wire values (STDIO/HTTP/SSE -> stdio/http/sse)", () => {
    expect(toMcpVo(makeRow({ transport: "STDIO" })).transport).toBe("stdio");
    expect(toMcpVo(makeRow({ transport: "HTTP" })).transport).toBe("http");
    expect(toMcpVo(makeRow({ transport: "SSE" })).transport).toBe("sse");
  });
});

describe("mcpServerCreateSchema", () => {
  it("accepts a valid stdio server with a command", () => {
    const result = mcpServerCreateSchema.safeParse({
      name: "local.fs_server-1",
      transport: "stdio",
      command: "node",
      args: ["index.js"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a stdio server without a command", () => {
    const result = mcpServerCreateSchema.safeParse({ name: "srv", transport: "stdio" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("command"))).toBe(true);
    }
  });

  it("accepts http/sse servers with a url", () => {
    expect(
      mcpServerCreateSchema.safeParse({
        name: "http-srv",
        transport: "http",
        url: "https://mcp.example.com/api",
      }).success,
    ).toBe(true);
    expect(
      mcpServerCreateSchema.safeParse({
        name: "sse-srv",
        transport: "sse",
        url: "https://mcp.example.com/sse",
      }).success,
    ).toBe(true);
  });

  it("rejects http/sse servers without a url", () => {
    expect(mcpServerCreateSchema.safeParse({ name: "http-srv", transport: "http" }).success).toBe(
      false,
    );
    expect(mcpServerCreateSchema.safeParse({ name: "sse-srv", transport: "sse" }).success).toBe(
      false,
    );
  });

  it("rejects wrong transport/field combinations", () => {
    // stdio with only a url (no command)
    expect(
      mcpServerCreateSchema.safeParse({
        name: "srv",
        transport: "stdio",
        url: "https://x.com",
      }).success,
    ).toBe(false);
    // http with only a command (no url)
    expect(
      mcpServerCreateSchema.safeParse({
        name: "srv",
        transport: "http",
        command: "node",
      }).success,
    ).toBe(false);
  });

  it("rejects invalid names and unknown transports", () => {
    expect(
      mcpServerCreateSchema.safeParse({
        name: "bad name with spaces",
        transport: "stdio",
        command: "node",
      }).success,
    ).toBe(false);
    expect(
      mcpServerCreateSchema.safeParse({ name: "srv", transport: "tcp", command: "node" }).success,
    ).toBe(false);
  });
});

describe("mcpServerUpdateSchema", () => {
  it("requires at least one field", () => {
    expect(mcpServerUpdateSchema.safeParse({}).success).toBe(false);
  });

  it("accepts a single-field partial update", () => {
    expect(mcpServerUpdateSchema.safeParse({ enabled: false }).success).toBe(true);
  });

  it("accepts explicit nulls to clear optional fields", () => {
    expect(mcpServerUpdateSchema.safeParse({ command: null, headers: null }).success).toBe(true);
  });
});

describe("toMcpCreateData", () => {
  it("maps a full create input, encrypting env/headers so they round-trip", () => {
    const parsed = mcpServerCreateSchema.parse({
      name: "srv",
      transport: "http",
      url: "https://mcp.example.com",
      headers: { Authorization: "Bearer xyz" },
      env: { TOKEN: "secret" },
      enabled: false,
    });
    const data = toMcpCreateData(99n, parsed);
    expect(data.workspaceId).toBe(99n);
    expect(data.transport).toBe("HTTP");
    expect(data.url).toBe("https://mcp.example.com");
    expect(data.command).toBeNull();
    expect(data.args).toBeNull();
    expect(data.enabled).toBe(false);
    // Secrets are stored encrypted, not in the clear, and decrypt back.
    expect(typeof data.encryptedHeaders).toBe("string");
    expect(data.encryptedHeaders).not.toContain("Bearer xyz");
    expect(decryptStringMap(data.encryptedHeaders ?? null)).toEqual({
      Authorization: "Bearer xyz",
    });
    expect(decryptStringMap(data.encryptedEnv ?? null)).toEqual({ TOKEN: "secret" });
  });

  it("defaults enabled to true and nulls absent secrets", () => {
    const parsed = mcpServerCreateSchema.parse({
      name: "srv",
      transport: "stdio",
      command: "node",
    });
    const data = toMcpCreateData(1n, parsed);
    expect(data.enabled).toBe(true);
    expect(data.transport).toBe("STDIO");
    expect(data.command).toBe("node");
    expect(data.encryptedHeaders).toBeNull();
    expect(data.encryptedEnv).toBeNull();
  });
});

describe("toMcpUpdateData", () => {
  it("includes only provided fields and maps transport", () => {
    const data = toMcpUpdateData({ name: "renamed", transport: "sse" });
    expect(data).toEqual({ name: "renamed", transport: "SSE" });
    expect("url" in data).toBe(false);
    expect("enabled" in data).toBe(false);
  });

  it("passes through explicit null command", () => {
    expect(toMcpUpdateData({ command: null }).command).toBeNull();
  });

  it("clears headers/env when set to null but encrypts when provided", () => {
    expect(toMcpUpdateData({ headers: null }).encryptedHeaders).toBeNull();
    expect(toMcpUpdateData({ env: null }).encryptedEnv).toBeNull();

    const withHeaders = toMcpUpdateData({ headers: { X: "y" } });
    expect(typeof withHeaders.encryptedHeaders).toBe("string");
    expect(decryptStringMap(withHeaders.encryptedHeaders as string)).toEqual({ X: "y" });
  });

  it("omits keys entirely when undefined", () => {
    const data = toMcpUpdateData({ enabled: true });
    expect(data).toEqual({ enabled: true });
  });
});
