import { describe, expect, it } from "vitest";
import {
  buildCommandCandidates,
  isSkillCommand,
  parseCommand,
  SERVER_SUPPORTED_COMMANDS,
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
      // Library /review prompt command
      "review",
    ]) {
      expect(SERVER_SUPPORTED_COMMANDS.has(name)).toBe(true);
    }
  });

  it("does not contain unsupported commands", () => {
    expect(SERVER_SUPPORTED_COMMANDS.has("bogus")).toBe(false);
    expect(SERVER_SUPPORTED_COMMANDS.size).toBe(16);
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
      expect(SERVER_SUPPORTED_COMMANDS.has(candidate.name)).toBe(true);
    }
    expect(candidates.some((c) => c.name === "help")).toBe(true);
    // Server-specific commands absent from the library registry.
    expect(candidates.some((c) => c.name === "skill")).toBe(true);
    // Library commands the server does not execute stay hidden.
    expect(candidates.some((c) => c.name === "quit")).toBe(false);
  });
});
