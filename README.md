<div align="center">

# Yukino Codegen

**Describe it. Watch it build itself — right in your browser.**

An AI code-generation platform powered by the [Yukino](https://github.com/hangtiancheng/yukino-code) coding agent: one prompt becomes a real, runnable web app, written to disk on the server and built on the server and previewed from static `dist` assets.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A520-5FA04E?logo=node.js&logoColor=white)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-10-F69220?logo=pnpm&logoColor=white)](https://pnpm.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)

</div>

---

## What is this?

Yukino Codegen turns a natural-language prompt into a complete web application. Behind the chat box runs a full coding agent — the same engine as the Yukino terminal agent — equipped with real file tools (`ReadFile`, `WriteFile`, `EditFile`, `Glob`, `Grep`, `Bash`), writing an actual Vite + TypeScript project to disk on the server. The server installs dependencies and runs the production build inside a Yukino OS sandbox, then serves an isolated snapshot of `dist`. The browser provides a Monaco editor, a file explorer, and an xterm terminal connected to the same server project.

Then the conversation continues: ask for changes, click an element in the live preview to edit it visually, or send compile/runtime errors straight back to the agent for a fix. Every turn is persisted, resumable, and snapshotted with git.

## Highlights

- **Agentic generation, not template filling** — the Yukino agent (`@yukino.js/yukino`) plans, scaffolds, and iterates on a real project per app, streaming narration and tool activity over WebSocket.
- **Static build preview** — the server runs `npm install` and `npm run build -- --base=./`, then serves `dist` on a separate preview origin. Generate, save, or click Rebuild to publish a new snapshot; build status and logs appear in the UI.
- **Visual editing** — select an element in the live preview and describe the change; the agent maps it back to source. Preview errors can be fed back as context for the next turn.
- **Full agent workspace per app** — sessions with transcript replay, permission modes, MCP servers (stdio / HTTP / SSE, secrets encrypted at rest with AES-256-GCM), lifecycle hooks, skills, memory, subagents, and teams.
- **Git-backed safety** — automatic snapshots of each generated project per turn, with snapshot listing and rewind.
- **Complete product surface** — auth, app gallery ("awesome" list), my-apps, chat history, zip download, Monaco code editor + xterm terminal, and admin consoles for users, apps, and chats.
- **Production-minded backend** — Zod-validated env that refuses unsafe production defaults, Redis-backed sessions and rate limiting, MinIO object storage, Prometheus metrics and health probes.

## How it works

```mermaid
flowchart TB
    Prompt(["Prompt"])

    subgraph Browser["Browser"]
        direction TB
        Chat["Chat UI"]
        Editor["Monaco editor + file explorer + xterm"]
        Preview["Live preview"]
    end

    subgraph Server["Server"]
        direction TB
        Api["Hono API + Agent WebSocket"]
        Runtime["RuntimeManager → per-app AgentRuntime (Yukino agent)"]
        Capabilities["tools: ReadFile / WriteFile / EditFile / Bash / …<br/>MCP · hooks · skills · memory · git snapshots"]
        Workspace["tmp/code_output/{appId}/ ← real project files"]
        Build["Yukino sandbox: npm install → npm run build → dist snapshot"]
        Static["Static preview server :3001"]
        Workspace --> Build --> Static
        Infra["Prisma ⇄ PostgreSQL · Redis (sessions, rate limit)<br/>Storage: local / MinIO · AI endpoint (OpenAI-compatible)"]

        Api --> Runtime --> Capabilities --> Workspace --> Infra
    end

    Prompt --> Chat
    Chat <-->|"WebSocket transcript / tool events"| Api
    Chat --> Editor
    Static --> Preview
    Preview -.->|"errors & element selection"| Api
    Editor <-->|"file API + terminal WebSocket"| Api
```

## Tech stack

| Layer   | Stack                                                                                                                                                 |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client  | React 19 · Vite 7 · TypeScript (strict) · Tailwind CSS 4 · TanStack Query/Form/Virtual · Zustand · Monaco Editor · xterm.js · GSAP |
| Server  | Hono 4 · Node.js · TypeScript (strict) · Zod 4 · Prisma 7 · PostgreSQL · Redis (optional) · MinIO (optional) · `@yukino.js/yukino` agent runtime      |
| Quality | Vitest · ESLint + unicorn (client) · Biome (server) · Prettier                                                                                        |

## Getting started

### Prerequisites

- Node.js ≥ 20 and pnpm
- PostgreSQL (required)
- Linux: `bubblewrap` with user namespaces enabled; macOS: `sandbox-exec` (seatbelt). Builds and terminals require an available Yukino OS sandbox.
- A C++ compiler, `make`, and Python may be needed to build `node-pty` when no prebuilt binary is available.
- Redis (optional locally; required in production)
- An OpenAI-compatible model endpoint (e.g. a local Ollama, DeepSeek, or any compatible gateway)

### 1. Install

```bash
pnpm install
```

### 2. Configure the server

```bash
cp server/.env.example server/.env
```

Edit `server/.env` — at minimum:

```env
DATABASE_URL=postgresql://root:pass@localhost:5432/yukino_codegen

# Point the agent at your model endpoint
AI_PROTOCOL=openai-compat
AI_BASE_URL=http://localhost:11434/v1
AI_MODEL=<your-model>
AI_API_KEY=<your-key>

# Use real random values in any shared environment
PASSWORD_SALT=<private-random-salt>
SESSION_SECRET=<private-random-session-secret>
```

See [`server/.env.example`](./server/.env.example) for the full documented list.

### 3. Prepare the database

```bash
cd server
pnpm prisma:generate
pnpm db:migrate
```

### 4. Run

From the repository root:

```bash
pnpm dev
```

- Client: http://localhost:5173 — the dev server proxies `/api` and the agent WebSocket to the backend
- Server API: http://localhost:3000/api

- Static app previews: http://localhost:3001 (capability URLs issued by the API).

For remote hosting, set `PREVIEW_PUBLIC_URL` to a separate preview origin and proxy it to `PREVIEW_PORT` (default `3001`). The frontend needs no cross-origin isolation headers. Preview uses completed builds only; there is no development server or hot reload.

## Project structure

```text
.
├── client/                     React SPA
│   └── src/
│       ├── app/                Router, providers, page transitions
│       ├── pages/              home · app-chat · app-edit · auth · admin consoles
│       └── shared/             api · auth · ui · query · config
├── server/                     Hono backend
│   ├── prisma/                 Schema & migrations (users, apps, agent workspaces…)
│   ├── prompts/                Site-generator system prompt
│   └── src/
│       ├── agent-runtime/      Yukino agent integration: runtime manager, MCP,
│       │                       hooks, skills, memory, teams, git snapshots, WS protocol
│       ├── routes/             user · app · agent (ws/rest/files) · chat-history · management
│       ├── workspace/          Sandboxed builds, PTY terminals, static dist previews
│       ├── session/            Session stores (Redis / in-memory) & auth middleware
│       ├── deployment/         Storage adapters (local / MinIO) & static serving
│       ├── observability/      Health checks, Prometheus metrics, request context
│       └── config/             Zod env & AI schemas (fail-fast validation)
└── docs/                       Images & reports
```

## Scripts

Run from the repository root (each fans out to both workspaces):

| Command       | Description                               |
| ------------- | ----------------------------------------- |
| `pnpm dev`    | Start client and server in watch mode     |
| `pnpm build`  | Build client and server                   |
| `pnpm test`   | Run Vitest suites (client + server)       |
| `pnpm lint`   | ESLint (client) + Biome CI check (server) |
| `pnpm format` | Prettier (client) + Biome format (server) |

Server-only database commands (`db:migrate`, `db:deploy`, `prisma:generate`, …) live in [`server/package.json`](./server/package.json).

## Production checklist

The env schema enforces these when `NODE_ENV=production` — the server refuses to boot otherwise:

- `CORS_ALLOWED_ORIGINS` set to explicit origins (no `*`)
- `PASSWORD_SALT`, `SESSION_SECRET`, and `MCP_SECRET_KEY` overridden
- `REDIS_URL` configured (sessions & rate limiting)
- `STORAGE_DRIVER=minio` with credentials configured

## License

[MIT](./LICENSE) © hangtiancheng
