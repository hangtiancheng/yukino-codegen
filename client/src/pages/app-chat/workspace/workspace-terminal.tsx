import "@xterm/xterm/css/xterm.css";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef, type ReactNode } from "react";
import { catppuccinXtermTheme } from "./catppuccin-theme";
import { useWorkspace } from "./workspace-context";

/**
 * Integrated `jsh` terminal. It wires the workspace shell to a single xterm
 * surface, keeps the fit addon in sync through a ResizeObserver, and blocks
 * input while the agent is running so its writes are not disturbed.
 */
export function WorkspaceTerminal(): ReactNode {
  const workspace = useWorkspace();
  const attachTerminal = workspace.attachTerminal;
  const containerRef = useRef<HTMLDivElement>(null);
  const agentRunningRef = useRef(workspace.agentRunning);

  useEffect(() => {
    agentRunningRef.current = workspace.agentRunning;
  }, [workspace.agentRunning]);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    const term = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontSize: 12,
      fontFamily:
        '"Geist Mono Variable", ui-monospace, SFMono-Regular, Menlo, monospace',
      theme: catppuccinXtermTheme(),
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);

    const safeFit = (): void => {
      try {
        fitAddon.fit();
      } catch {
        // The container has no size yet (Code tab hidden).
      }
    };
    safeFit();

    const handle = attachTerminal({
      cols: term.cols,
      rows: term.rows,
      onOutput: (chunk) => term.write(chunk),
    });

    const dataSubscription = term.onData((data) => {
      if (agentRunningRef.current) return;
      handle.write(data);
    });

    const observer = new ResizeObserver(() => {
      safeFit();
      handle.resize(term.cols, term.rows);
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      dataSubscription.dispose();
      handle.dispose();
      term.dispose();
    };
  }, [attachTerminal]);

  return (
    <div className="bg-ctp-base relative h-full min-h-0">
      <div ref={containerRef} className="h-full min-h-0 w-full p-1" />
      {workspace.agentRunning ? (
        <div className="text-muted-foreground bg-ctp-base/60 absolute inset-0 flex items-center justify-center text-xs">
          Terminal paused while the agent is running…
        </div>
      ) : null}
    </div>
  );
}
