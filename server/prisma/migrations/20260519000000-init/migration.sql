-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "AgentPermissionMode" AS ENUM ('DEFAULT', 'ACCEPT_EDITS', 'PLAN', 'DONT_ASK', 'BYPASS_PERMISSIONS');

-- CreateEnum
CREATE TYPE "AgentSessionStatus" AS ENUM ('IDLE', 'RUNNING', 'WAITING', 'COMPLETED', 'ABORTED', 'FAILED');

-- CreateEnum
CREATE TYPE "AgentInteractionType" AS ENUM ('PERMISSION', 'QUESTION');

-- CreateEnum
CREATE TYPE "AgentInteractionStatus" AS ENUM ('PENDING', 'ANSWERED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AgentMcpTransport" AS ENUM ('STDIO', 'HTTP', 'SSE');

-- CreateEnum
CREATE TYPE "AgentMcpStatus" AS ENUM ('DISCONNECTED', 'CONNECTING', 'CONNECTED', 'ERROR');

-- CreateTable
CREATE TABLE "users" (
  "id" BIGSERIAL NOT NULL,
  "user_account" VARCHAR(256) NOT NULL,
  "user_password" VARCHAR(512) NOT NULL,
  "username" VARCHAR(256),
  "user_avatar" VARCHAR(1024),
  "user_profile" VARCHAR(512),
  "user_role" "UserRole" NOT NULL DEFAULT 'USER',
  "edit_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "create_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "update_time" TIMESTAMP(3) NOT NULL,
  "is_delete" BOOLEAN NOT NULL DEFAULT false,

  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "apps" (
  "id" BIGSERIAL NOT NULL,
  "app_name" VARCHAR(256),
  "app_cover" VARCHAR(512),
  "init_prompt" TEXT,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "user_id" BIGINT NOT NULL,
  "edit_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "create_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "update_time" TIMESTAMP(3) NOT NULL,
  "is_delete" BOOLEAN NOT NULL DEFAULT false,

  CONSTRAINT "apps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_workspaces" (
  "id" BIGSERIAL NOT NULL,
  "user_id" BIGINT NOT NULL,
  "app_id" BIGINT NOT NULL,
  "current_session_id" UUID,
  "permission_mode" "AgentPermissionMode" NOT NULL DEFAULT 'BYPASS_PERMISSIONS',
  "sandbox_enabled" BOOLEAN NOT NULL DEFAULT false,
  "memory_enabled" BOOLEAN NOT NULL DEFAULT true,
  "hooks_enabled" BOOLEAN NOT NULL DEFAULT true,
  "model_override" VARCHAR(256),
  "create_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "update_time" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "agent_workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_sessions" (
  "id" UUID NOT NULL,
  "workspace_id" BIGINT NOT NULL,
  "status" "AgentSessionStatus" NOT NULL DEFAULT 'IDLE',
  "context" JSONB NOT NULL DEFAULT '{}',
  "last_event_sequence" BIGINT NOT NULL DEFAULT 0,
  "active_skills" JSONB NOT NULL DEFAULT '[]',
  "runtime_metadata" JSONB NOT NULL DEFAULT '{}',
  "create_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "update_time" TIMESTAMP(3) NOT NULL,
  "last_active_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_time" TIMESTAMP(3),

  CONSTRAINT "agent_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_transcript_events" (
  "id" BIGSERIAL NOT NULL,
  "session_id" UUID NOT NULL,
  "sequence" BIGINT NOT NULL,
  "turn_id" UUID,
  "kind" VARCHAR(128) NOT NULL,
  "payload" JSONB NOT NULL,
  "create_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "agent_transcript_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_interactions" (
  "id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "turn_id" UUID,
  "type" "AgentInteractionType" NOT NULL,
  "status" "AgentInteractionStatus" NOT NULL DEFAULT 'PENDING',
  "request_payload" JSONB NOT NULL,
  "response_payload" JSONB,
  "create_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "update_time" TIMESTAMP(3) NOT NULL,
  "expires_time" TIMESTAMP(3),
  "answered_time" TIMESTAMP(3),

  CONSTRAINT "agent_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_mcp_servers" (
  "id" UUID NOT NULL,
  "workspace_id" BIGINT NOT NULL,
  "name" VARCHAR(128) NOT NULL,
  "transport" "AgentMcpTransport" NOT NULL,
  "command" VARCHAR(1024),
  "args" JSONB,
  "url" VARCHAR(2048),
  "encrypted_headers" TEXT,
  "encrypted_env" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "status" "AgentMcpStatus" NOT NULL DEFAULT 'DISCONNECTED',
  "status_message" TEXT,
  "last_checked_time" TIMESTAMP(3),
  "create_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "update_time" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "agent_mcp_servers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_hooks" (
  "id" UUID NOT NULL,
  "workspace_id" BIGINT NOT NULL,
  "event" VARCHAR(128) NOT NULL,
  "matcher" VARCHAR(512),
  "command" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "timeout_ms" INTEGER NOT NULL DEFAULT 10000,
  "create_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "update_time" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "agent_hooks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_user_account_key" ON "users"("user_account");

-- CreateIndex
CREATE INDEX "idx_users_username" ON "users"("username");

-- CreateIndex
CREATE INDEX "idx_apps_app_name" ON "apps"("app_name");

-- CreateIndex
CREATE INDEX "idx_apps_user_id" ON "apps"("user_id");

-- CreateIndex
CREATE INDEX "idx_apps_priority_create_time" ON "apps"("priority", "create_time");

-- CreateIndex
CREATE UNIQUE INDEX "agent_workspaces_current_session_id_key" ON "agent_workspaces"("current_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_workspaces_user_id_app_id_key" ON "agent_workspaces"("user_id", "app_id");

-- CreateIndex
CREATE INDEX "idx_agent_workspaces_app_id" ON "agent_workspaces"("app_id");

-- CreateIndex
CREATE INDEX "idx_agent_sessions_workspace_update_time" ON "agent_sessions"("workspace_id", "update_time");

-- CreateIndex
CREATE UNIQUE INDEX "agent_transcript_events_session_sequence_key" ON "agent_transcript_events"("session_id", "sequence");

-- CreateIndex
CREATE INDEX "idx_agent_transcript_events_session_create_time" ON "agent_transcript_events"("session_id", "create_time");

-- CreateIndex
CREATE INDEX "idx_agent_interactions_session_status" ON "agent_interactions"("session_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "agent_mcp_servers_workspace_name_key" ON "agent_mcp_servers"("workspace_id", "name");

-- CreateIndex
CREATE INDEX "idx_agent_mcp_servers_workspace_id" ON "agent_mcp_servers"("workspace_id");

-- CreateIndex
CREATE INDEX "idx_agent_hooks_workspace_event" ON "agent_hooks"("workspace_id", "event");

-- AddForeignKey
ALTER TABLE "apps" ADD CONSTRAINT "apps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_workspaces" ADD CONSTRAINT "agent_workspaces_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_workspaces" ADD CONSTRAINT "agent_workspaces_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_workspaces" ADD CONSTRAINT "agent_workspaces_current_session_id_fkey" FOREIGN KEY ("current_session_id") REFERENCES "agent_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "agent_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_transcript_events" ADD CONSTRAINT "agent_transcript_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "agent_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_interactions" ADD CONSTRAINT "agent_interactions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "agent_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_mcp_servers" ADD CONSTRAINT "agent_mcp_servers_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "agent_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_hooks" ADD CONSTRAINT "agent_hooks_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "agent_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
