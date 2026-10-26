import { type Conversation, type LLM, Memory, Utils } from "@yukino.js/yukino";

export type MemoryVo = Readonly<{
  name: string;
  description: string;
  type: string;
  path: string;
}>;

export const createMemoryRuntime = (
  workDir: string,
): Readonly<{
  clear: () => void;
  list: () => MemoryVo[];
  manager: Memory.Manager.MemoryManager;
}> => {
  const manager = new Memory.Manager.MemoryManager(workDir);

  const list = (): MemoryVo[] =>
    manager.loadAll().map((file) => ({
      description: file.description,
      name: file.name,
      path: file.path,
      type: file.type,
    }));

  const clear = (): void => {
    manager.clear();
  };

  return { clear, list, manager };
};

/**
 * Incremental background memory maintenance, mirroring the library's
 * BackgroundMemoryTasks (which the package barrel does not export). A cursor
 * tracks the last extracted message so each pass summarizes only the new
 * conversation tail instead of re-extracting the same window every turn, and
 * dispose() settles in-flight LLM calls so they never outlive the runtime.
 */
export type MemoryMaintenanceTasks = Readonly<{
  run: (conversation: Conversation.ConversationManager) => void;
  dispose: () => Promise<void>;
}>;

export const createMemoryMaintenanceTasks = (
  client: LLM.Client.LLMClient,
  workDir: string,
  appendSystem: (message: string) => void,
): MemoryMaintenanceTasks => {
  const extractor = new Memory.Extractor.MemoryExtractor(client, workDir);
  let disposed = false;
  const consolidator = new Memory.Consolidation.MemoryConsolidator(client, workDir, {
    appendSystem: (message) => {
      if (!disposed) appendSystem(message);
    },
  });
  let cursor: Conversation.Message | undefined;
  let pending: Conversation.Message[] | null = null;
  let completion: Promise<void> | null = null;

  const drain = async (): Promise<void> => {
    while (pending !== null && !disposed) {
      const messages = pending;
      pending = null;
      const start = cursor !== undefined ? messages.indexOf(cursor) + 1 : 0;
      if (messages.length - start < Memory.Constants.MIN_EXTRACT_MESSAGES) continue;
      const summary = messages
        .slice(Math.max(start, messages.length - Memory.Constants.EXTRACT_SUMMARY_WINDOW))
        .map((message) => `[${message.role}]: ${Utils.contentToText(message.content)}`)
        .filter((line) => line.length > Memory.Constants.MIN_SUMMARY_LINE_CHARS)
        .join("\n");
      try {
        await extractor.extract(summary);
        if (disposed) return;
        cursor = messages.at(-1);
      } catch {
        // Extraction is best-effort; the cursor stays put so the next pass
        // retries the same window.
      }
    }
  };

  const startDrain = (): void => {
    completion = drain().finally(() => {
      completion = null;
      if (pending !== null && !disposed) startDrain();
    });
  };

  return {
    dispose: async () => {
      disposed = true;
      pending = null;
      await Promise.all([extractor.dispose(), consolidator.dispose(), completion]);
    },
    run: (conversation) => {
      if (disposed) return;
      pending = conversation.getMessages();
      if (completion === null) startDrain();
      consolidator.maybeRun().catch(() => undefined);
    },
  };
};
