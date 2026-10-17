import { CornerDownLeft, ImagePlus, Send, Square, X } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button, TextArea } from "@/shared/ui";
import type {
  AgentCommandCandidate,
  AgentImageResult,
} from "../use-agent-transcript";

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
  /** Remote parity extras */
  readonly history: ReadonlyArray<string>;
  readonly steering: ReadonlyArray<string>;
  readonly followUps: ReadonlyArray<string>;
  readonly fileMatches:
    | { readonly requestId: string; readonly matches: ReadonlyArray<string> }
    | undefined;
  readonly imageResults: ReadonlyArray<AgentImageResult>;
  readonly onRequestFileCompletions: (requestId: string, query: string) => void;
  readonly onUploadImage: (
    clientId: string,
    name: string,
    dataBase64: string,
  ) => boolean;
  readonly onConsumeImageResult: (clientId: string) => void;
};

const FILE_COMPLETE_DEBOUNCE_MS = 150;
/** Mirrors the server's decoded-byte ceiling; reject before sending so the
 * upload chip never waits on a frame the socket would refuse. */
const MAX_UPLOAD_IMAGE_BYTES = 32 * 1024 * 1024;
let uploadCounter = 0;

function nextUploadId(): string {
  uploadCounter += 1;
  return `img_${Date.now().toString(36)}_${String(uploadCounter)}`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Read failed"));
    reader.readAsDataURL(file);
  });
}

/** The `@token` immediately before the caret, or null. */
function atQueryBefore(value: string, caret: number): string | null {
  if (value.startsWith("/") || value.trimStart().startsWith("!")) return null;
  const before = value.slice(0, caret);
  const match = /(?:^|\s)@([^\s]*)$/u.exec(before);
  return match === null ? null : (match[1] ?? "");
}

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
  history,
  steering,
  followUps,
  fileMatches,
  imageResults,
  onRequestFileCompletions,
  onUploadImage,
  onConsumeImageResult,
}: AgentComposerProps): ReactNode {
  const matches = useSlashMatches(value, candidates);
  const [highlight, setHighlight] = useState(0);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [historyDraft, setHistoryDraft] = useState<string | null>(null);
  const [atCursor, setAtCursor] = useState(0);
  const [atRequestId, setAtRequestId] = useState<string | null>(null);
  const [caret, setCaret] = useState(0);
  const [uploads, setUploads] = useState<
    ReadonlyArray<{ clientId: string; name: string }>
  >([]);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const atDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const slashOpen = matches.length > 0;
  const atQuery = useMemo(() => {
    if (slashOpen) return null;
    return atQueryBefore(value, caret);
  }, [slashOpen, value, caret]);
  const atOpen = atQuery !== null && atRequestId !== null;
  const atMatches = useMemo(() => {
    if (fileMatches === undefined || fileMatches.requestId !== atRequestId) {
      return [];
    }
    return fileMatches.matches.slice(0, 8);
  }, [fileMatches, atRequestId]);
  const canSend = connected && !readOnly && value.trim().length > 0;

  const acceptCandidate = (candidate: AgentCommandCandidate): void => {
    onChange(`/${candidate.name} `);
    textAreaRef.current?.focus();
  };

  // @-mention completion: debounce the token before the caret.
  useEffect(() => {
    if (atQuery === null) {
      setAtRequestId(null);
      setAtCursor(0);
      return;
    }
    if (atDebounceRef.current !== undefined)
      clearTimeout(atDebounceRef.current);
    atDebounceRef.current = setTimeout(() => {
      const requestId = `at_${Date.now().toString(36)}_${Math.round(Math.random() * 1e6)}`;
      setAtRequestId(requestId);
      setAtCursor(0);
      onRequestFileCompletions(requestId, atQuery);
    }, FILE_COMPLETE_DEBOUNCE_MS);
    return () => {
      if (atDebounceRef.current !== undefined)
        clearTimeout(atDebounceRef.current);
    };
  }, [atQuery, onRequestFileCompletions]);

  // Image upload results: insert @path or surface the error, then consume.
  const valueRef = useRef(value);
  valueRef.current = value;
  useEffect(() => {
    // Accumulate insertions in a local: when several results land in the same
    // render batch (e.g. pasting two images at once), re-reading the stale
    // valueRef.current per iteration would make each onChange overwrite the
    // previous one, silently dropping all but the last @path.
    let next = valueRef.current;
    let changed = false;
    for (const result of imageResults) {
      if (result.path !== undefined) {
        const separator = next.length === 0 || next.endsWith(" ") ? "" : " ";
        next = `${next}${separator}@${result.path} `;
        changed = true;
      } else {
        toast.error(result.message ?? "Image upload failed");
      }
      setUploads((uploads) =>
        uploads.filter((upload) => upload.clientId !== result.clientId),
      );
      onConsumeImageResult(result.clientId);
    }
    if (changed) onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageResults]);

  const uploadFile = async (file: File): Promise<void> => {
    if (!file.type.startsWith("image/")) {
      toast.error("Only image files can be attached");
      return;
    }
    if (file.size > MAX_UPLOAD_IMAGE_BYTES) {
      toast.error(
        `Image is too large (${Math.round(file.size / 1024 / 1024)}MB, limit 32MB)`,
      );
      return;
    }
    const clientId = nextUploadId();
    setUploads((current) => [...current, { clientId, name: file.name }]);
    try {
      const base64 = await fileToBase64(file);
      if (!onUploadImage(clientId, file.name, base64)) {
        setUploads((current) =>
          current.filter((upload) => upload.clientId !== clientId),
        );
        toast.error("Unable to upload the image (not connected)");
      }
    } catch (cause) {
      setUploads((current) =>
        current.filter((upload) => upload.clientId !== clientId),
      );
      toast.error(cause instanceof Error ? cause.message : "Upload failed");
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>): void => {
    const files = [...event.clipboardData.files].filter((file) =>
      file.type.startsWith("image/"),
    );
    if (files.length === 0 || readOnly) return;
    event.preventDefault();
    for (const file of files) void uploadFile(file);
  };

  const insertAtMatch = (match: string): void => {
    const textarea = textAreaRef.current;
    const caret = textarea?.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const atIndex = before.lastIndexOf("@");
    if (atIndex === -1) return;
    const next = `${value.slice(0, atIndex)}@${match} ${value.slice(caret)}`;
    onChange(next);
    setAtRequestId(null);
    setAtCursor(0);
    textarea?.focus();
  };

  const navigateHistory = (direction: 1 | -1): void => {
    if (history.length === 0) return;
    if (historyIndex === -1) {
      if (direction === -1) {
        setHistoryDraft(value);
        setHistoryIndex(history.length - 1);
        const entry = history[history.length - 1];
        if (entry !== undefined) onChange(entry);
      }
      return;
    }
    const nextIndex = historyIndex + direction;
    if (nextIndex < 0) {
      setHistoryIndex(0);
      const entry = history[0];
      if (entry !== undefined) onChange(entry);
      return;
    }
    if (nextIndex >= history.length) {
      setHistoryIndex(-1);
      onChange(historyDraft ?? "");
      setHistoryDraft(null);
      return;
    }
    setHistoryIndex(nextIndex);
    const entry = history[nextIndex];
    if (entry !== undefined) onChange(entry);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (slashOpen) {
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
      if (event.key === "Escape") {
        event.preventDefault();
        onChange(`${value} `);
        return;
      }
    }
    if (atOpen && atMatches.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setAtCursor((index) => (index + 1) % atMatches.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setAtCursor(
          (index) => (index - 1 + atMatches.length) % atMatches.length,
        );
        return;
      }
      if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) {
        const match = atMatches[Math.min(atCursor, atMatches.length - 1)];
        if (match !== undefined) {
          event.preventDefault();
          insertAtMatch(match);
          return;
        }
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setAtRequestId(null);
        return;
      }
    }
    if (
      !slashOpen &&
      !atOpen &&
      event.key === "ArrowUp" &&
      !event.shiftKey &&
      (textAreaRef.current?.selectionStart ?? 0) === 0
    ) {
      event.preventDefault();
      navigateHistory(-1);
      return;
    }
    if (
      !slashOpen &&
      !atOpen &&
      event.key === "ArrowDown" &&
      !event.shiftKey &&
      historyIndex !== -1
    ) {
      event.preventDefault();
      navigateHistory(1);
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (canSend) {
        onSend();
        setHistoryIndex(-1);
        setHistoryDraft(null);
      }
    }
  };

  return (
    <section className="border-border/80 bg-background focus-within:border-primary/40 focus-within:shadow-glow relative rounded-xl border p-2.5 shadow-sm transition-[border-color,box-shadow]">
      {slashOpen ? (
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

      {atOpen && atMatches.length > 0 ? (
        <div className="border-border bg-popover shadow-pop absolute bottom-full left-2.5 mb-2 max-h-64 w-[min(28rem,calc(100%-1.25rem))] overflow-auto rounded-xl border p-1">
          {atMatches.map((match, index) => (
            <button
              key={match}
              type="button"
              onMouseEnter={() => setAtCursor(index)}
              onClick={() => insertAtMatch(match)}
              className={cn(
                "block w-full truncate rounded-lg px-2.5 py-1.5 text-left font-mono text-xs",
                index === atCursor ? "bg-accent" : "hover:bg-accent/50",
              )}
            >
              {match}
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

      {steering.length > 0 || followUps.length > 0 || uploads.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {steering.map((text) => (
            <span
              key={`steer-${text}`}
              className="bg-primary/10 text-primary max-w-56 truncate rounded-full px-2 py-0.5 text-[11px]"
              title={text}
            >
              steering: {text}
            </span>
          ))}
          {followUps.map((text) => (
            <span
              key={`follow-${text}`}
              className="bg-muted text-muted-foreground max-w-56 truncate rounded-full px-2 py-0.5 text-[11px]"
              title={text}
            >
              queued: {text}
            </span>
          ))}
          {uploads.map((upload) => (
            <span
              key={upload.clientId}
              className="bg-muted text-muted-foreground max-w-56 truncate rounded-full px-2 py-0.5 text-[11px]"
            >
              uploading {upload.name}…
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex items-end gap-2.5">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file !== undefined) void uploadFile(file);
            event.target.value = "";
          }}
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          disabled={readOnly || !connected}
          aria-label="Attach an image"
          title="Attach an image (or paste)"
        >
          <ImagePlus className="size-4" aria-hidden="true" />
        </Button>
        <TextArea
          ref={textAreaRef}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setCaret(event.target.selectionStart);
            setHighlight(0);
            setHistoryIndex(-1);
            setHistoryDraft(null);
          }}
          onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
          onKeyUp={(event) => setCaret(event.currentTarget.selectionStart)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={
            readOnly
              ? "Read-only: you can watch but not run the agent."
              : running
                ? "Send a steering message for the running turn…"
                : "Ask for a change, or type / for commands…"
          }
          aria-label="Agent message"
          disabled={readOnly || !connected}
          rows={2}
          className="min-h-15 resize-none border-0 bg-transparent px-1 py-1.5 focus-visible:border-0 focus-visible:ring-0"
        />
        {running ? (
          <div className="flex items-end gap-1.5 self-end">
            <Button
              variant="secondary"
              className="rounded-full px-3.5"
              disabled={!canSend}
              onClick={onSend}
              title="Steer the running turn"
            >
              <CornerDownLeft className="size-4" aria-hidden="true" />
              Steer
            </Button>
            <Button
              variant="destructive"
              className="rounded-full px-3.5"
              onClick={onAbort}
            >
              <Square className="size-4" aria-hidden="true" />
              Stop
            </Button>
          </div>
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
