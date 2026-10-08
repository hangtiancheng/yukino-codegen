import {
  AlertTriangle,
  Bot,
  Brain,
  Check,
  ChevronRight,
  Terminal,
  User,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "cn";
import { MarkdownRenderer, Spinner } from "@/shared/ui";
import type {
  AgentRuntimeStatus,
  AgentTranscriptEvent,
  JsonValue,
} from "../use-agent-transcript";

function asRecord(value: JsonValue): Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : {};
}

function readString(value: JsonValue, key: string): string | undefined {
  const field = asRecord(value)[key];
  return typeof field === "string" ? field : undefined;
}

function readNumber(value: JsonValue, key: string): number | undefined {
  const field = asRecord(value)[key];
  return typeof field === "number" ? field : undefined;
}

function readBoolean(value: JsonValue, key: string): boolean {
  return asRecord(value)[key] === true;
}

function AvatarBubble({
  role,
  children,
}: {
  readonly role: "user" | "assistant";
  readonly children: ReactNode;
}): ReactNode {
  const isUser = role === "user";
  return (
    <div className={cn("flex gap-2.5", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full shadow-sm",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-primary/12 text-primary ring-primary/15 ring-1",
        )}
      >
        {isUser ? (
          <User className="size-3.5" aria-hidden="true" />
        ) : (
          <Bot className="size-3.5" aria-hidden="true" />
        )}
      </div>
      <div
        className={cn(
          "max-w-[min(42rem,calc(100%-2.5rem))] min-w-0 rounded-xl px-3 py-2 text-sm leading-relaxed",
          isUser
            ? "bg-primary text-primary-foreground shadow-soft rounded-tr-sm"
            : "bg-muted/50 ring-border/60 text-foreground rounded-tl-sm ring-1",
        )}
      >
        {children}
      </div>
    </div>
  );
}

function ToolRow({
  toolName,
  detail,
  result,
}: {
  readonly toolName: string;
  readonly detail: string | undefined;
  readonly result: AgentTranscriptEvent | undefined;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const isError =
    result !== undefined && readBoolean(result.payload, "isError");
  const running = result === undefined;
  const output =
    result === undefined ? undefined : readString(result.payload, "output");
  const isBash = toolName === "Bash";
  return (
    <div className="border-border/60 bg-muted/25 hover:border-border rounded-lg border transition-colors">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left font-mono text-xs"
      >
        <ChevronRight
          className={cn(
            "size-3 shrink-0 transition-transform",
            open && "rotate-90",
          )}
          aria-hidden="true"
        />
        {isBash ? (
          <Terminal className="size-3 shrink-0" aria-hidden="true" />
        ) : (
          <Wrench className="size-3 shrink-0" aria-hidden="true" />
        )}
        <span className="text-foreground font-medium">{toolName}</span>
        {detail !== undefined && (
          <span className="text-muted-foreground truncate">{detail}</span>
        )}
        <span className="ml-auto shrink-0">
          {running ? (
            <Spinner
              className="text-muted-foreground size-3"
              aria-hidden="true"
            />
          ) : isError ? (
            <X className="text-destructive size-3" aria-hidden="true" />
          ) : (
            <Check className="text-primary size-3" aria-hidden="true" />
          )}
        </span>
      </button>
      {open && output !== undefined && output.length > 0 && (
        <pre className="border-border/60 text-muted-foreground max-h-64 overflow-auto border-t px-2.5 py-2 font-mono text-[11px] whitespace-pre-wrap">
          {output}
        </pre>
      )}
    </div>
  );
}

function ThinkingRow({ text }: { readonly text: string }): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <div className="text-muted-foreground">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1.5 text-xs italic"
      >
        <Brain className="size-3" aria-hidden="true" />
        <ChevronRight
          className={cn("size-3 transition-transform", open && "rotate-90")}
          aria-hidden="true"
        />
        Thinking
      </button>
      {open && (
        <p className="mt-1 pl-5 text-xs whitespace-pre-wrap italic opacity-80">
          {text}
        </p>
      )}
    </div>
  );
}

function SystemNote({
  tone = "muted",
  icon,
  children,
}: {
  readonly tone?: "muted" | "error";
  readonly icon?: ReactNode;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-1.5 text-xs",
        tone === "error" ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {icon}
      <span>{children}</span>
    </div>
  );
}

type RenderItem = {
  readonly kind: "node";
  readonly key: string;
  readonly node: ReactNode;
};

/** Pairs tool_use with its tool_result by toolId and drops noise events. */
function buildItems(events: ReadonlyArray<AgentTranscriptEvent>): RenderItem[] {
  const resultByToolId = new Map<string, AgentTranscriptEvent>();
  for (const event of events) {
    if (event.kind === "tool_result") {
      const toolId = readString(event.payload, "toolId");
      if (toolId !== undefined) resultByToolId.set(toolId, event);
    }
  }
  const items: RenderItem[] = [];
  for (const event of events) {
    const key = event.sequence;
    switch (event.kind) {
      case "user_message": {
        const text = readString(event.payload, "text") ?? "";
        items.push({
          kind: "node",
          key,
          node: (
            <AvatarBubble role="user">
              <p className="whitespace-pre-wrap">{text}</p>
            </AvatarBubble>
          ),
        });
        break;
      }
      case "assistant_message": {
        const text = readString(event.payload, "text") ?? "";
        if (text.trim().length === 0) break;
        items.push({
          kind: "node",
          key,
          node: (
            <AvatarBubble role="assistant">
              <MarkdownRenderer content={text} />
            </AvatarBubble>
          ),
        });
        break;
      }
      case "thinking": {
        const text = readString(event.payload, "thinking") ?? "";
        if (text.trim().length === 0) break;
        items.push({ kind: "node", key, node: <ThinkingRow text={text} /> });
        break;
      }
      case "tool_use": {
        const toolId = readString(event.payload, "toolId");
        items.push({
          kind: "node",
          key,
          node: (
            <ToolRow
              toolName={readString(event.payload, "toolName") ?? "tool"}
              detail={readString(event.payload, "detail")}
              result={
                toolId === undefined ? undefined : resultByToolId.get(toolId)
              }
            />
          ),
        });
        break;
      }
      case "compact":
        items.push({
          kind: "node",
          key,
          node: <SystemNote>Context compacted</SystemNote>,
        });
        break;
      case "retry":
        items.push({
          kind: "node",
          key,
          node: (
            <SystemNote>
              Retrying
              {(() => {
                const reason = readString(event.payload, "reason");
                return reason === undefined ? "" : `: ${reason}`;
              })()}
            </SystemNote>
          ),
        });
        break;
      case "error":
        items.push({
          kind: "node",
          key,
          node: (
            <SystemNote
              tone="error"
              icon={<AlertTriangle className="size-3" aria-hidden="true" />}
            >
              {readString(event.payload, "message") ?? "Agent error"}
            </SystemNote>
          ),
        });
        break;
      default:
        break;
    }
  }
  return items;
}

export type AgentTranscriptViewProps = {
  readonly events: ReadonlyArray<AgentTranscriptEvent>;
  readonly streamingText: string;
  readonly thinkingText: string;
  readonly runtimeStatus: AgentRuntimeStatus;
  readonly replaying: boolean;
};

export function AgentTranscriptView({
  events,
  streamingText,
  thinkingText,
  runtimeStatus,
  replaying,
}: AgentTranscriptViewProps): ReactNode {
  const scrollRef = useRef<HTMLDivElement>(null);
  const items = useMemo(() => buildItems(events), [events]);
  const usage = useMemo(() => {
    let input = 0;
    let output = 0;
    for (const event of events) {
      if (event.kind !== "usage") continue;
      input += readNumber(event.payload, "inputTokens") ?? 0;
      output += readNumber(event.payload, "outputTokens") ?? 0;
    }
    return { input, output };
  }, [events]);

  useEffect(() => {
    const node = scrollRef.current;
    if (node === null) return;
    node.scrollTop = node.scrollHeight;
  }, [items.length, streamingText, thinkingText, runtimeStatus]);

  const running = runtimeStatus === "running" || runtimeStatus === "waiting";
  const empty = items.length === 0 && streamingText.length === 0;

  return (
    <div
      ref={scrollRef}
      className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3.5 py-3.5"
    >
      {empty && !running ? (
        <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 text-center text-sm">
          <Bot className="size-8 opacity-40" aria-hidden="true" />
          <p>
            {replaying
              ? "Loading conversation…"
              : "Ask the agent to build or change your app."}
          </p>
        </div>
      ) : null}
      {items.map((item) => (
        <div key={item.key}>{item.node}</div>
      ))}
      {thinkingText.length > 0 && running ? (
        <ThinkingRow text={thinkingText} />
      ) : null}
      {streamingText.length > 0 ? (
        <AvatarBubble role="assistant">
          <MarkdownRenderer content={streamingText} />
        </AvatarBubble>
      ) : null}
      {running && streamingText.length === 0 && thinkingText.length === 0 ? (
        <SystemNote icon={<Spinner className="size-3" aria-hidden="true" />}>
          {runtimeStatus === "waiting"
            ? "Waiting for your response…"
            : "Working…"}
        </SystemNote>
      ) : null}
      {usage.input + usage.output > 0 ? (
        <p className="text-muted-foreground/70 text-center text-[11px]">
          {usage.input.toLocaleString()} in · {usage.output.toLocaleString()}{" "}
          out tokens
        </p>
      ) : null}
    </div>
  );
}
