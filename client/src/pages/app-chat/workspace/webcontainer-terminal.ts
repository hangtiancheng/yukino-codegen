import type { WebContainer } from "@webcontainer/api";

/** A single interactive `jsh` shell bound to one xterm surface. */
export type ShellSession = {
  readonly write: (data: string) => void;
  readonly resize: (cols: number, rows: number) => void;
  readonly dispose: () => void;
};

export type ShellDimensions = {
  readonly cols: number;
  readonly rows: number;
};

/**
 * Spawn the WebContainer `jsh` shell with a single stdin writer and stream its
 * output to the provided callback. The returned session owns the one writer and
 * kills the process on {@link ShellSession.dispose | dispose}.
 */
export async function startShellSession(
  container: WebContainer,
  dimensions: ShellDimensions,
  onOutput: (chunk: string) => void,
): Promise<ShellSession> {
  const process = await container.spawn("jsh", {
    terminal: { cols: dimensions.cols, rows: dimensions.rows },
  });
  const writer = process.input.getWriter();
  let disposed = false;

  void process.output
    .pipeTo(
      new WritableStream<string>({
        write: (chunk) => {
          if (!disposed) onOutput(chunk);
        },
      }),
    )
    .catch(() => undefined);

  return {
    write: (data) => {
      if (disposed) return;
      void writer.write(data).catch(() => undefined);
    },
    resize: (cols, rows) => {
      if (disposed) return;
      try {
        process.resize({ cols, rows });
      } catch {
        // The process may have exited between a resize observer tick and here.
      }
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      try {
        writer.releaseLock();
      } catch {
        // Ignore a release failure while a write is in flight.
      }
      process.kill();
    },
  };
}
