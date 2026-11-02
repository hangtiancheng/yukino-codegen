import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type SandboxFactory,
  SandboxSession,
  workspaceEnvironment,
} from "../src/workspace/sandbox-session.js";
import { WorkspaceManager } from "../src/workspace/workspace-manager.js";

const resources: { manager: WorkspaceManager; directory: string }[] = [];
afterEach(async () => {
  for (const { manager, directory } of resources.splice(0)) {
    await manager.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});

// Only tests inject a shell adapter; production always requires an available OS sandbox.
async function fixture(options: { timeout?: number; unavailable?: boolean } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "yukino-workspace-test-"));
  const commands: string[] = [];
  const dispose = vi.fn();
  const factory: SandboxFactory = async () =>
    options.unavailable
      ? null
      : {
          implementation: "bwrap",
          available: () => true,
          dispose,
          prepare: (command, config, context) => {
            expect(config.allowWrite).toContain(directory);
            expect(context.cwd).toBe(directory);
            commands.push(command);
            // Avoid fetching packages: this fixture's build has no external dependencies.
            return {
              executable: "bash",
              args: ["-c", command.startsWith("npm install") ? "mkdir -p node_modules" : command],
            };
          },
        };
  const manager = new WorkspaceManager({
    workDirFor: () => directory,
    sandboxFactory: factory,
    ...(options.timeout === undefined ? {} : { buildTimeoutMs: options.timeout }),
  });
  resources.push({ manager, directory });
  await writeFile(
    join(directory, "package.json"),
    JSON.stringify({ scripts: { build: "node build.cjs" } }),
  );
  await writeFile(join(directory, "content.txt"), "first build");
  await writeFile(
    join(directory, "build.cjs"),
    `
    const fs = require('node:fs');
    if (fs.existsSync('fail')) { console.error('intentional compile failure'); process.exit(1); }
    fs.mkdirSync('dist/assets', { recursive: true });
    fs.writeFileSync('dist/index.html', '<!doctype html><html><head></head><body>' + fs.readFileSync('content.txt', 'utf8') + '<script type="module" src="./assets/main.js"></script></body></html>');
    fs.writeFileSync('dist/assets/main.js', 'console.log("static asset")');
    fs.writeFileSync('dist/assets/logo.png', Buffer.from([0, 128, 255]));
    fs.symlinkSync('/etc/passwd', 'dist/escape.txt');
  `,
  );
  return { manager, directory, commands, dispose };
}

async function settled(manager: WorkspaceManager) {
  await vi.waitUntil(() => !["installing", "building"].includes(manager.status(1n).status), {
    timeout: 10_000,
    interval: 10,
  });
  return manager.status(1n);
}

describe("server workspace builds and static snapshots", () => {
  it("shares concurrent builds, serves dist and binary assets, and rejects unsafe paths", async () => {
    const { manager, commands } = await fixture();
    const port = await manager.listen(0, "127.0.0.1");
    await Promise.all([manager.build(1n), manager.build(1n), manager.build(1n)]);
    const state = await settled(manager);
    expect(state.status, state.error).toBe("ready");
    expect(state.revision).toBe(1);
    expect(commands.filter((command) => command.startsWith("npm install"))).toHaveLength(1);
    expect(commands.filter((command) => command.startsWith("npm run build"))).toEqual([
      "npm run build -- --base=./",
    ]);
    const url = `http://127.0.0.1:${port}${state.path}`;
    const html = await fetch(url).then((response) => response.text());
    expect(html).toContain("first build");
    expect(html).toContain(`<base href="${state.path}">`);
    expect(html).toContain("__yukino_preview_bridge.js");
    expect(html).not.toContain("/@vite/client");
    expect(await fetch(`${url}assets/main.js`).then((response) => response.text())).toContain(
      "static asset",
    );
    const image = await fetch(`${url}assets/logo.png`);
    expect(image.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(Uint8Array.from([0, 128, 255]));
    expect((await fetch(`${url}assets/missing.js`)).status).toBe(404);
    expect((await fetch(`${url}escape.txt`)).status).toBe(403);
    expect((await fetch(`${url}%2e%2e%2fsecret.txt`)).status).toBe(403);
    expect((await fetch(`http://127.0.0.1:${port}/package.json`)).status).toBe(404);
    expect((await fetch(`${url}assets/main.js`, { method: "POST" })).status).toBe(405);
    expect((await fetch(`${url}assets/main.js`, { method: "HEAD" })).status).toBe(200);
    expect(
      await fetch(`${url}nested/route`, { headers: { accept: "text/html" } }).then((response) =>
        response.text(),
      ),
    ).toContain("first build");
    expect(
      await fetch(`${url}__yukino_preview_bridge.js`).then((response) => response.text()),
    ).toContain("PREVIEW_UNCAUGHT_EXCEPTION");
  });

  it("publishes new builds and retains the previous snapshot on failure", async () => {
    const { manager, directory, commands } = await fixture();
    const port = await manager.listen(0, "127.0.0.1");
    await manager.build(1n);
    const first = await settled(manager);
    await writeFile(join(directory, "content.txt"), "second build");
    await manager.build(1n);
    const second = await settled(manager);
    expect(second.revision).toBe(2);
    expect(commands.filter((command) => command.startsWith("npm install"))).toHaveLength(1);
    const url = `http://127.0.0.1:${port}${first.path}`;
    const secondUrl = `http://127.0.0.1:${port}${second.path}`;
    expect(await fetch(url).then((response) => response.text())).toContain("first build");
    expect(await fetch(secondUrl).then((response) => response.text())).toContain("second build");
    await writeFile(join(directory, "fail"), "");
    await manager.build(1n);
    const failed = await settled(manager);
    expect(failed.status).toBe("failed");
    expect(failed.logs).toContain("intentional compile failure");
    expect(failed.revision).toBe(2);
    expect(await fetch(secondUrl).then((response) => response.text())).toContain("second build");
    await manager.disposeApp(1n);
    expect((await fetch(url)).status).toBe(404);
  });

  it("does not execute commands when the OS sandbox is unavailable", async () => {
    const { manager, commands } = await fixture({ unavailable: true });
    await manager.build(1n);
    const state = await settled(manager);
    expect(state.status).toBe("failed");
    expect(state.error).toContain("sandbox is unavailable");
    expect(commands).toEqual([]);
    await expect(
      manager.openTerminal(
        1n,
        80,
        24,
        () => {},
        () => {},
      ),
    ).rejects.toThrow("sandbox is unavailable");
  });

  it("times out a build and kills the process group", async () => {
    const { manager, directory } = await fixture({ timeout: 250 });
    await writeFile(join(directory, "build.cjs"), "setTimeout(() => {}, 30000)");
    await manager.build(1n);
    const state = await settled(manager);
    expect(state.status).toBe("failed");
    expect(state.error).toContain("timed out");
    expect(state.path).toBeUndefined();
  });

  it("opens a real resizable PTY against the server project and disposes it", async () => {
    const { manager, directory } = await fixture();
    let output = "";
    const terminal = await manager.openTerminal(
      1n,
      80,
      24,
      (data) => {
        output += data;
      },
      () => {},
    );
    terminal.resize(101, 33);
    terminal.write("printf 'terminal file' > terminal.txt; stty size\r");
    await vi.waitUntil(() => output.includes("33 101"), { timeout: 5000 });
    expect(await readFile(join(directory, "terminal.txt"), "utf8")).toBe("terminal file");
    terminal.dispose();
    await terminal.completion;
  });
});

describe("sandbox environment", () => {
  it("does not inherit API keys or database/session secrets", () => {
    vi.stubEnv("AI_API_KEY", "test-secret");
    vi.stubEnv("DATABASE_URL", "postgresql://secret");
    const environment = workspaceEnvironment("/tmp/test-workspace");
    expect(environment.AI_API_KEY).toBeUndefined();
    expect(environment.DATABASE_URL).toBeUndefined();
    expect(environment.SESSION_SECRET).toBeUndefined();
    expect(environment.HOME).toBe("/tmp/test-workspace");
    vi.unstubAllEnvs();
  });

  it("rejects an unavailable factory without creating a shell", async () => {
    await expect(SandboxSession.create("/tmp/unused", async () => null)).rejects.toThrow(
      "Commands were not executed",
    );
  });
});
