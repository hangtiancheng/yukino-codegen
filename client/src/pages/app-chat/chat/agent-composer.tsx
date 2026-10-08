import { Send, Square, X } from "lucide-react";
import {
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "cn";
import { Button, TextArea } from "@/shared/ui";
import type { AgentCommandCandidate } from "../use-agent-transcript";

export type AgentComposerProps = {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSend: () => void;
  readonly onAbort: () => void;
  readonly candidates: ReadonlyArray<AgentCommandCandidate>;
  readonly running: boolean;
  readonly readOnly: boolean;
  readonly connected: boolean;
  readonly selectedElementLabel: string | undefined;
  readonly onClearSelectedElement: () => void;
};

function useSlashMatches(
  value: string,
  candidates: ReadonlyArray<AgentCommandCandidate>,
): ReadonlyArray<AgentCommandCandidate> {
  return useMemo(() => {
    if (!value.startsWith("/")) return [];
    const token = value.slice(1);
    if (token.includes(" ") || token.includes("\n")) return [];
    const query = token.toLowerCase();
    return candidates
      .filter(
        (candidate) =>
          candidate.name.toLowerCase().startsWith(query) ||
          candidate.aliases.some((alias) =>
            alias.toLowerCase().startsWith(query),
          ),
      )
      .slice(0, 8);
  }, [value, candidates]);
}

export function AgentComposer({
  value,
  onChange,
  onSend,
  onAbort,
  candidates,
  running,
  readOnly,
  connected,
  selectedElementLabel,
  onClearSelectedElement,
}: AgentComposerProps): ReactNode {
  const matches = useSlashMatches(value, candidates);
  const [highlight, setHighlight] = useState(0);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const menuOpen = matches.length > 0;
  const canSend = connected && !readOnly && !running && value.trim().length > 0;

  const acceptCandidate = (candidate: AgentCommandCandidate): void => {
    onChange(`/${candidate.name} `);
    textAreaRef.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (menuOpen) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlight((index) => (index + 1) % matches.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlight((index) => (index - 1 + matches.length) % matches.length);
        return;
      }
      if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) {
        const candidate = matches[Math.min(highlight, matches.length - 1)];
        if (candidate !== undefined) {
          event.preventDefault();
          acceptCandidate(candidate);
          setHighlight(0);
          return;
        }
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (canSend) onSend();
    }
  };

  return (
    <section className="border-border/80 bg-background focus-within:border-primary/40 focus-within:shadow-glow relative rounded-xl border p-2.5 shadow-sm transition-[border-color,box-shadow]">
      {menuOpen ? (
        <div className="border-border bg-popover shadow-pop absolute bottom-full left-2.5 mb-2 max-h-72 w-[min(28rem,calc(100%-1.25rem))] overflow-auto rounded-xl border p-1">
          {matches.map((candidate, index) => (
            <button
              key={candidate.name}
              type="button"
              onMouseEnter={() => setHighlight(index)}
              onClick={() => {
                acceptCandidate(candidate);
                setHighlight(0);
              }}
              className={cn(
                "flex w-full flex-col gap-0.5 rounded-lg px-2.5 py-1.5 text-left",
                index === highlight ? "bg-accent" : "hover:bg-accent/50",
              )}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                /{candidate.name}
                <span className="text-muted-foreground/70 text-[10px] font-normal uppercase">
                  {candidate.type}
                </span>
              </span>
              {candidate.description.length > 0 && (
                <span className="text-muted-foreground truncate text-xs">
                  {candidate.description}
                </span>
              )}
            </button>
          ))}
        </div>
      ) : null}

      {selectedElementLabel !== undefined ? (
        <div className="bg-primary/10 text-primary mb-2 flex items-center gap-2 rounded-lg px-2.5 py-1 text-xs">
          <span className="truncate">
            Element attached: {selectedElementLabel}
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onClearSelectedElement}
            className="hover:text-primary/70 ml-auto hover:bg-transparent"
            aria-label="Clear selected element"
          >
            <X />
          </Button>
        </div>
      ) : null}

      <div className="flex gap-2.5">
        <TextArea
          ref={textAreaRef}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setHighlight(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder={
            readOnly
              ? "Read-only: you can watch but not run the agent."
              : "Ask for a change, or type / for commands…"
          }
          aria-label="Agent message"
          disabled={readOnly || !connected}
          rows={2}
          className="min-h-15 resize-none border-0 bg-transparent px-1 py-1.5 focus-visible:border-0 focus-visible:ring-0"
        />
        {running ? (
          <Button
            variant="destructive"
            className="self-end rounded-full px-3.5"
            onClick={onAbort}
          >
            <Square className="size-4" aria-hidden="true" />
            Stop
          </Button>
        ) : (
          <Button
            className="self-end rounded-full px-4"
            disabled={!canSend}
            onClick={onSend}
          >
            <Send className="size-4" aria-hidden="true" />
            Send
          </Button>
        )}
      </div>
    </section>
  );
}
