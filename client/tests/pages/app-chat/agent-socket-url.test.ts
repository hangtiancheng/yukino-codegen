import { describe, expect, it, vi } from "vitest";
import type { AppId } from "@/shared/schemas";

/**
 * buildAgentSocketUrl derives its base from getApiBaseUrl(). We mock that single
 * dependency so every protocol branch is exercised deterministically without
 * depending on import.meta.env. The assertions below check the REAL transform
 * output of buildAgentSocketUrl, not the mock.
 */
const config = vi.hoisted(() => ({ baseUrl: "http://localhost:3000/api" }));

vi.mock("@/shared/config", () => ({
  getApiBaseUrl: () => config.baseUrl,
}));

const { buildAgentSocketUrl } =
  await import("@/pages/app-chat/agent-socket-url");

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
const appId = (value: string): AppId => value as AppId;

describe("buildAgentSocketUrl", () => {
  it("upgrades http to ws and builds the agent path", () => {
    config.baseUrl = "http://localhost:3000/api";
    expect(buildAgentSocketUrl(appId("42"))).toBe(
      "ws://localhost:3000/api/app/42/agent/ws",
    );
  });

  it("upgrades https to wss", () => {
    config.baseUrl = "https://api.example.com/api";
    expect(buildAgentSocketUrl(appId("7"))).toBe(
      "wss://api.example.com/api/app/7/agent/ws",
    );
  });

  it("strips any query string and hash from the base URL", () => {
    config.baseUrl = "https://api.example.com/api?token=abc#frag";
    expect(buildAgentSocketUrl(appId("9"))).toBe(
      "wss://api.example.com/api/app/9/agent/ws",
    );
  });

  it("collapses a trailing slash on the base path", () => {
    config.baseUrl = "http://localhost:3000/api/";
    expect(buildAgentSocketUrl(appId("1"))).toBe(
      "ws://localhost:3000/api/app/1/agent/ws",
    );
  });

  it("handles a base with no path segment", () => {
    config.baseUrl = "http://localhost:3000";
    expect(buildAgentSocketUrl(appId("5"))).toBe(
      "ws://localhost:3000/app/5/agent/ws",
    );
  });

  it("preserves an existing ws:// protocol", () => {
    config.baseUrl = "ws://localhost:3000/api";
    expect(buildAgentSocketUrl(appId("3"))).toBe(
      "ws://localhost:3000/api/app/3/agent/ws",
    );
  });

  it("URL-encodes the app id inside the path", () => {
    config.baseUrl = "http://localhost:3000/api";
    expect(buildAgentSocketUrl(appId("a b"))).toBe(
      "ws://localhost:3000/api/app/a%20b/agent/ws",
    );
  });

  it("throws for an unsupported protocol", () => {
    config.baseUrl = "ftp://localhost:3000/api";
    expect(() => buildAgentSocketUrl(appId("1"))).toThrow(
      /Unsupported API URL protocol/,
    );
  });
});
