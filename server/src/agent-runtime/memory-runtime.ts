import { Memory } from "@yukino.js/yukino";

export type MemoryVo = Readonly<{
  name: string;
  description: string;
  type: string;
  path: string;
}>;

/**
 * Reads and clears long-term memory files for a workspace directory via the
 * public MemoryManager. `clear()` deletes the on-disk memory files.
 */
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
