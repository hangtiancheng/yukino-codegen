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

/** Terminal-only library commands the server runtime never executes. */
export const TERMINAL_ONLY_COMMANDS = new Set([
  "login",
  "provider",
  "quit",
  "feedback",
  "resume",
  "session",
]);

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
  "workflows",
  // Library /review prompt command (built-in review subagent).
  "review",
]);

/**
 * Whether the server runtime can execute a registry command: the explicit
 * server-supported set, or any prompt/skill-fork/local command the library
 * registry provides (ultracode, user commands, named workflows, direct skill
 * invocations). Terminal-only commands stay rejected.
 */
export const isExecutableCommand = (command: Commands.Commands.Command): boolean => {
  if (SERVER_SUPPORTED_COMMANDS.has(command.name)) return true;
  if (TERMINAL_ONLY_COMMANDS.has(command.name)) return false;
  return command.type === "prompt" || command.type === "skill_fork" || command.type === "local";
};

const createFallbackRegistry = (): Commands.Commands.CommandRegistry => {
  const registry = Commands.Commands.createDefaultRegistry();
  for (const command of Commands.Loader.loadUserCommands()) {
    if (registry.find(command.name) === undefined) registry.register(command);
  }
  return registry;
};

/**
 * Lists only the commands the server runtime actually executes, so the
 * composer autocomplete never suggests a command that would be rejected.
 * Pass the live handle registry to include workspace-specific commands
 * (named workflows); skill-derived commands stay discoverable through
 * /skills (Remote /help parity).
 */
export const buildCommandCandidates = (
  registry: Commands.Commands.CommandRegistry = createFallbackRegistry(),
): CommandCandidate[] => {
  const supported = registry
    .listCommands()
    .filter((command) => command.isSkill !== true && isExecutableCommand(command))
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

export const isSkillCommand = (name: string): boolean => name === "skill";
