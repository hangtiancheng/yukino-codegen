import DOMPurify from "dompurify";
import { marked } from "marked";
import { highlightCodeBlocks } from "./highlight-code-blocks";

export function renderSafeMarkdown(content: string): string {
  const rawHtml = marked.parse(content, {
    async: false,
    gfm: true,
    breaks: true,
  });
  if (typeof rawHtml !== "string") {
    return "";
  }
  const safeHtml = DOMPurify.sanitize(rawHtml, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["script", "style"],
  });
  return highlightCodeBlocks(safeHtml);
}
