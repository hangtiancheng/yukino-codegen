import { Commands } from "@yukino.js/yukino";

export type CommandCandidate = Readonly<{
  name: string;
  description: string;
  aliases: readonly string[];
  type: string;
}>;

/**
 * Builds the slash-command autocomplete list from the default registry plus any
 * user/project commands under `.yukino/commands`. Conflicts are skipped, mirroring
 * the CLI loader semantics.
 */
export const buildCommandCandidates = (workDir: string): CommandCandidate[] => {
  const registry = Commands.Commands.createDefaultRegistry();
  for (const command of Commands.Loader.loadUserCommands(workDir)) {
    if (!registry.hasConflict(command)) registry.register(command);
  }
  return registry.listCommands().map((command) => ({
    aliases: command.aliases,
    description: command.description,
    name: command.name,
    type: command.type,
  }));
};

export type ParsedCommand = Readonly<{ name: string; args: string }>;

export const parseCommand = (input: string): ParsedCommand | null =>
  Commands.Commands.parse(input);

/**
 * Commands the server can execute reliably against the in-process agent stack.
 * Anything else resolves to an explicit `unsupported` command_result rather than
 * failing silently — the `/skill` family is rewritten into an agent turn.
 */
export const SERVER_SUPPORTED_COMMANDS = new Set([
  "help",
  "status",
  "clear",
  "compact",
  "skills",
  "skill",
  "memory",
  "mcp",
  "rewind",
]);

/** Normalizes `/skill reload` → `/skills reload` and `/skill x` → activation. */
export const isSkillCommand = (name: string): boolean => name === "skill";
