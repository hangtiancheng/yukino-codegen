import { randomUUID } from "node:crypto";
import type { NodeWebSocket } from "@hono/node-ws";
import type { Hono } from "hono";
import {
  type AgentClientMessage,
  type AgentConnection,
  type AgentServerMessage,
  agentClientMessageSchema,
  type PermissionDecision,
  type RuntimeManager,
} from "../agent-runtime/index.js";
import type { AppService } from "../app-module/index.js";
import { env } from "../config/index.js";
import type { AppHonoEnv } from "../session/index.js";
import { resolveAppAccess } from "./agent-shared.js";

export type AgentWsDeps = Readonly<{
  upgradeWebSocket: NodeWebSocket["upgradeWebSocket"];
  manager: RuntimeManager;
  appService: AppService;
}>;

const bigintReplacer = (_key: string, value: unknown): unknown =>
  typeof value === "bigint" ? value.toString() : value;

const serialize = (message: AgentServerMessage): string => JSON.stringify(message, bigintReplacer);

const byteLength = (data: unknown): number => {
  if (typeof data === "string") return Buffer.byteLength(data);
  if (data instanceof ArrayBuffer) return data.byteLength;
  if (ArrayBuffer.isView(data)) return data.byteLength;
  return 0;
};

const toText = (data: unknown): string => {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
  }
  return "";
};

/**
 * Registers `GET /app/:appId/agent/ws`. Auth is cookie-session based (session
 * middleware runs upstream); owners/admins may drive the agent, other logged-in
 * users attach read-only. Run/command/abort work is dispatched fire-and-forget
 * so the same socket can still deliver permission and question responses while a
 * turn is in flight.
 */
export const registerAgentWs = (router: Hono<AppHonoEnv>, deps: AgentWsDeps): void => {
  router.get(
    "/:appId/agent/ws",
    deps.upgradeWebSocket(async (c) => {
      let access: Awaited<ReturnType<typeof resolveAppAccess>>;
      try {
        access = await resolveAppAccess(c, deps.appService);
      } catch {
        return { onOpen: (_event, ws) => ws.close(1008, "unauthorized") };
      }
      const runtime = await deps.manager.getOrCreate(access.ownerId, access.appId);
      let connection: AgentConnection | undefined;

      const dispatch = async (message: AgentClientMessage): Promise<void> => {
        if (connection === undefined) return;
        const writable = !connection.readOnly;
        switch (message.type) {
          case "hello": {
            const after = message.afterSequence === undefined ? 0n : BigInt(message.afterSequence);
            await runtime.sendBacklog(connection, after);
            return;
          }
          case "run": {
            if (!writable) {
              connection.send({
                code: "read_only",
                message: "Read-only connection cannot run the agent",
                recoverable: false,
                requestId: message.requestId,
                type: "error",
              });
              return;
            }
            const task = message.input.trimStart().startsWith("/")
              ? runtime.handleCommand(message.input, message.requestId)
              : runtime.runTurn({
                  input: message.input,
                  requestId: message.requestId,
                  turnId: randomUUID(),
                  ...(message.selectedElement !== undefined && {
                    selectedElement: message.selectedElement,
                  }),
                  ...(message.previewError !== undefined && { previewError: message.previewError }),
                });
            void task.catch((error: unknown) => {
              connection?.send({
                code: "run_failed",
                message: error instanceof Error ? error.message : "run failed",
                recoverable: true,
                requestId: message.requestId,
                type: "error",
              });
            });
            return;
          }
          case "abort": {
            if (writable) runtime.abort();
            return;
          }
          case "permission_response": {
            if (!writable) {
              connection.send({
                code: "read_only",
                message: "Read-only connection cannot answer permission requests",
                recoverable: true,
                requestId: message.requestId,
                type: "error",
              });
              return;
            }
            const decision: PermissionDecision =
              message.decision === "allow" && message.remember === true
                ? "allowAlways"
                : message.decision;
            try {
              const resolved = await runtime.resolvePermission(message.interactionId, decision);
              if (!resolved) {
                connection.send({
                  code: "interaction_not_pending",
                  message: "Permission request is no longer pending",
                  recoverable: true,
                  requestId: message.requestId,
                  type: "error",
                });
              }
            } catch (error) {
              connection.send({
                code: "interaction_response_failed",
                message: error instanceof Error ? error.message : "Permission response failed",
                recoverable: true,
                requestId: message.requestId,
                type: "error",
              });
            }
            return;
          }
          case "question_response": {
            if (!writable) {
              connection.send({
                code: "read_only",
                message: "Read-only connection cannot answer questions",
                recoverable: true,
                requestId: message.requestId,
                type: "error",
              });
              return;
            }
            try {
              const resolved = await runtime.resolveQuestion(
                message.interactionId,
                message.answers,
              );
              if (!resolved) {
                connection.send({
                  code: "interaction_not_pending",
                  message: "Question request is no longer pending",
                  recoverable: true,
                  requestId: message.requestId,
                  type: "error",
                });
              }
            } catch (error) {
              connection.send({
                code: "interaction_response_failed",
                message: error instanceof Error ? error.message : "Question response failed",
                recoverable: true,
                requestId: message.requestId,
                type: "error",
              });
            }
            return;
          }
          case "command_complete":
            runtime.touch();
            return;
          case "runtime_action":
            connection.send({
              command: `runtime:${message.action}`,
              error: "Preview runtime is controlled by the client, not the server",
              requestId: message.requestId,
              supported: false,
              type: "command_result",
            });
            return;
          case "heartbeat":
            runtime.touch();
            connection.send({
              timestamp: message.timestamp,
              type: "heartbeat_ack",
              ...(message.requestId !== undefined && { requestId: message.requestId }),
            });
            return;
          default:
            return;
        }
      };

      return {
        onOpen: async (_event, ws) => {
          connection = {
            close: (code, reason) => ws.close(code, reason),
            id: randomUUID(),
            readOnly: !access.writable,
            send: (message) => ws.send(serialize(message)),
            userId: BigInt(access.user.id),
          };
          runtime.addConnection(connection);
          try {
            await runtime.ready(connection);
            connection.send({
              candidates: runtime.getCommandCandidates().map((candidate) => ({
                ...candidate,
                aliases: [...candidate.aliases],
              })),
              type: "candidates",
            });
          } catch (error) {
            connection.send({
              code: "init_failed",
              message: error instanceof Error ? error.message : "initialization failed",
              recoverable: true,
              type: "error",
            });
          }
        },
        onMessage: async (event) => {
          if (connection === undefined) return;
          if (byteLength(event.data) > env.AGENT_WS_MAX_MESSAGE_BYTES) {
            connection.send({
              code: "message_too_large",
              message: "Message exceeds the size limit",
              recoverable: true,
              type: "error",
            });
            return;
          }
          let parsed: unknown;
          try {
            parsed = JSON.parse(toText(event.data));
          } catch {
            connection.send({
              code: "bad_json",
              message: "Message is not valid JSON",
              recoverable: true,
              type: "error",
            });
            return;
          }
          const result = agentClientMessageSchema.safeParse(parsed);
          if (!result.success) {
            connection.send({
              code: "bad_message",
              message: "Message failed schema validation",
              recoverable: true,
              type: "error",
            });
            return;
          }
          await dispatch(result.data);
        },
        onClose: () => {
          if (connection !== undefined) runtime.removeConnection(connection);
        },
        onError: () => {
          if (connection !== undefined) runtime.removeConnection(connection);
        },
      };
    }),
  );
};
