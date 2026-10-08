import type { FileSystemTree } from "@webcontainer/api";
import { describe, expect, it } from "vitest";
import type { AgentFileTreeNode } from "@/shared/schemas";
import {
  base64ToBytes,
  bytesToBase64,
  isUtf8Bytes,
} from "@/pages/app-chat/workspace/webcontainer-fs";
import {
  agentTreeToFileSystem,
  dependencyFilesChanged,
  reconcileSavedFile,
  snapshotFromAgentTree,
  sortNodes,
  threeWayMerge,
  type WorkspaceFileContent,
  type WorkspaceNode,
} from "@/pages/app-chat/workspace/workspace-tree";
import type { WorkspaceFileState } from "@/pages/app-chat/workspace/workspace-types";

function fileNode(
  path: string,
  name: string,
  contents: string,
  encoding: "utf8" | "base64",
  hash: string,
): AgentFileTreeNode {
  return { type: "file", path, name, encoding, contents, hash };
}

function dirNode(
  path: string,
  name: string,
  children: AgentFileTreeNode[],
): AgentFileTreeNode {
  return { type: "directory", path, name, children };
}

/** Narrow a FileSystemTree entry to its file contents. */
function fileContents(tree: FileSystemTree, name: string): string | Uint8Array {
  const entry = tree[name];
  if (!entry || !("file" in entry) || !("contents" in entry.file)) {
    throw new Error(`no file entry: ${name}`);
  }
  return entry.file.contents;
}

function directoryTree(tree: FileSystemTree, name: string): FileSystemTree {
  const entry = tree[name];
  if (!entry || !("directory" in entry)) {
    throw new Error(`no directory entry: ${name}`);
  }
  return entry.directory;
}

function fileState(contents: string): WorkspaceFileState {
  return {
    path: "src/App.tsx",
    binary: false,
    contents,
    baseText: "base",
    baseHash: "base-hash",
    serverHash: "old-server-hash",
    dirty: true,
    revision: 1,
    conflict: undefined,
  };
}

describe("reconcileSavedFile", () => {
  it("marks an unchanged attempted snapshot clean", () => {
    const attempted = fileState("saved");
    const result = reconcileSavedFile(attempted, attempted, "new-hash");

    expect(result.baseText).toBe("saved");
    expect(result.serverHash).toBe("new-hash");
    expect(result.dirty).toBe(false);
  });

  it("preserves edits made during the save and leaves them dirty", () => {
    const attempted = fileState("saved");
    const latest = { ...attempted, contents: "edited while saving" };
    const result = reconcileSavedFile(attempted, latest, "new-hash");

    expect(result.contents).toBe("edited while saving");
    expect(result.baseText).toBe("saved");
    expect(result.serverHash).toBe("new-hash");
    expect(result.dirty).toBe(true);
  });
});

describe("threeWayMerge", () => {
  it("returns local when local and server agree (identical edits)", () => {
    const result = threeWayMerge("base", "same", "same");
    expect(result).toEqual({ clean: true, text: "same" });
  });

  it("takes the server side when only the server diverged from base", () => {
    // base === local, so the local side never changed.
    const result = threeWayMerge("base", "base", "server-change");
    expect(result).toEqual({ clean: true, text: "server-change" });
  });

  it("takes the local side when only the local side diverged from base", () => {
    // base === server, so the server never changed.
    const result = threeWayMerge("base", "local-change", "base");
    expect(result).toEqual({ clean: true, text: "local-change" });
  });

  it("reports a conflict when all three differ", () => {
    const result = threeWayMerge("base", "local", "server");
    expect(result).toEqual({ clean: false });
  });
});

describe("sortNodes", () => {
  it("orders directories before files, each case-insensitively alphabetical", () => {
    const nodes: WorkspaceNode[] = [
      { kind: "file", name: "Zebra.ts", path: "Zebra.ts", binary: false },
      { kind: "directory", name: "alpha", path: "alpha", children: [] },
      { kind: "file", name: "apple.ts", path: "apple.ts", binary: false },
      { kind: "directory", name: "Beta", path: "Beta", children: [] },
      { kind: "file", name: "banana.ts", path: "banana.ts", binary: false },
    ];
    expect(sortNodes(nodes).map((node) => node.name)).toEqual([
      "alpha",
      "Beta",
      "apple.ts",
      "banana.ts",
      "Zebra.ts",
    ]);
  });

  it("does not mutate the input array", () => {
    const nodes: WorkspaceNode[] = [
      { kind: "file", name: "b.ts", path: "b.ts", binary: false },
      { kind: "file", name: "a.ts", path: "a.ts", binary: false },
    ];
    const snapshot = nodes.map((node) => node.name);
    sortNodes(nodes);
    expect(nodes.map((node) => node.name)).toEqual(snapshot);
  });
});

describe("agentTreeToFileSystem", () => {
  it("returns an empty tree when the root is a file", () => {
    expect(
      agentTreeToFileSystem(fileNode("a.ts", "a.ts", "x", "utf8", "h")),
    ).toEqual({});
  });

  it("keeps utf8 files as strings and decodes base64 files to bytes", () => {
    const tree = agentTreeToFileSystem(
      dirNode("", "root", [
        fileNode("app.ts", "app.ts", "const x = 1;", "utf8", "h1"),
        // "aGVsbG8=" is base64 for "hello".
        fileNode("logo.bin", "logo.bin", "aGVsbG8=", "base64", "h2"),
      ]),
    );

    expect(fileContents(tree, "app.ts")).toBe("const x = 1;");

    const decoded = fileContents(tree, "logo.bin");
    expect(decoded).toBeInstanceOf(Uint8Array);
    if (!(decoded instanceof Uint8Array))
      throw new Error("expected binary contents");
    expect(new TextDecoder().decode(decoded)).toBe("hello");
  });

  it("nests directories and skips ignored directories", () => {
    const tree = agentTreeToFileSystem(
      dirNode("", "root", [
        dirNode("src", "src", [
          fileNode("src/index.ts", "index.ts", "export {};", "utf8", "h1"),
        ]),
        dirNode("node_modules", "node_modules", [
          fileNode("node_modules/pkg.js", "pkg.js", "junk", "utf8", "h2"),
        ]),
      ]),
    );

    expect(Object.keys(tree)).toEqual(["src"]);
    const src = directoryTree(tree, "src");
    expect(fileContents(src, "index.ts")).toBe("export {};");
  });
});

describe("snapshotFromAgentTree", () => {
  it("returns empty nodes and files when the root is a file", () => {
    const snapshot = snapshotFromAgentTree(
      fileNode("a.ts", "a.ts", "x", "utf8", "h"),
    );
    expect(snapshot.nodes).toEqual([]);
    expect(snapshot.files.size).toBe(0);
  });

  it("builds sorted nodes, records file contents/hashes, and skips ignored dirs", () => {
    const root = dirNode("", "root", [
      dirNode("node_modules", "node_modules", [
        fileNode("node_modules/pkg.js", "pkg.js", "junk", "utf8", "hx"),
      ]),
      dirNode("src", "src", [
        fileNode("src/App.tsx", "App.tsx", "code", "utf8", "h1"),
      ]),
      fileNode("notes.txt", "notes.txt", "hello notes", "utf8", "h2"),
      fileNode("data.bin", "data.bin", "AAAA", "base64", "h3"),
      // utf8 encoding but a binary extension: treated as binary, text dropped.
      fileNode("logo.png", "logo.png", "not-real-text", "utf8", "h4"),
    ]);

    const { nodes, files } = snapshotFromAgentTree(root);

    // node_modules is skipped; directory sorts before files, files alphabetical.
    expect(nodes.map((node) => node.name)).toEqual([
      "src",
      "data.bin",
      "logo.png",
      "notes.txt",
    ]);

    expect(files.get("src/App.tsx")).toEqual({
      binary: false,
      encoding: "utf8",
      contents: "code",
      text: "code",
      hash: "h1",
    });
    expect(files.get("notes.txt")).toEqual({
      binary: false,
      encoding: "utf8",
      contents: "hello notes",
      text: "hello notes",
      hash: "h2",
    });
    // base64 encoded -> binary, with the transport payload retained.
    expect(files.get("data.bin")).toEqual({
      binary: true,
      encoding: "base64",
      contents: "AAAA",
      text: undefined,
      hash: "h3",
    });
    // utf8 but binary by extension -> binary, preserving its encoding and payload.
    expect(files.get("logo.png")).toEqual({
      binary: true,
      encoding: "utf8",
      contents: "not-real-text",
      text: undefined,
      hash: "h4",
    });
    // The ignored directory contributed nothing to the file map.
    expect(files.has("node_modules/pkg.js")).toBe(false);
  });
});

function snapshotContent(hash: string): WorkspaceFileContent {
  return {
    binary: false,
    encoding: "utf8",
    contents: hash,
    text: hash,
    hash,
  };
}

describe("dependencyFilesChanged", () => {
  it("detects package.json and common lockfile changes", () => {
    const previous = new Map([
      ["package.json", snapshotContent("package-v1")],
      ["pnpm-lock.yaml", snapshotContent("lock-v1")],
    ]);
    const packageChanged = new Map(previous);
    packageChanged.set("package.json", snapshotContent("package-v2"));
    const lockChanged = new Map(previous);
    lockChanged.set("pnpm-lock.yaml", snapshotContent("lock-v2"));

    expect(dependencyFilesChanged(previous, packageChanged)).toBe(true);
    expect(dependencyFilesChanged(previous, lockChanged)).toBe(true);
  });

  it("detects lockfile creation/removal but ignores source-only changes", () => {
    const previous = new Map([
      ["package.json", snapshotContent("package")],
      ["src/App.tsx", snapshotContent("source-v1")],
    ]);
    const sourceChanged = new Map(previous);
    sourceChanged.set("src/App.tsx", snapshotContent("source-v2"));
    const lockAdded = new Map(previous);
    lockAdded.set("yarn.lock", snapshotContent("lock"));

    expect(dependencyFilesChanged(previous, sourceChanged)).toBe(false);
    expect(dependencyFilesChanged(previous, lockAdded)).toBe(true);
    expect(dependencyFilesChanged(lockAdded, previous)).toBe(true);
  });
});

describe("binary transport helpers", () => {
  it("round-trips arbitrary bytes through base64", () => {
    const bytes = Uint8Array.from([0, 1, 127, 128, 254, 255]);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it("distinguishes valid UTF-8 text from arbitrary binary bytes", () => {
    expect(isUtf8Bytes(new TextEncoder().encode("你好, workspace"))).toBe(true);
    expect(isUtf8Bytes(Uint8Array.from([0xff, 0xfe, 0xfd]))).toBe(false);
  });
});
