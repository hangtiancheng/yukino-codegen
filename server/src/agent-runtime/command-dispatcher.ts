import { Commands } from "@yukino.js/yukino";

export type CommandCandidate = Readonly<{
  name: string;
  description: string;
  aliases: readonly string[];
  type: string;
}>;

/** Server-specific commands absent from the library registry. */
const SERVER_ONLY_COMMANDS: readonly CommandCandidate[] = [
  {
    aliases: [],
    description: "Activate a skill (/skill <name> [args]) or reload the catalog (/skill reload)",
    name: "skill",
    type: "prompt",
  },
];

/**
 * Lists only the commands the server runtime actually executes, so the
 * composer autocomplete never suggests a command that would be rejected.
 */
export const buildCommandCandidates = (): CommandCandidate[] => {
  const registry = Commands.Commands.createDefaultRegistry();
  for (const command of Commands.Loader.loadUserCommands()) {
    if (registry.find(command.name) === undefined) registry.register(command);
  }
  const supported = registry
    .listCommands()
    .filter((command) => SERVER_SUPPORTED_COMMANDS.has(command.name))
    .map((command) => ({
      aliases: [],
      description: command.description,
      name: command.name,
      type: command.type,
    }));
  return [...supported, ...SERVER_ONLY_COMMANDS];
};

export type ParsedCommand = Readonly<{ name: string; args: string }>;

export const parseCommand = (input: string): ParsedCommand | null => Commands.Commands.parse(input);

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
  // Remote parity additions
  "goal",
  "plan",
  "model",
  "thinking",
  "sandbox",
  "worktree",
  // Library /review prompt command (built-in review subagent).
  "review",
]);

export const isSkillCommand = (name: string): boolean => name === "skill";
