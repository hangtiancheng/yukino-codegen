-- AlterTable: agent workspace runtime settings (Remote parity: thinking level picker + sandbox auto-allow)
ALTER TABLE "agent_workspaces" ADD COLUMN "thinking_level" VARCHAR(32);
ALTER TABLE "agent_workspaces" ADD COLUMN "sandbox_auto_allow" BOOLEAN NOT NULL DEFAULT false;
