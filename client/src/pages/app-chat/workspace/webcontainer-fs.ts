import type { WebContainer } from "@webcontainer/api";
import {
  hashContents,
  isBinaryPath,
  isIgnoredSegment,
  parentPath,
} from "./workspace-paths";
import { sortNodes, type WorkspaceNode } from "./workspace-tree";

const MANIFEST_PATH = "package.json";

/**
 * Walk the live WebContainer filesystem into explorer nodes, skipping ignored
 * directories. This reflects the current working copy (agent output plus any
 * terminal or preview build changes).
 */
export async function walkContainerTree(
  container: WebContainer,
): Promise<readonly WorkspaceNode[]> {
  return readDirectory(container, "");
}

async function readDirectory(
  container: WebContainer,
  directory: string,
): Promise<readonly WorkspaceNode[]> {
  const entries = await container.fs.readdir(
    directory === "" ? "." : directory,
    {
      withFileTypes: true,
    },
  );
  const nodes: WorkspaceNode[] = [];
  for (const entry of entries) {
    if (isIgnoredSegment(entry.name)) continue;
    const path = directory === "" ? entry.name : `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      nodes.push({
        kind: "directory",
        name: entry.name,
        path,
        children: await readDirectory(container, path),
      });
    } else if (entry.isFile()) {
      nodes.push({
        kind: "file",
        name: entry.name,
        path,
        binary: isBinaryPath(path),
      });
    }
  }
  return sortNodes(nodes);
}

export async function readContainerText(
  container: WebContainer,
  path: string,
): Promise<string> {
  return container.fs.readFile(path, "utf-8");
}

export async function readContainerBytes(
  container: WebContainer,
  path: string,
): Promise<Uint8Array> {
  return container.fs.readFile(path);
}

export function base64ToBytes(contents: string): Uint8Array {
  const binary = atob(contents);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function bytesToBase64(contents: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < contents.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...contents.subarray(offset, offset + chunkSize),
    );
  }
  return btoa(binary);
}

export function isUtf8Bytes(contents: Uint8Array): boolean {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(contents);
    return true;
  } catch {
    return false;
  }
}

export type ContainerPathSnapshot =
  | { readonly kind: "file"; readonly contents: Uint8Array }
  | { readonly kind: "directory" }
  | { readonly kind: "missing" };

/** Inspect a watcher path without treating directory read failures as deletes. */
export async function readContainerPath(
  container: WebContainer,
  path: string,
): Promise<ContainerPathSnapshot> {
  try {
    return {
      kind: "file",
      contents: await readContainerBytes(container, path),
    };
  } catch {
    try {
      await container.fs.readdir(path);
      return { kind: "directory" };
    } catch {
      return { kind: "missing" };
    }
  }
}

export async function writeContainerText(
  container: WebContainer,
  path: string,
  text: string,
): Promise<void> {
  const parent = parentPath(path);
  if (parent !== "") await container.fs.mkdir(parent, { recursive: true });
  await container.fs.writeFile(path, text);
}

export async function writeContainerBytes(
  container: WebContainer,
  path: string,
  contents: Uint8Array,
): Promise<void> {
  const parent = parentPath(path);
  if (parent !== "") await container.fs.mkdir(parent, { recursive: true });
  await container.fs.writeFile(path, contents);
}

export async function removeContainerPath(
  container: WebContainer,
  path: string,
): Promise<void> {
  await container.fs.rm(path, { force: true, recursive: true });
}

export async function renameContainerPath(
  container: WebContainer,
  from: string,
  to: string,
): Promise<void> {
  const parent = parentPath(to);
  if (parent !== "") await container.fs.mkdir(parent, { recursive: true });
  await container.fs.rename(from, to);
}

export async function createContainerDirectory(
  container: WebContainer,
  path: string,
): Promise<void> {
  await container.fs.mkdir(path, { recursive: true });
}

export async function containerHasNodeModules(
  container: WebContainer,
): Promise<boolean> {
  const names = await container.fs.readdir(".");
  return names.includes("node_modules");
}

/** Hash of the current `package.json`, or `undefined` when it is missing. */
export async function readManifestHash(
  container: WebContainer,
): Promise<string | undefined> {
  try {
    const contents = await container.fs.readFile(MANIFEST_PATH, "utf-8");
    return hashContents(contents);
  } catch {
    return undefined;
  }
}
