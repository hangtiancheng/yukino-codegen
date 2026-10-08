import { CodeXml, Sprout } from "lucide-react";
import { type ReactNode } from "react";

export function GlobalFooter(): ReactNode {
  return (
    <footer className="border-border/70 mt-auto border-t py-4">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-4 text-xs sm:flex-row md:px-6">
        <div className="text-muted-foreground flex items-center gap-1.5">
          <Sprout className="text-primary size-3.5" aria-hidden="true" />
          <span className="font-medium">Yukino Codegen</span>
          <span className="text-muted-foreground/60">·</span>
          <span>© {new Date().getFullYear()}</span>
        </div>
        <a
          href="https://github.com/hangtiancheng/yukino-codegen"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-primary inline-flex items-center gap-1.5 font-medium transition-colors"
        >
          <CodeXml className="size-3.5" aria-hidden="true" />
          GitHub
        </a>
      </div>
    </footer>
  );
}
