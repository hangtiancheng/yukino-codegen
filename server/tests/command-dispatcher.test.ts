import { describe, expect, it } from "vitest";
import {
  buildCommandCandidates,
  isExecutableCommand,
  isSkillCommand,
  parseCommand,
  SERVER_SUPPORTED_COMMANDS,
  TERMINAL_ONLY_COMMANDS,
} from "../src/agent-runtime/command-dispatcher.js";

describe("parseCommand", () => {
  it("parses a bare command with empty args", () => {
    expect(parseCommand("/status")).toEqual({ name: "status", args: "" });
  });

  it("parses a command with trailing args", () => {
    expect(parseCommand("/skill reload foo")).toEqual({
      name: "skill",
      args: "reload foo",
    });
  });

  it("returns null for non-command input", () => {
    expect(parseCommand("hello there")).toBeNull();
    expect(parseCommand("status")).toBeNull();
  });

  it("returns null when the name contains a slash", () => {
    expect(parseCommand("/foo/bar")).toBeNull();
  });
});

describe("SERVER_SUPPORTED_COMMANDS", () => {
  it("contains the documented supported commands", () => {
    for (const name of [
      "help",
      "status",
      "clear",
      "compact",
      "skills",
      "skill",
      "memory",
      "mcp",
      "rewind",
      // Remote parity additions
      "goal",
      "plan",
      "model",
      "thinking",
      "sandbox",
      "worktree",
      "workflows",
      // Library /review prompt command
      "review",
    ]) {
      expect(SERVER_SUPPORTED_COMMANDS.has(name)).toBe(true);
    }
  });

  it("does not contain unsupported commands", () => {
    expect(SERVER_SUPPORTED_COMMANDS.has("bogus")).toBe(false);
    expect(SERVER_SUPPORTED_COMMANDS.size).toBe(17);
  });
});

describe("isExecutableCommand", () => {
  const command = (over: Partial<Parameters<typeof isExecutableCommand>[0]>) =>
    ({
      description: "",
      handler: () => "",
      name: "x",
      type: "local_ui",
      ...over,
    }) as Parameters<typeof isExecutableCommand>[0];

  it("accepts server-supported commands regardless of type", () => {
    expect(isExecutableCommand(command({ name: "clear", type: "local_ui" }))).toBe(true);
    expect(isExecutableCommand(command({ name: "workflows", type: "local_ui" }))).toBe(true);
  });

  it("accepts generic prompt, skill_fork, and local registry commands", () => {
    expect(isExecutableCommand(command({ name: "ultracode", type: "prompt" }))).toBe(true);
    expect(isExecutableCommand(command({ name: "my-skill", type: "skill_fork" }))).toBe(true);
    expect(isExecutableCommand(command({ name: "my-cmd", type: "local" }))).toBe(true);
  });

  it("rejects terminal-only and unknown local_ui commands", () => {
    for (const name of TERMINAL_ONLY_COMMANDS) {
      expect(isExecutableCommand(command({ name, type: "local" }))).toBe(false);
      expect(isExecutableCommand(command({ name, type: "local_ui" }))).toBe(false);
    }
    expect(isExecutableCommand(command({ name: "mystery", type: "local_ui" }))).toBe(false);
  });
});

describe("isSkillCommand", () => {
  it("is true only for the exact 'skill' command", () => {
    expect(isSkillCommand("skill")).toBe(true);
    expect(isSkillCommand("skills")).toBe(false);
    expect(isSkillCommand("help")).toBe(false);
  });
});

describe("buildCommandCandidates", () => {
  it("returns supported candidates shaped {name,description,aliases,type}", () => {
    const candidates = buildCommandCandidates();
    expect(candidates.length).toBeGreaterThan(0);
    for (const candidate of candidates) {
      expect(typeof candidate.name).toBe("string");
      expect(candidate.name.length).toBeGreaterThan(0);
      expect(typeof candidate.description).toBe("string");
      expect(Array.isArray(candidate.aliases)).toBe(true);
      expect(typeof candidate.type).toBe("string");
    }
    expect(candidates.some((c) => c.name === "help")).toBe(true);
    // Server-specific commands absent from the library registry.
    expect(candidates.some((c) => c.name === "skill")).toBe(true);
    // Generic prompt commands from the library registry are executable.
    expect(candidates.some((c) => c.name === "ultracode")).toBe(true);
    // Library commands the server does not execute stay hidden.
    expect(candidates.some((c) => c.name === "quit")).toBe(false);
    expect(candidates.some((c) => c.name === "resume")).toBe(false);
    expect(candidates.some((c) => c.name === "session")).toBe(false);
  });
});
