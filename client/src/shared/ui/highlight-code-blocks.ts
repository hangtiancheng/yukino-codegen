const supportedLanguages = new Set([
  "bash",
  "css",
  "html",
  "java",
  "javascript",
  "js",
  "jsx",
  "json",
  "markdown",
  "python",
  "sh",
  "shell",
  "sql",
  "ts",
  "tsx",
  "typescript",
  "xml",
  "yaml",
]);

const keywordPattern =
  /\b(async|await|class|const|def|export|from|function|import|interface|let|public|return|select|type|where)\b/g;

export function highlightCodeBlocks(html: string): string {
  if (typeof document === "undefined") return html;
  const template = document.createElement("template");
  template.innerHTML = html;
  for (const code of template.content.querySelectorAll("pre code")) {
    const language = getLanguage(code.className);
    const pre = code.parentElement;
    if (pre) {
      pre.dataset.language = language ?? "text";
    }
    code.innerHTML = highlightCode(code.textContent ?? "", language);
  }
  return template.innerHTML;
}

function getLanguage(className: string): string | undefined {
  const classes = className.split(/\s+/);
  const languageClass = classes.find((value) => value.startsWith("language-"));
  const language = languageClass?.replace("language-", "");
  if (language === undefined) return undefined;
  return supportedLanguages.has(language) ? language : undefined;
}

function highlightCode(code: string, language: string | undefined): string {
  const escaped = escapeHtml(code);
  if (language === undefined) return escaped;
  if (language === "json") {
    return escaped.replace(
      /(&quot;[^&]+?&quot;)(\s*:)?/g,
      '<span class="token string">$1</span>$2',
    );
  }
  return escaped.replace(
    keywordPattern,
    '<span class="token keyword">$1</span>',
  );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
