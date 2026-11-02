import { createReadStream } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { previewBridge } from "./preview-bridge.js";

const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

export async function servePreview(
  request: IncomingMessage,
  response: ServerResponse,
  directory: string,
  path: string,
  prefix: string,
) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  if (path === "__yukino_preview_bridge.js") {
    response.setHeader("Content-Type", "text/javascript; charset=utf-8");
    response.end(request.method === "HEAD" ? undefined : previewBridge);
    return;
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    response.writeHead(400).end();
    return;
  }
  if (decoded.includes("\0") || decoded.includes("\\")) {
    response.writeHead(400).end();
    return;
  }
  const base = await realpath(directory);
  let target = resolve(base, decoded || "index.html");
  const inside = (value: string) => value === base || value.startsWith(`${base}${sep}`);
  if (!inside(target)) {
    response.writeHead(403).end();
    return;
  }
  try {
    const info = await stat(target);
    if (info.isDirectory()) target = resolve(target, "index.html");
  } catch {
    // SPA navigation falls back to index; missing assets retain their 404.
    if (extname(decoded) !== "" || !request.headers.accept?.includes("text/html")) {
      response.writeHead(404).end();
      return;
    }
    target = resolve(base, "index.html");
  }
  target = await realpath(target);
  if (!inside(target)) {
    response.writeHead(403).end();
    return;
  }
  response.setHeader("Content-Type", contentTypes[extname(target)] ?? "application/octet-stream");
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  if (extname(target) === ".html") {
    const html = await readFile(target, "utf8");
    const bridge = `<base href="${prefix}"><script src="${prefix}__yukino_preview_bridge.js"></script>`;
    response.end(
      /<head(?:\s[^>]*)?>/iu.test(html)
        ? html.replace(/<head(?:\s[^>]*)?>/iu, (head) => head + bridge)
        : bridge + html,
    );
    return;
  }
  await pipeline(createReadStream(target), response);
}
