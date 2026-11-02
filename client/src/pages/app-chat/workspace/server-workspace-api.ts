import { z } from "zod";
import { getApiBaseUrl } from "@/shared/config";
import { httpClient } from "@/shared/api/http-client-singleton";
import type { AppId } from "@/shared/schemas";
import type { TerminalHandle, TerminalSurface } from "./workspace-types";

const previewStateSchema = z.object({
  status: z.enum(["idle", "installing", "building", "ready", "failed"]),
  logs: z.string(),
  revision: z.number(),
  error: z.string().optional(),
  url: z.string().url().optional(),
});
export type ServerPreviewState = z.infer<typeof previewStateSchema>;

export function fetchPreviewState(
  appId: AppId,
  build = false,
  signal?: AbortSignal,
) {
  return httpClient.request(
    {
      method: build ? "POST" : "GET",
      url: `app/${appId}/workspace/preview`,
      ...(signal === undefined ? {} : { signal }),
    },
    previewStateSchema,
  );
}

const terminalMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ready") }),
  z.object({ type: z.literal("output"), data: z.string() }),
  z.object({ type: z.literal("error"), message: z.string() }),
  z.object({ type: z.literal("exit"), code: z.number() }),
]);

export function connectTerminal(
  appId: AppId,
  surface: TerminalSurface,
): TerminalHandle {
  const url = new URL(
    `${getApiBaseUrl().replace(/\/$/, "")}/app/${appId}/workspace/terminal`,
  );
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(url);
  let ready = false;
  let disposed = false;
  let dimensions = { cols: surface.cols, rows: surface.rows };
  const send = (message: object): void => {
    if (!disposed && socket.readyState === WebSocket.OPEN)
      socket.send(JSON.stringify(message));
  };
  socket.onmessage = (event: MessageEvent<unknown>) => {
    if (disposed || typeof event.data !== "string") return;
    let value: unknown;
    try {
      value = JSON.parse(event.data);
    } catch {
      return;
    }
    const parsed = terminalMessage.safeParse(value);
    if (!parsed.success) return;
    switch (parsed.data.type) {
      case "ready":
        ready = true;
        send({ type: "resize", ...dimensions });
        surface.onReady?.();
        break;
      case "output":
        surface.onOutput(parsed.data.data);
        break;
      case "error":
        surface.onOutput(`\r\n${parsed.data.message}\r\n`);
        break;
      case "exit":
        surface.onOutput(`\r\n[Process exited: ${parsed.data.code}]\r\n`);
        break;
    }
  };
  socket.onerror = () => {
    if (!disposed) surface.onOutput("\r\nTerminal connection failed.\r\n");
  };
  socket.onclose = () => {
    if (!disposed) surface.onOutput("\r\n[Terminal disconnected]\r\n");
  };
  return {
    write: (data) => {
      if (ready) send({ type: "input", data });
    },
    resize: (cols, rows) => {
      dimensions = { cols, rows };
      if (ready) send({ type: "resize", ...dimensions });
    },
    dispose: () => {
      disposed = true;
      socket.close();
    },
  };
}
