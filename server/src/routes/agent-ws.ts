import { randomUUID } from "node:crypto";
import type { NodeWebSocket } from "@hono/node-ws";
import type { Hono } from "hono";
import type { WebSocket as RawWebSocket } from "ws";
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

/** Server-side heartbeat (RemoteServer.startHeartbeat parity). */
const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_STALE_MS = 75_000;

/**
 * Image uploads carry base64 payloads far larger than the normal frame cap
 * (`AGENT_WS_MAX_MESSAGE_BYTES`). Give them a dedicated ceiling matching the
 * protocol's 64 MiB base64 limit plus JSON envelope overhead, which stays under
 * the `ws` transport's 100 MiB `maxPayload`. `handleImageUpload` enforces the
 * real decoded-byte limit and always answers with image_saved/image_error keyed
 * by clientId, so the composer's upload chip can never get stuck.
 */
const IMAGE_UPLOAD_MAX_FRAME_BYTES = 64 * 1024 * 1024 + 64 * 1024;

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
 * Ping/sweep loop for half-open connections: with many users a browser tab
 * killed without a close frame would otherwise stay registered forever,
 * receiving broadcasts into a dead socket. One sweep serves every workspace.
 */
const createHeartbeatSweep = () => {
  const lastPongAt = new Map<RawWebSocket, number>();
  let timer: NodeJS.Timeout | undefined;

  const sweep = (): void => {
    const now = Date.now();
    for (const [socket, lastPong] of [...lastPongAt.entries()]) {
      if (now - lastPong > HEARTBEAT_STALE_MS) {
        lastPongAt.delete(socket);
        try {
          socket.terminate();
        } catch {}
        continue;
      }
      try {
        socket.ping();
      } catch {}
    }
    if (lastPongAt.size === 0 && timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };

  return {
    forget: (socket: RawWebSocket): void => {
      lastPongAt.delete(socket);
    },
    track: (socket: RawWebSocket): void => {
      lastPongAt.set(socket, Date.now());
      socket.on("pong", () => {
        lastPongAt.set(socket, Date.now());
      });
      if (timer === undefined) {
        timer = setInterval(sweep, HEARTBEAT_INTERVAL_MS);
        timer.unref?.();
      }
    },
  };
};

export const registerAgentWs = (router: Hono<AppHonoEnv>, deps: AgentWsDeps): void => {
  const heartbeat = createHeartbeatSweep();

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
            // The runtime decides between steering the in-flight loop and
            // running a fresh turn (slash commands route internally).
            void runtime
              .submit({
                actorUserId: String(access.user.id),
                input: message.input,
                requestId: message.requestId,
                turnId: randomUUID(),
                ...(message.selectedElement !== undefined && {
                  selectedElement: message.selectedElement,
                }),
                ...(message.previewError !== undefined && { previewError: message.previewError }),
              })
              .catch((error: unknown) => {
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
          case "background_shells": {
            if (!writable) {
              connection.send({
                code: "read_only",
                message: "Read-only connection cannot background shells",
                recoverable: true,
                requestId: message.requestId,
                type: "error",
              });
              return;
            }
            const backgrounded = runtime.backgroundForegroundShells();
            connection.send({
              command: "background_shells",
              requestId: message.requestId,
              result: { backgrounded },
              supported: true,
              type: "command_result",
            });
            return;
          }
          case "plan_approval_response": {
            if (!writable) {
              connection.send({
                code: "read_only",
                message: "Read-only connection cannot approve plans",
                recoverable: true,
                type: "error",
                ...(message.requestId !== undefined && { requestId: message.requestId }),
              });
              return;
            }
            await runtime.handlePlanApprovalResponse(message.choice, message.feedback);
            return;
          }
          case "rewind_action": {
            if (!writable) {
              connection.send({
                code: "read_only",
                message: "Read-only connection cannot rewind",
                recoverable: true,
                type: "error",
                ...(message.requestId !== undefined && { requestId: message.requestId }),
              });
              return;
            }
            void runtime
              .handleRewindAction(message.sha, message.action, message.requestId ?? randomUUID())
              .catch((error: unknown) => {
                connection?.send({
                  code: "rewind_failed",
                  message: error instanceof Error ? error.message : "rewind failed",
                  recoverable: true,
                  type: "error",
                });
              });
            return;
          }
          case "file_complete_request": {
            const reply = connection;
            runtime.sendFileCompletions(
              (outbound) => reply.send(outbound),
              message.requestId,
              message.query,
            );
            return;
          }
          case "image_upload": {
            if (!writable) {
              connection.send({
                clientId: message.clientId,
                message: "Read-only connection cannot upload images",
                type: "image_error",
              });
              return;
            }
            await runtime.handleImageUpload(
              {
                clientId: message.clientId,
                dataBase64: message.dataBase64,
                name: message.name,
              },
              (outbound) => connection?.send(outbound),
            );
            return;
          }
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
          const rawSocket = ws.raw;
          connection = {
            close: (code, reason) => ws.close(code, reason),
            id: randomUUID(),
            readOnly: !access.writable,
            send: (message) => ws.send(serialize(message)),
            userId: BigInt(access.user.id),
          };
          // Multi-user guard: cap simultaneous watchers per workspace so one
          // app page cannot exhaust the server's socket budget.
          if (!runtime.addConnection(connection)) {
            connection = undefined;
            ws.close(1013, "too many connections for this workspace");
            return;
          }
          if (rawSocket !== undefined) heartbeat.track(rawSocket);
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
          const size = byteLength(event.data);
          // Reject absurd frames before parsing (DoS guard). Image uploads get a
          // larger ceiling; every other message must fit the normal cap, checked
          // again below once the type is known.
          if (size > IMAGE_UPLOAD_MAX_FRAME_BYTES) {
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
          // Non-image frames respect the normal size cap; image_upload frames are
          // bounded by IMAGE_UPLOAD_MAX_FRAME_BYTES and validated on decode.
          if (result.data.type !== "image_upload" && size > env.AGENT_WS_MAX_MESSAGE_BYTES) {
            connection.send({
              code: "message_too_large",
              message: "Message exceeds the size limit",
              recoverable: true,
              type: "error",
            });
            return;
          }
          await dispatch(result.data);
        },
        onClose: (_event, ws) => {
          if (ws.raw !== undefined) heartbeat.forget(ws.raw);
          if (connection !== undefined) runtime.removeConnection(connection);
        },
        onError: (_event, ws) => {
          if (ws.raw !== undefined) heartbeat.forget(ws.raw);
          if (connection !== undefined) runtime.removeConnection(connection);
        },
      };
    }),
  );
};
