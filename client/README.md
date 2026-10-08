# Yukino Codegen Client

The Yukino Codegen Client is the React frontend for the AI code generation platform. It provides the product interface for browsing generated apps, creating new apps from prompts, chatting with the AI code generator, previewing generated output, editing app metadata, and managing users, apps, and chat history from admin pages.

The client is built with React 19, Vite, TypeScript, React Router, TanStack Query, TanStack Form, Zod, Tailwind CSS, and a small shared UI system. Runtime configuration is validated with Zod, server responses are decoded through schemas, and streaming code generation is consumed through Server-Sent Events.

## Table of Contents

- [Overview](#overview)
- [Core Capabilities](#core-capabilities)
- [Architecture](#architecture)
- [Directory Guide](#directory-guide)
- [Runtime Requirements](#runtime-requirements)
- [Quick Start](#quick-start)
- [Runtime Configuration](#runtime-configuration)
- [Application Routes](#application-routes)
- [API Layer](#api-layer)
- [Streaming Code Generation](#streaming-code-generation)
- [Authentication](#authentication)
- [State and Server Cache](#state-and-server-cache)
- [Pages](#pages)
- [Shared UI](#shared-ui)
- [Generated App Preview](#generated-app-preview)
- [Forms and Validation](#forms-and-validation)
- [Markdown Rendering](#markdown-rendering)
- [Styling](#styling)
- [Build Optimization](#build-optimization)
- [Development Commands](#development-commands)
- [Testing](#testing)
- [Storybook](#storybook)
- [Production Build](#production-build)
- [Type and Validation Rules](#type-and-validation-rules)
- [Troubleshooting](#troubleshooting)
- [Maintenance Notes](#maintenance-notes)

## Overview

This package contains the browser application for the AI code generation product.

Default local development URL:

```text
http://localhost:5173
```

Default backend API URL:

```text
http://localhost:3000/api
```

The frontend communicates with the backend through:

- JSON APIs for users, apps, chat history, and admin pages.
- Server-Sent Events for streaming AI-generated code.
- Static preview URLs for generated output.

The app is intentionally schema-driven. Runtime environment variables, route parameters, API responses, stream events, branded IDs, pagination, admin filters, visual editor payloads, and domain objects are validated with Zod before use.

## Core Capabilities

### App Discovery

The home page lists public or featured generated apps and provides a prompt composer for starting a new generation flow.

Capabilities:

- Browse generated apps.
- Search or paginate app cards.
- Open app detail modals.
- Start a new app from an initial prompt.
- Navigate to an app chat workspace.

### AI Chat Workspace

The app chat page is the primary generation workspace.

Capabilities:

- Load app metadata and chat history.
- Stream AI output from the backend.
- Render user and AI messages.
- Preview generated output in an iframe.
- Refresh preview content with versioned URLs.
- Display selected visual editor element context.

### App Editing

The app edit page supports app metadata editing.

Capabilities:

- Edit app information.

### Admin Management

Admin pages provide operational management interfaces.

Capabilities:

- Manage users.
- Manage apps.
- Manage chat history.
- Filter and paginate admin tables.
- Protect admin routes with role checks.

### User Authentication

The client supports:

- Registration.
- Login.
- Session hydration.
- Authenticated route protection.
- Admin route protection.
- Unauthorized API handling.

## Architecture

The client follows a layered structure:

```text
React app
  -> app providers
  -> router
  -> page modules
  -> shared query hooks
  -> shared API clients
  -> HTTP client and SSE client
  -> backend Hono API
```

Core principles:

- Pages own route-level composition and feature-specific UI.
- Shared modules own reusable APIs, schemas, hooks, layout, auth, and UI primitives.
- Zod schemas validate all trust boundaries.
- TanStack Query owns server state and cache invalidation.
- Zustand owns lightweight client auth state.
- Components are kept small and colocated with their tests and stories.

Application providers are assembled in:

```text
src/app/app-providers.tsx
```

The router is defined in:

```text
src/app/app-router.tsx
```

The Vite entry point is:

```text
src/main.tsx
```

## Directory Guide

```text
client/
  src/
    app/
      app-providers.tsx           Root providers for query, router, auth, errors, and toasts
      app-router.tsx              Route definitions and lazy page loading
      app-root.tsx                Root application component
      page-transition.tsx         Route transition wrapper
    pages/
      home/                       Landing page, app list, prompt composer
      app-chat/                   Chat workspace, preview, stream handling, visual editor context
      app-edit/                   App edit form and info panel
      user-login/                 Login page
      user-register/              Registration page
      admin-user-manage/          Admin user table and filters
      admin-app-manage/           Admin app table and filters
      admin-chat-manage/          Admin chat history table and filters
      admin-shared/               Shared admin table helpers
      not-found/                  Fallback page
    shared/
      api/                        HTTP client, endpoint clients, stream client, response decoding
      auth/                       Auth boundary, route guards, user store
      config/                     Runtime environment, endpoint paths, URL builders
      layout/                     Basic layout, header, footer, navigation
      lib/                        Small shared utilities
      observability/              Runtime issue reporting
      query/                      Query client, query keys, query and mutation hooks
      schemas/                    Zod schemas for all external contracts
      ui/                         Reusable UI primitives and domain UI components
    test/
      http-test-helpers.ts        Test utilities for API mocking
      render-with-providers.tsx   Test render helper
    index.css                     Tailwind and global styles
    setup-tests.ts                Vitest setup
    vite-env.d.ts                 Vite environment types
  vite.config.ts                  Vite, Vitest, alias, and build chunk configuration
```

## Runtime Requirements

Recommended local tools:

- Node.js compatible with Vite 7 and React 19.
- pnpm through the repository workspace.
- A running Yukino Codegen Server.
- A browser with modern ES module support.

The frontend does not directly talk to OpenAI, PostgreSQL, Redis, or MinIO. Those dependencies belong to the backend. The frontend only needs the backend API URL.

## Quick Start

Install dependencies:

```bash
pnpm install
```

Start the backend server first. By default, it should listen on:

```text
http://localhost:3000/api
```

Start the frontend:

```bash
cd client
pnpm dev
```

Open:

```text
http://localhost:5173
```

If the backend runs on a different URL, configure `VITE_API_BASE_URL`.

## Runtime Configuration

Runtime environment variables are parsed in:

```text
src/shared/schemas/runtime-env.ts
src/shared/config/runtime-env.ts
```

The schema is:

```ts
VITE_API_BASE_URL: string URL
```

Defaults:

| Variable            | Default                     | Description                                                  |
| ------------------- | --------------------------- | ------------------------------------------------------------ |
| `VITE_API_BASE_URL` | `http://localhost:3000/api` | Backend API base URL. Used by JSON APIs and SSE stream URLs. |

Example local `.env`:

```env
VITE_API_BASE_URL=http://localhost:3000/api
```

The repository currently does not require a client `.env` file for default local development because the variable has a safe local default.

## Application Routes

Routes are defined in `src/app/app-router.tsx`.

Public routes:

| Path             | Page               | Description                     |
| ---------------- | ------------------ | ------------------------------- |
| `/`              | `HomePage`         | App discovery and prompt entry. |
| `/user/login`    | `UserLoginPage`    | Login screen.                   |
| `/user/register` | `UserRegisterPage` | Registration screen.            |

Authenticated routes:

| Path            | Page          | Description                    |
| --------------- | ------------- | ------------------------------ |
| `/app/chat/:id` | `AppChatPage` | AI chat and preview workspace. |
| `/app/edit/:id` | `AppEditPage` | App metadata editing.          |

Admin routes:

| Path                 | Page                  | Description              |
| -------------------- | --------------------- | ------------------------ |
| `/admin/user-manage` | `AdminUserManagePage` | User management.         |
| `/admin/app-manage`  | `AdminAppManagePage`  | App management.          |
| `/admin/chat-manage` | `AdminChatManagePage` | Chat history management. |

Legacy camelCase admin paths redirect to kebab-case paths:

```text
/admin/userManage -> /admin/user-manage
/admin/appManage -> /admin/app-manage
/admin/chatManage -> /admin/chat-manage
```

Unknown routes redirect to `/`.

## API Layer

API code lives under:

```text
src/shared/api/
```

Important files:

```text
http-client.ts              Generic HTTP request client
http-client-singleton.ts    Shared client instance
decode-envelope.ts          Response envelope decoding
app-api.ts                  App APIs
user-api.ts                 User authentication and admin user APIs
chat-history-api.ts         Chat history APIs
chat-stream-client.ts       Server-Sent Events client
chat-stream-parser.ts       Stream event parser
unauthorized-handler.ts     Unauthorized response handling
api-error.ts                Typed API exception model
```

Endpoint paths are defined in:

```text
src/shared/config/endpoints.ts
```

Current endpoint groups include:

```text
app/awesome/list/page/vo
chat-history/app/:appId
chat-history/admin/list/page/vo
app/chat/codegen
```

The API layer validates response envelopes and payloads with Zod. Callers receive typed parsed data rather than untrusted raw JSON.

## Streaming Code Generation

Streaming generation uses Server-Sent Events through `@microsoft/fetch-event-source`.

Main files:

```text
src/shared/api/chat-stream-client.ts
src/shared/api/chat-stream-parser.ts
src/pages/app-chat/use-chat-session.ts
src/pages/app-chat/app-chat-workspace.tsx
```

Stream event handling supports:

- `message` events for incremental generated text chunks.
- `done` events for successful completion.
- `business-error` events for workflow-level failures.
- Ignored events for unsupported or empty payloads.
- Abort handling through `AbortSignal`.
- Network error mapping into `ApiException`.

The stream client sends credentials:

```ts
credentials: "include";
```

This is required because backend authentication is session-based.

## Authentication

Authentication code lives under:

```text
src/shared/auth/
```

Key modules:

```text
auth-boundary.tsx
auth-hydration-gate.tsx
require-auth.tsx
require-admin.tsx
user-store.ts
```

Responsibilities:

- Hydrate the current session at app startup.
- Store the current user in a lightweight client store.
- Block authenticated routes until auth state is known.
- Redirect unauthenticated users away from protected routes.
- Restrict admin pages to admin users.
- Clear or refresh user state when API calls return unauthorized responses.

The root provider composition is:

```tsx
<QueryClientProvider client={queryClient}>
  <BrowserRouter>
    <AuthBoundary>
      <AuthHydrationGate fallback={<PageLoader />}>
        {children}
      </AuthHydrationGate>
    </AuthBoundary>
  </BrowserRouter>
</QueryClientProvider>
```

## State and Server Cache

The client uses TanStack Query for server state.

Relevant files:

```text
src/shared/query/query-client.ts
src/shared/query/query-keys.ts
src/shared/query/hooks/use-app-queries.ts
src/shared/query/hooks/use-app-mutations.ts
src/shared/query/hooks/use-user-queries.ts
src/shared/query/hooks/use-user-mutations.ts
src/shared/query/hooks/use-chat-history-queries.ts
```

Use TanStack Query for:

- App lists.
- App details.
- User queries.
- Chat history.
- Admin tables.
- Mutations with invalidation.

Use local React state for:

- Form-local UI state.
- Modal open state.
- Preview refresh counters.
- In-progress stream text.
- Selected visual editor context.

Use Zustand auth state for:

- Current user.
- Auth hydration status.
- Login/logout state transitions.

## Pages

### Home Page

Directory:

```text
src/pages/home/
```

Responsibilities:

- Render prompt composer.
- Render app sections and app cards.
- Build app list query params.
- Provide quick prompts.
- Navigate into generation flow.

Important files:

```text
home-page.tsx
prompt-composer.tsx
app-section.tsx
quick-prompts.ts
app-list-params.ts
home-actions.ts
```

### App Chat Page

Directory:

```text
src/pages/app-chat/
```

Responsibilities:

- Load app metadata and chat history.
- Manage chat stream lifecycle.
- Append streamed AI chunks.
- Render messages.
- Render generated preview iframe.
- Refresh static previews.
- Track selected visual editor context.

Important files:

```text
app-chat-page.tsx
app-chat-workspace.tsx
app-chat-content.tsx
use-chat-session.ts
use-chat-history-feed.ts
preview-panel.tsx
message-list.tsx
chat-composer.tsx
chat-actions.tsx
chat-stream-url.ts
selected-element-context.ts
use-visual-editor.ts
```

### App Edit Page

Directory:

```text
src/pages/app-edit/
```

Responsibilities:

- Edit app metadata.
- Validate edit forms.
- Submit app updates.

Important files:

```text
app-edit-page.tsx
app-edit-content.tsx
app-edit-form.tsx
app-edit-form-schema.ts
app-edit-toolbar.tsx
app-edit-info-panel.tsx
```

### Admin Pages

Directories:

```text
src/pages/admin-user-manage/
src/pages/admin-app-manage/
src/pages/admin-chat-manage/
src/pages/admin-shared/
```

Responsibilities:

- Render paginated admin tables.
- Manage filter values.
- Format admin values.
- Use shared data-table UI.
- Protect routes with `RequireAdmin`.

## Shared UI

Reusable UI components live under:

```text
src/shared/ui/
```

Examples:

```text
app-card.tsx
app-detail-modal.tsx
auth-card.tsx
avatar.tsx
badge.tsx
button.tsx
confirmation-dialog.tsx
data-table.tsx
empty-state.tsx
error-boundary.tsx
error-state.tsx
loading-state.tsx
markdown-renderer.tsx
page-container.tsx
page-loader.tsx
pagination-controls.tsx
text-area.tsx
text-field.tsx
user-info.tsx
```

Modal components that must remain centered in the browser viewport use React portals to render into `document.body`. This avoids centering relative to a long scrolled page container.

The common modal pattern is:

- Portal to `document.body`.
- Overlay with `fixed inset-0`.
- Scroll-safe wrapper with `overflow-y-auto`.
- Dialog max height based on `100dvh`.

## Generated App Preview

The chat workspace runs generated Vite projects in a browser-side WebContainer.

The preview lifecycle is:

```text
GET /api/app/files/:appId
  -> validate and mount the project file tree
  -> npm install
  -> npm run dev -- --host 0.0.0.0
  -> render the WebContainer server-ready URL in the preview iframe
```

After a generation request completes, the workspace fetches and mounts the latest source tree again. The running Vite server observes those filesystem changes and updates the preview through HMR. The Refresh button uses WebContainer's `reloadPreview` helper.

WebContainer requires a cross-origin isolated host page. Both the Vite development server and Vite preview server send these headers:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: credentialless
```

The visual editor is injected into cross-origin preview responses with `WebContainer.setPreviewScript()`. Parent/preview communication uses `postMessage` and validates the preview origin. Runtime exceptions, rejected promises, and `console.error` calls are surfaced in the chat workspace with an action that sends the error back to the generation agent.

## Forms and Validation

The frontend uses Zod for validation and type derivation.

Schema directories:

```text
src/shared/schemas/
src/pages/app-edit/app-edit-form-schema.ts
```

Important schema groups:

```text
admin-filters.ts
app.ts
base-response.ts
branded-ids.ts
chat-history.ts
chat-stream.ts
codegen-type.ts
pagination.ts
primitives.ts
route-params.ts
runtime-env.ts
user.ts
user-role.ts
visual-editor.ts
```

ID handling:

- API-facing IDs may arrive as numbers, int-like strings, or bigint-like values.
- Frontend schemas normalize transport IDs to branded strings.
- JSON requests should send ID values as strings.
- This avoids JavaScript `bigint` JSON serialization failures.

## Markdown Rendering

Generated AI responses can contain Markdown and code blocks.

Markdown rendering is implemented in:

```text
src/shared/ui/markdown-renderer.tsx
src/shared/ui/render-safe-markdown.ts
src/shared/ui/highlight-code-blocks.ts
```

The renderer uses:

- `marked` for Markdown parsing.
- `dompurify` for sanitization.
- Safe rendering helpers to avoid injecting untrusted HTML.

Always treat model output as untrusted input.

## Styling

The client uses Tailwind CSS through the Vite plugin:

```text
@tailwindcss/vite
```

Global styles live in:

```text
src/index.css
```

Class composition helpers:

```text
src/shared/lib/cn.ts
```

UI components use utility classes directly. Prefer reusable primitives from `src/shared/ui/` when adding new screens.

## Build Optimization

Vite configuration lives in:

```text
vite.config.ts
```

The build uses manual vendor chunks:

| Chunk             | Packages                                  |
| ----------------- | ----------------------------------------- |
| `vendor-react`    | React, React DOM, React Router, Scheduler |
| `vendor-tanstack` | TanStack packages                         |
| `vendor-markdown` | Marked and DOMPurify                      |
| `vendor-icons`    | Lucide React                              |
| `vendor-motion`   | GSAP and Animate.css                      |
| `vendor-core`     | Remaining node_modules dependencies       |

The alias `@` points to:

```text
src/
```

Vitest uses:

```text
jsdom
src/setup-tests.ts
```

## Development Commands

Run commands from the `client` directory unless your workspace tooling forwards package scripts.

```bash
pnpm dev
```

Starts the Vite development server.

```bash
pnpm build
```

Runs TypeScript build mode and then creates a Vite production build.

```bash
pnpm preview
```

Serves the production build locally through Vite preview.

```bash
pnpm lint
```

Runs ESLint with zero warnings allowed.

```bash
pnpm format
```

Formats `src/` with Prettier and Tailwind class sorting.

```bash
pnpm test
```

Runs the Vitest test suite.

```bash
pnpm typecheck
```

Runs TypeScript build mode without emitting output.

```bash
pnpm storybook
```

Starts Storybook on port `6006`.

```bash
pnpm storybook:build
```

Builds static Storybook output.

## Testing

The client uses Vitest, React Testing Library, jsdom, and MSW-style test helpers.

Test setup:

```text
src/setup-tests.ts
src/test/render-with-providers.tsx
src/test/http-test-helpers.ts
```

Common test categories:

- Router and route guard behavior.
- Auth hydration.
- API response decoding.
- Query hooks.
- App chat streaming and preview behavior.
- Form validation.
- Admin page filtering and table behavior.
- Markdown sanitization.
- Runtime environment parsing.
- URL helper behavior.
- Branded ID normalization.

Run all tests:

```bash
pnpm test
```

Run a focused test file:

```bash
pnpm vitest run src/shared/config/urls.test.ts
```

Use focused tests for URL semantics, stream parsing, schema changes, and route guard changes because these areas are easy to regress.

## Storybook

Storybook is configured for component development and visual inspection.

Start Storybook:

```bash
pnpm storybook
```

Build Storybook:

```bash
pnpm storybook:build
```

Story files are colocated with the components or pages they document. Examples:

```text
src/pages/app-chat/app-chat.stories.tsx
src/pages/admin-shared/admin-tables.stories.tsx
src/shared/ui/app-card.stories.tsx
src/shared/ui/feedback-states.stories.tsx
src/shared/ui/foundation.stories.tsx
src/shared/ui/markdown-renderer.stories.tsx
src/shared/ui/modals.stories.tsx
```

Story fixtures should be parsed through the same Zod schemas used by production code whenever possible. This keeps Storybook aligned with real runtime contracts.

## Production Build

Build the frontend:

```bash
pnpm build
```

Preview the built output:

```bash
pnpm preview
```

Deployment checklist:

- Set `VITE_API_BASE_URL` to the public backend API URL.
- Ensure backend CORS allows the frontend origin.
- Ensure cookies or session credentials are valid for the deployed domain setup.
- Run `pnpm typecheck`.
- Run `pnpm lint`.
- Run `pnpm test`.
- Run `pnpm build`.

## Type and Validation Rules

This project follows strict TypeScript and runtime validation rules.

Guidelines:

- Keep `strict` TypeScript enabled.
- Validate external data with Zod before use.
- Derive types from schemas instead of duplicating interfaces.
- Avoid unsafe type assertions.
- Avoid `any`.
- Keep ID transport values as strings after normalization.
- Keep filenames and directories in kebab-case.
- Keep code-adjacent text in English.
- Keep components and modules small and responsibility-focused.

Important boundaries that require validation:

- Runtime environment variables.
- Route params.
- Query params.
- API responses.
- API request bodies.
- SSE event payloads.
- Visual editor messages.
- Storybook fixtures.
- Test fixtures that model backend contracts.

## Troubleshooting

### The App Cannot Reach the Backend

Check:

- `VITE_API_BASE_URL` points to the backend API prefix.
- Backend is running.
- Backend CORS allows the frontend origin.
- Browser requests include credentials where needed.
- The backend API prefix matches the configured client URL.

Default expected pairing:

```text
Frontend: http://localhost:5173
Backend:  http://localhost:3000/api
```

### Login Succeeds but Auth State Is Lost

Check:

- Backend session cookie is set.
- Requests use `credentials: "include"`.
- CORS allows credentials.
- Cookie domain and SameSite settings are compatible with the deployment.
- `AuthHydrationGate` is not blocked by a failed current-user request.

### Code Generation Stream Does Not Display Output

Check:

- The app route is authenticated.
- The stream URL points to `app/chat/codegen`.
- The backend emits SSE events.
- The stream parser recognizes event kinds.
- The browser did not abort the request.
- The backend logs do not show a business error.

### Modal Is Not Centered on Long Pages

Modal overlays should be rendered with a portal into `document.body`.

Check modal implementations:

```text
src/shared/ui/app-detail-modal.tsx
```

Expected pattern:

- `createPortal`.
- `fixed inset-0`.
- `items-center justify-center`.
- `overflow-y-auto`.
- Dialog max height based on `100dvh`.

### Storybook Fails Because a Fixture Is Invalid

Storybook fixtures should satisfy production schemas.

If a visual editor fixture fails, inspect:

```text
src/shared/schemas/visual-editor.ts
```

Then update the story fixture to include all required fields.

### API ID Validation Fails

Frontend ID schemas normalize IDs into branded strings.

Check:

```text
src/shared/schemas/branded-ids.ts
```

When sending JSON, ensure IDs are serialized as strings.

### Markdown Rendering Looks Unsafe or Broken

Check:

```text
src/shared/ui/render-safe-markdown.ts
src/shared/ui/markdown-renderer.tsx
```

Do not render raw model output directly as HTML without sanitization.

## Maintenance Notes

- Keep `src/shared/schemas/` aligned with backend response contracts.
- Add or update tests when changing URL helpers, stream parsing, auth guards, or ID schemas.
- Prefer shared query hooks over ad hoc API calls in page components.
- Prefer shared UI primitives over one-off component styling.
- Keep Storybook fixtures valid against production schemas.
- Keep route paths, navigation links, and route guards synchronized.
- Treat AI-generated Markdown as untrusted content.
- Run `pnpm typecheck`, `pnpm lint`, and `pnpm test` before merging substantial changes.
