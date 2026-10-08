import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    ]) {
      expect(SERVER_SUPPORTED_COMMANDS.has(name)).toBe(true);
    }
  });

  it("does not contain unsupported commands", () => {
    expect(SERVER_SUPPORTED_COMMANDS.has("bogus")).toBe(false);
    expect(SERVER_SUPPORTED_COMMANDS.size).toBe(9);
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
  it("returns default-registry candidates shaped {name,description,aliases,type}", () => {
    const workDir = mkdtempSync(join(tmpdir(), "yukino-cmd-"));
    const candidates = buildCommandCandidates(workDir);
    expect(candidates.length).toBeGreaterThan(0);
    for (const candidate of candidates) {
      expect(typeof candidate.name).toBe("string");
      expect(candidate.name.length).toBeGreaterThan(0);
      expect(typeof candidate.description).toBe("string");
      expect(Array.isArray(candidate.aliases)).toBe(true);
      expect(typeof candidate.type).toBe("string");
    }
    // The default registry always registers a "help" command.
    expect(candidates.some((c) => c.name === "help")).toBe(true);
  });
});
