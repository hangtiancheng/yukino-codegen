import type { WebContainer } from "@webcontainer/api";

export type ShellSession = {
  readonly write: (data: string) => void;
  readonly resize: (cols: number, rows: number) => void;
  readonly dispose: () => void;
};

export type ShellDimensions = {
  readonly cols: number;
  readonly rows: number;
};

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
      } catch {}
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      try {
        writer.releaseLock();
      } catch {}
      process.kill();
    },
  };
}
