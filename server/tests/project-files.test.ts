import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  deleteProjectEntry,
  renameProjectEntry,
  validateRelativePath,
  writeProjectFile,
} from "../src/agent-runtime/project-files.js";
import { ErrorCode, HttpError } from "../src/common/index.js";

// Security-critical path guard. These tests pin the exact allow/deny behavior of
// the client-supplied path validator that every file-mutation endpoint relies on.
const BASE = "/tmp/yukino-project";
const RESOLVED_BASE = resolve(BASE);

describe("validateRelativePath - valid input", () => {
  it("resolves a simple nested file inside the base", () => {
    const target = validateRelativePath(BASE, "src/App.tsx");
    expect(target).toBe(`${RESOLVED_BASE}${sep}src${sep}App.tsx`);
    expect(target.startsWith(`${RESOLVED_BASE}${sep}`)).toBe(true);
  });

  it("resolves a top-level file", () => {
    expect(validateRelativePath(BASE, "package.json")).toBe(
      `${RESOLVED_BASE}${sep}package.json`,
    );
  });

  it("resolves deeply nested paths", () => {
    expect(validateRelativePath(BASE, "a/b/c/d.ts")).toBe(
      `${RESOLVED_BASE}${sep}a${sep}b${sep}c${sep}d.ts`,
    );
  });

  it("trims surrounding whitespace before validating", () => {
    expect(validateRelativePath(BASE, "  src/index.ts  ")).toBe(
      `${RESOLVED_BASE}${sep}src${sep}index.ts`,
    );
  });

  it("matches forbidden names by exact segment, not substring", () => {
    // "distances", "builder", "my.env.ts" contain forbidden tokens as substrings
    // but are NOT forbidden segments, so they must be allowed.
    expect(validateRelativePath(BASE, "src/distances.ts")).toBe(
      `${RESOLVED_BASE}${sep}src${sep}distances.ts`,
    );
    expect(validateRelativePath(BASE, "builder/main.ts")).toBe(
      `${RESOLVED_BASE}${sep}builder${sep}main.ts`,
    );
    expect(validateRelativePath(BASE, "config/my.env.ts")).toBe(
      `${RESOLVED_BASE}${sep}config${sep}my.env.ts`,
    );
    expect(validateRelativePath(BASE, ".gitignore")).toBe(
      `${RESOLVED_BASE}${sep}.gitignore`,
    );
  });
});

describe("validateRelativePath - rejects empty", () => {
  it.each(["", "   ", "\t\n"])("throws ParamsError for %j", (input) => {
    try {
      validateRelativePath(BASE, input);
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).code).toBe(ErrorCode.ParamsError);
      expect((error as HttpError).message).toBe("Path cannot be empty");
    }
  });
});

describe("validateRelativePath - rejects backslashes", () => {
  it.each(["a\\b", "src\\App.tsx", "..\\..\\etc"])("throws for %j", (input) => {
    const run = () => validateRelativePath(BASE, input);
    expect(run).toThrow(HttpError);
    expect(run).toThrow("Backslashes are not allowed in paths");
  });
});

describe("validateRelativePath - rejects absolute paths", () => {
  it.each(["/etc/passwd", "/", "/tmp/x"])("throws for %j", (input) => {
    try {
      validateRelativePath(BASE, input);
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).code).toBe(ErrorCode.ParamsError);
      expect((error as HttpError).message).toBe(
        "Absolute paths are not allowed",
      );
    }
  });
});

describe("validateRelativePath - rejects '.'/'..' and empty segments (traversal)", () => {
  it.each([
    "..",
    "../secret",
    "a/../b",
    "a/./b",
    "./src",
    "a//b",
    "src/..",
    "../../etc/passwd",
  ])("throws traversal error for %j", (input) => {
    try {
      validateRelativePath(BASE, input);
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).code).toBe(ErrorCode.ParamsError);
      expect((error as HttpError).message).toBe(
        "Path traversal is not allowed",
      );
    }
  });
});

describe("validateRelativePath - rejects forbidden segments", () => {
  it.each([
    ".git",
    ".git/config",
    "src/.git/hooks",
    ".yukino",
    ".yukino/commands",
    ".env",
    "config/.env",
    "node_modules",
    "node_modules/react/index.js",
    "dist",
    "dist/bundle.js",
    "build",
    "app/build/output",
  ])("throws ForbiddenError (403) for %j", (input) => {
    try {
      validateRelativePath(BASE, input);
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).code).toBe(ErrorCode.ForbiddenError);
      expect((error as HttpError).statusCode).toBe(403);
      expect((error as HttpError).message).toContain(
        "Path segment is not allowed",
      );
    }
  });

  it("reports the specific offending segment in the message", () => {
    try {
      validateRelativePath(BASE, "src/node_modules/x.js");
      throw new Error("expected throw");
    } catch (error) {
      expect((error as HttpError).message).toBe(
        "Path segment is not allowed: node_modules",
      );
    }
  });
});

describe("validateRelativePath - traversal check precedes forbidden check", () => {
  it("treats '..' before a forbidden segment as a traversal (ParamsError), not forbidden", () => {
    try {
      validateRelativePath(BASE, "../node_modules/x");
      throw new Error("expected throw");
    } catch (error) {
      expect((error as HttpError).code).toBe(ErrorCode.ParamsError);
      expect((error as HttpError).message).toBe(
        "Path traversal is not allowed",
      );
    }
  });
});

const withProject = async (
  run: (directory: string) => Promise<void>,
): Promise<void> => {
  const directory = await mkdtemp(join(tmpdir(), "yukino-project-files-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
};

describe("project file mutation preconditions", () => {
  it("distinguishes create-only, matching, and stale writes", async () => {
    await withProject(async (directory) => {
      const created = await writeProjectFile(directory, {
        contents: "one",
        expectedHash: null,
        path: "src/value.txt",
      });
      expect(created.conflict).toBe(false);
      if (created.conflict || created.hash === undefined)
        throw new Error("expected saved file");

      const createConflict = await writeProjectFile(directory, {
        contents: "two",
        expectedHash: null,
        path: "src/value.txt",
      });
      expect(createConflict).toMatchObject({
        conflict: true,
        actualHash: created.hash,
      });

      const staleConflict = await writeProjectFile(directory, {
        contents: "two",
        expectedHash: "0".repeat(64),
        path: "src/value.txt",
      });
      expect(staleConflict).toMatchObject({
        conflict: true,
        actualHash: created.hash,
      });

      const updated = await writeProjectFile(directory, {
        contents: "two",
        expectedHash: created.hash,
        path: "src/value.txt",
      });
      expect(updated.conflict).toBe(false);
      expect(await readFile(join(directory, "src/value.txt"), "utf8")).toBe(
        "two",
      );
    });
  });

  it("returns a missing-target conflict for an expected existing file", async () => {
    await withProject(async (directory) => {
      const result = await writeProjectFile(directory, {
        contents: "new",
        expectedHash: "0".repeat(64),
        path: "missing.txt",
      });
      expect(result).toEqual({
        actualHash: null,
        conflict: true,
        expectedHash: "0".repeat(64),
        path: "missing.txt",
      });
    });
  });

  it("checks hashes before rename and delete", async () => {
    await withProject(async (directory) => {
      const created = await writeProjectFile(directory, {
        contents: "value",
        expectedHash: null,
        path: "source.txt",
      });
      if (created.conflict || created.hash === undefined)
        throw new Error("expected saved file");

      const renameConflict = await renameProjectEntry(directory, {
        expectedHash: "0".repeat(64),
        from: "source.txt",
        to: "target.txt",
      });
      expect(renameConflict.conflict).toBe(true);

      const renamed = await renameProjectEntry(directory, {
        expectedHash: created.hash,
        from: "source.txt",
        to: "target.txt",
      });
      expect(renamed).toEqual({ conflict: false, path: "target.txt" });

      const deleteConflict = await deleteProjectEntry(directory, {
        expectedHash: "0".repeat(64),
        path: "target.txt",
      });
      expect(deleteConflict.conflict).toBe(true);
    });
  });

  it("honors recursive directory deletion", async () => {
    await withProject(async (directory) => {
      await mkdir(join(directory, "nested"));
      await writeFile(join(directory, "nested/file.txt"), "value");
      await expect(
        deleteProjectEntry(directory, { path: "nested", recursive: false }),
      ).rejects.toThrow();
      await expect(
        deleteProjectEntry(directory, { path: "nested", recursive: true }),
      ).resolves.toEqual({ conflict: false, path: "nested" });
    });
  });

  it("enforces the decoded five MiB limit", async () => {
    await withProject(async (directory) => {
      const allowed = "a".repeat(5 * 1024 * 1024);
      await expect(
        writeProjectFile(directory, {
          contents: allowed,
          expectedHash: null,
          path: "allowed.txt",
        }),
      ).resolves.toMatchObject({ conflict: false });
      await expect(
        writeProjectFile(directory, {
          contents: `${allowed}a`,
          expectedHash: null,
          path: "too-large.txt",
        }),
      ).rejects.toThrow("File contents exceed the size limit");
    });
  });
});
