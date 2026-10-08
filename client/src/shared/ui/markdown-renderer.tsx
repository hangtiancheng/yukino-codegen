import { useMemo, type ReactNode } from "react";
import { cn } from "cn";
import { renderSafeMarkdown } from "./render-safe-markdown";

export type MarkdownRendererProps = {
  readonly content: string;
  readonly className?: string;
};

export function MarkdownRenderer({
  content,
  className,
}: MarkdownRendererProps): ReactNode {
  const html = useMemo(() => renderSafeMarkdown(content), [content]);

  return (
    <div
      className={cn(
        "markdown-content text-foreground text-sm leading-6",
        "[&_a]:text-primary [&_a]:font-medium [&_a]:underline-offset-4 hover:[&_a]:underline",
        "[&_blockquote]:border-primary/30 [&_blockquote]:bg-primary/5 [&_blockquote]:my-3 [&_blockquote]:border-l-4 [&_blockquote]:py-1.5 [&_blockquote]:pl-4",
        "[&_code]:bg-secondary [&_code]:rounded [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]",
        "[&_h1]:border-border [&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:border-b [&_h1]:pb-1.5 [&_h1]:text-xl [&_h1]:font-semibold",
        "[&_h2]:border-border [&_h2]:mt-4 [&_h2]:mb-1.5 [&_h2]:border-b [&_h2]:pb-1.5 [&_h2]:text-lg [&_h2]:font-semibold",
        "[&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:text-base [&_h3]:font-semibold",
        "[&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_p]:first:mt-0 [&_p]:last:mb-0 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
        "[&_pre]:border-border [&_pre]:bg-secondary [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:p-3",
        "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
        "[&_td]:border-border [&_th]:border-border [&_th]:bg-secondary [&_td]:border [&_td]:px-3 [&_td]:py-2 [&_th]:border [&_th]:px-3 [&_th]:py-2 [&_th]:text-left",
        "[&_.token.keyword]:text-primary [&_.token.string]:text-sky-700",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
