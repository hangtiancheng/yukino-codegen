import type { FileSystemTree } from "@webcontainer/api";
import { describe, expect, it } from "vitest";
import {
  dependencyFingerprintFromTree,
  isPreviewRunCurrent,
} from "@/pages/app-chat/workspace/webcontainer-runtime";

const dependencyPaths = [
  "package.json",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "yarn.lock",
] as const;

function fileTree(
  files: Readonly<Record<string, string | Uint8Array>>,
): FileSystemTree {
  const tree: FileSystemTree = {};
  for (const [path, contents] of Object.entries(files)) {
    tree[path] = { file: { contents } };
  }
  return tree;
}

describe("dependencyFingerprintFromTree", () => {
  it("changes when any supported dependency file content changes", () => {
    const files = Object.fromEntries(
      dependencyPaths.map((path) => [path, `${path}-v1`]),
    );
    const original = dependencyFingerprintFromTree(fileTree(files));

    for (const path of dependencyPaths) {
      expect(
        dependencyFingerprintFromTree(
          fileTree({ ...files, [path]: `${path}-v2` }),
        ),
      ).not.toBe(original);
    }
  });

  it("ignores source-only changes and file representation", () => {
    const original = dependencyFingerprintFromTree(
      fileTree({ "package.json": '{"name":"demo"}', "src/App.tsx": "v1" }),
    );
    const sourceChanged = dependencyFingerprintFromTree(
      fileTree({ "package.json": '{"name":"demo"}', "src/App.tsx": "v2" }),
    );
    const byteBacked = dependencyFingerprintFromTree(
      fileTree({
        "package.json": new TextEncoder().encode('{"name":"demo"}'),
      }),
    );

    expect(sourceChanged).toBe(original);
    expect(byteBacked).toBe(original);
  });

  it("distinguishes adding or removing a dependency file", () => {
    const withoutLock = dependencyFingerprintFromTree(
      fileTree({ "package.json": "{}" }),
    );
    const withLock = dependencyFingerprintFromTree(
      fileTree({ "package.json": "{}", "yarn.lock": "lock" }),
    );

    expect(withLock).not.toBe(withoutLock);
  });
});

describe("isPreviewRunCurrent", () => {
  it("accepts only the latest live run owned by the current controller", () => {
    expect(isPreviewRunCurrent(3, 3, false, true)).toBe(true);
    expect(isPreviewRunCurrent(2, 3, false, true)).toBe(false);
    expect(isPreviewRunCurrent(3, 3, true, true)).toBe(false);
    expect(isPreviewRunCurrent(3, 3, false, false)).toBe(false);
  });
});
