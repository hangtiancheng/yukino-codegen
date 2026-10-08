import { ArrowUp, Sparkles } from "lucide-react";
import { type KeyboardEvent, type ReactNode } from "react";
import { cn } from "cn";
import { LoadingButton } from "@/shared/ui";
import { quickPrompts } from "./quick-prompts";

const MAX_LENGTH = 3000;

export type PromptComposerProps = {
  readonly prompt: string;
  readonly submitting: boolean;
  readonly onPromptChange: (value: string) => void;
  readonly onSubmit: () => void;
};

export function PromptComposer({
  prompt,
  submitting,
  onPromptChange,
  onSubmit,
}: PromptComposerProps): ReactNode {
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!submitting) onSubmit();
    }
  };

  return (
    <section className="mx-auto w-full">
      <div
        className={cn(
          "border-border/80 bg-card shadow-card focus-within:border-primary/40 focus-within:shadow-glow rounded-2xl border transition-[border-color,box-shadow] duration-200",
        )}
      >
        <textarea
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe the app you want to generate…"
          rows={5}
          maxLength={MAX_LENGTH}
          className="placeholder:text-muted-foreground/70 w-full resize-none bg-transparent px-4 pt-3.5 text-[15px] leading-relaxed outline-none"
          aria-label="App description"
        />
        <div className="flex items-center justify-between gap-3 px-3 pb-3">
          <p className="text-muted-foreground/70 px-1 text-[11px] tabular-nums">
            {prompt.length > 0 ? (
              <>
                {prompt.length.toLocaleString()} / {MAX_LENGTH.toLocaleString()}
              </>
            ) : (
              "Enter to generate · Shift+Enter for a new line"
            )}
          </p>
          <LoadingButton
            className="rounded-full px-4"
            size="sm"
            isLoading={submitting}
            onClick={onSubmit}
          >
            <ArrowUp className="size-4" aria-hidden="true" />
            Generate
          </LoadingButton>
        </div>
      </div>
      <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2">
        <span className="text-muted-foreground/80 mr-0.5 inline-flex items-center gap-1 text-[11px] font-medium tracking-wide uppercase">
          <Sparkles className="text-primary/70 size-3" aria-hidden="true" />
          Try
        </span>
        {quickPrompts.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => onPromptChange(item.prompt)}
            className="border-border/80 bg-card/60 text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-primary rounded-full border px-3 py-1 text-xs font-medium shadow-sm backdrop-blur transition-colors"
          >
            {item.label}
          </button>
        ))}
      </div>
    </section>
  );
}
