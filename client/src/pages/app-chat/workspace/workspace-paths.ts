/**
 * Pure path, hashing, and file-type helpers shared across the workspace.
 *
 * The workspace treats the WebContainer working directory as the root, so all
 * paths here are relative (no leading slash) and use forward slashes.
 */

// Directories that must never trigger a resync, appear in the explorer, or be
// synced back through the Agent file REST API.
export const WORKSPACE_IGNORED_SEGMENTS: ReadonlySet<string> = new Set([
  "node_modules",
  "dist",
  "build",
  ".git",
  ".yukino",
]);

const BINARY_EXTENSIONS: ReadonlySet<string> = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "avif",
  "ico",
  "icns",
  "bmp",
  "tif",
  "tiff",
  "woff",
  "woff2",
  "ttf",
  "otf",
  "eot",
  "mp4",
  "webm",
  "mov",
  "mp3",
  "wav",
  "ogg",
  "flac",
  "pdf",
  "zip",
  "gz",
  "tar",
  "rar",
  "7z",
  "wasm",
  "jar",
  "bin",
  "exe",
  "dll",
  "so",
  "dylib",
]);

const LANGUAGE_BY_EXTENSION: Readonly<Record<string, string>> = {
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  jsonc: "json",
  css: "css",
  scss: "scss",
  less: "less",
  html: "html",
  htm: "html",
  vue: "html",
  svelte: "html",
  md: "markdown",
  markdown: "markdown",
  mdx: "markdown",
  xml: "xml",
  svg: "xml",
  yaml: "yaml",
  yml: "yaml",
  toml: "ini",
  ini: "ini",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  go: "go",
  rs: "rust",
  py: "python",
  rb: "ruby",
  java: "java",
  kt: "kotlin",
  sql: "sql",
  graphql: "graphql",
  gql: "graphql",
  txt: "plaintext",
};

const FILENAME_LANGUAGE: Readonly<Record<string, string>> = {
  dockerfile: "dockerfile",
  ".env": "ini",
  ".gitignore": "plaintext",
  ".npmrc": "ini",
};

/** Strip a leading `./` or `/` and collapse duplicate slashes. */
export function normalizePath(path: string): string {
  return path
    .replace(/^\.\//, "")
    .replace(/^\/+/, "")
    .replace(/\/{2,}/g, "/")
    .replace(/\/+$/, "");
}

export function joinPath(directory: string, name: string): string {
  const normalizedDir = normalizePath(directory);
  return normalizedDir === ""
    ? normalizePath(name)
    : `${normalizedDir}/${name}`;
}

export function parentPath(path: string): string {
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf("/");
  return index < 0 ? "" : normalized.slice(0, index);
}

export function baseName(path: string): string {
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf("/");
  return index < 0 ? normalized : normalized.slice(index + 1);
}

export function fileExtension(path: string): string {
  const name = baseName(path).toLowerCase();
  const index = name.lastIndexOf(".");
  return index <= 0 ? "" : name.slice(index + 1);
}

export function isIgnoredSegment(segment: string): boolean {
  return WORKSPACE_IGNORED_SEGMENTS.has(segment);
}

/** True when any path segment is an ignored directory. */
export function isIgnoredPath(path: string): boolean {
  return normalizePath(path)
    .split("/")
    .some((segment) => WORKSPACE_IGNORED_SEGMENTS.has(segment));
}

export function isBinaryPath(path: string): boolean {
  return BINARY_EXTENSIONS.has(fileExtension(path));
}

export function languageForPath(path: string): string {
  const name = baseName(path).toLowerCase();
  const byName = FILENAME_LANGUAGE[name];
  if (byName !== undefined) return byName;
  return LANGUAGE_BY_EXTENSION[fileExtension(path)] ?? "plaintext";
}

/**
 * Deterministic FNV-1a 32-bit hash rendered as hex. Used to compare editor
 * buffers against their last-synced base without keeping full copies around.
 */
export function hashContents(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
